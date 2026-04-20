import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const { pathname } = request.nextUrl;

  // DEV_SKIP_AUTH — local preview bypass. Hard-gated to non-production.
  // Matches the bypass in src/lib/auth.ts::getDevBypassPayload.
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.DEV_SKIP_AUTH === 'true'
  ) {
    return NextResponse.next();
  }

  // Public routes that don't need authentication
  const publicRoutes = ['/login', '/api/auth/login'];
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // If no token and trying to access protected route, redirect to login
  if (!token && (pathname.startsWith('/admin') || pathname.startsWith('/portal'))) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/portal/:path*'],
};
