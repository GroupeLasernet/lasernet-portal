#!/usr/bin/env node
/**
 * preview.mjs — sandbox-side UI preview for Claude
 *
 * What it does:
 *   1. Boots `next dev` on port $PREVIEW_PORT (default 3100) with DEV_SKIP_AUTH=true.
 *   2. Waits until the server is responsive.
 *   3. Launches headless Chromium via Playwright.
 *   4. Navigates a list of admin routes and writes a screenshot per route.
 *   5. Writes a short JSON index so Claude can Read the screenshot files afterward.
 *
 * Output dir: <repo-root>/previews/<timestamp>/  (absolute path is logged)
 *
 * Usage:
 *   node scripts/preview.mjs                       # default route list
 *   node scripts/preview.mjs /admin/people /admin/files   # specific routes
 *
 * Requires: Playwright + a Chromium install.
 *   npm i -D playwright
 *   npx playwright install chromium
 *
 * Env:
 *   PREVIEW_PORT       port to run next dev on (default 3100)
 *   PREVIEW_OUT_DIR    screenshot output dir (default auto)
 *   DEV_ADMIN_ID/EMAIL/NAME  override the fake admin (optional)
 *
 * NOTE: this script assumes DATABASE_URL and NEXTAUTH_SECRET are already
 * present in the environment (e.g. in .env.local). It does not inject them.
 */

import { spawn, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PORTAL_ROOT = resolve(__dirname, '..');

const DEFAULT_ROUTES = [
  '/admin',
  '/admin/people',
  '/admin/businesses',
  '/admin/quotes',
  '/admin/invoices',
  '/admin/inventory',
  '/admin/leads',
  '/admin/live-visits',
  '/admin/projects',
  '/admin/stations',
  '/admin/station-pcs',
  '/admin/machines',
  '/admin/training',
  '/admin/tickets',
  '/admin/files',
  '/admin/settings',
];

const PORT = Number(process.env.PREVIEW_PORT || 3100);
const ROUTES = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;

const runId = new Date().toISOString().replace(/[:.]/g, '-');
// PORTAL_ROOT is <repo>/services/portal → go up 2 to reach <repo>.
const REPO_ROOT = resolve(PORTAL_ROOT, '..', '..');
const OUT_DIR =
  process.env.PREVIEW_OUT_DIR ||
  resolve(REPO_ROOT, 'previews', runId);

async function waitForServer(url, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      /* still booting */
    }
    await sleep(500);
  }
  return false;
}

async function tryImportPlaywright() {
  try {
    return await import('playwright');
  } catch (err) {
    console.error('\n✗ Playwright is not installed.');
    console.error('  Install it once with:');
    console.error('    cd services/portal && npm i -D playwright');
    console.error('    npx playwright install chromium\n');
    process.exit(1);
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`\n▶ preview run → ${OUT_DIR}`);

  if (!existsSync(join(PORTAL_ROOT, 'node_modules'))) {
    console.error('✗ node_modules missing. Run `npm install` in services/portal first.');
    process.exit(1);
  }

  console.log(`▶ booting next dev on :${PORT} with DEV_SKIP_AUTH=true…`);
  // Windows quirk: Node 20+ refuses to spawn .cmd/.bat without `shell: true`
  // (CVE-2024-27980). Using `shell: true` on Windows routes through cmd.exe.
  const isWin = process.platform === 'win32';
  const devProc = spawn(
    isWin ? 'npm.cmd' : 'npm',
    ['run', 'dev', '--', '-p', String(PORT)],
    {
      cwd: PORTAL_ROOT,
      env: { ...process.env, DEV_SKIP_AUTH: 'true', PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: isWin,
    }
  );

  let serverLog = '';
  devProc.stdout.on('data', (chunk) => {
    const s = chunk.toString();
    serverLog += s;
    // Surface the "Ready" / "compiled" / port banner so the user sees progress
    if (/ready|compiled|listening|error/i.test(s)) process.stdout.write(`    ${s}`);
  });
  devProc.stderr.on('data', (chunk) => {
    serverLog += chunk.toString();
  });

  const cleanup = () => {
    if (devProc.killed || devProc.exitCode !== null) return;
    if (isWin && devProc.pid) {
      // `shell: true` on Windows means child is wrapped by cmd.exe — kill the tree.
      try { execSync(`taskkill /pid ${devProc.pid} /T /F`, { stdio: 'ignore' }); } catch {}
    } else {
      devProc.kill('SIGTERM');
    }
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(130); });

  const ready = await waitForServer(`http://127.0.0.1:${PORT}/`);
  if (!ready) {
    console.error('✗ dev server failed to respond within 90 s. Last log:');
    console.error(serverLog.slice(-4000));
    cleanup();
    process.exit(1);
  }
  console.log('✓ dev server is up');

  const { chromium } = await tryImportPlaywright();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const results = [];
  for (const route of ROUTES) {
    const url = `http://127.0.0.1:${PORT}${route}`;
    const safeName = route.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
    const file = join(OUT_DIR, `${safeName}.png`);
    console.log(`  → ${route}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
      await page.screenshot({ path: file, fullPage: true });
      results.push({ route, file, ok: true });
    } catch (err) {
      console.error(`    ✗ ${err.message}`);
      results.push({ route, file, ok: false, error: String(err.message || err) });
    }
  }

  await browser.close();
  cleanup();

  await writeFile(
    join(OUT_DIR, 'index.json'),
    JSON.stringify({ runId, port: PORT, routes: results }, null, 2)
  );

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n✓ captured ${okCount}/${results.length} routes`);
  console.log(`  ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
