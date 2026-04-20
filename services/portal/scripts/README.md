# Portal preview scripts

## `preview.mjs`

Boots `next dev` with `DEV_SKIP_AUTH=true`, drives headless Chromium via
Playwright, and screenshots a list of admin routes so Claude can visually
verify the UI from the sandbox.

### One-time setup (on whatever machine runs it)

```bash
cd services/portal
npm install
npm install --save-dev playwright
npx playwright install chromium
```

### Run it

```bash
# default route list (all major admin pages)
npm run preview

# specific routes
node scripts/preview.mjs /admin/people /admin/files
```

Output: `services/previews/<timestamp>/*.png` plus an `index.json` that lists
each route, the file path, and whether the capture succeeded.

### Env knobs

| Var | Default | Purpose |
| --- | --- | --- |
| `PREVIEW_PORT` | `3100` | Port for `next dev`. |
| `PREVIEW_OUT_DIR` | auto | Override output folder. |
| `DEV_ADMIN_ID` / `DEV_ADMIN_EMAIL` / `DEV_ADMIN_NAME` | fake | Override the synthetic admin returned by the bypass. |

### DEV_SKIP_AUTH bypass

See `src/lib/auth.ts::getDevBypassPayload`. When `NODE_ENV !== 'production'`
and `DEV_SKIP_AUTH=true`, all admin guards (`requireAdmin`, middleware,
`/api/auth/me`) short-circuit and return a fake admin. Hard-gated — it's a
no-op on Vercel production.
