import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? 'app_session';

/**
 * First-pass route guard. It only checks for the presence of a session
 * cookie — cheap, and enough to keep unauthenticated users off protected
 * URLs. Real validation happens server-side on every page and API call, so a
 * forged cookie buys nothing.
 */
export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);

  if (pathname === '/login') {
    // A `reason` means the server already rejected this cookie; bouncing back
    // to `/` would loop forever, so drop the stale cookie and show the form.
    if (request.nextUrl.searchParams.has('reason')) {
      const response = NextResponse.next();
      response.cookies.delete(SESSION_COOKIE);
      return response;
    }
    if (hasSessionCookie) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (!hasSessionCookie) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
