// Legacy — moved to /api/stations on 2026-04-13. `git rm -r src/app/api/jobs` locally.
import { NextResponse } from 'next/server';
const gone = () => NextResponse.json({ error: 'Moved to /api/stations', migratedOn: '2026-04-13' }, { status: 410 });
export const GET = gone;
export const POST = gone;
export const PATCH = gone;
export const PUT = gone;
export const DELETE = gone;
