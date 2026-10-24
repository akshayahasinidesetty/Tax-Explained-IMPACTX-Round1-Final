import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Demo mode remains available when the owner has not configured a backend.
  if (!url || !key) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && request.nextUrl.pathname.startsWith('/account')) {
    const target = request.nextUrl.clone();
    target.pathname = '/login';
    target.searchParams.set('next', '/account');
    return NextResponse.redirect(target);
  }
  if (user && ['/login', '/register'].includes(request.nextUrl.pathname)) {
    const target = request.nextUrl.clone(); target.pathname = '/account'; target.search = '';
    return NextResponse.redirect(target);
  }
  return response;
}
export const config = { matcher: ['/account/:path*', '/login', '/register'] };
