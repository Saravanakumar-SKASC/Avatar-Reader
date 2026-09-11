import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isLocalMode, SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

const PROTECTED_PREFIXES = ['/', '/upload', '/read', '/library', '/bookmarks', '/history', '/settings', '/subscriptions'];
const PROFILE_COOKIE = 'ar-profile';

/** Refreshes the auth cookie on every request and gates the reader pages behind sign-in. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (isLocalMode()) {
    // Local mode: a lightweight reader profile (cookie set by /login) gates the app.
    const { pathname } = request.nextUrl;
    const hasProfile = !!request.cookies.get(PROFILE_COOKIE)?.value;
    const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || (p !== '/' && pathname.startsWith(p + '/')));
    if (!hasProfile && isProtected) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
    if (hasProfile && pathname === '/login') {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return response;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() validates the JWT with Supabase (getSession() would trust the cookie blindly).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || (p !== '/' && pathname.startsWith(p + '/')));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}
