import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  // Check auth from cookies
  const token = req.cookies.get('auth-token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify token is valid
  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  const path = '/' + params.path.join('/');
  const ROBOT_URL = process.env.ROBOT_SERVICE_URL || 'http://localhost:8080';

  try {
    const res = await fetch(`${ROBOT_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Robot service unreachable', details: e.message },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const token = req.cookies.get('auth-token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify token is valid
  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  // For control operations (enable, disable, stop, etc.), verify admin role
  const path = '/' + params.path.join('/');
  const controlOps = ['/disable', '/enable', '/stop', '/clear-alarm', '/startup', '/connect', '/disconnect'];
  if (controlOps.some((op) => path.includes(op)) && payload.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden: Admin access required for control operations' },
      { status: 403 }
    );
  }

  const ROBOT_URL = process.env.ROBOT_SERVICE_URL || 'http://localhost:8080';
  const contentType = req.headers.get('content-type') || 'application/json';

  try {
    let body: string;
    if (contentType.includes('application/json')) {
      body = JSON.stringify(await req.json());
    } else {
      body = await req.text();
    }

    const res = await fetch(`${ROBOT_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body,
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Robot service unreachable', details: e.message },
      { status: 503 }
    );
  }
}
