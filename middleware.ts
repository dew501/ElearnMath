import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // 1. Jika rute privat diakses tanpa login
  if (!user && (path.startsWith('/siswa') || path.startsWith('/guru'))) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. Cek Role jika user terotentikasi
  if (user) {
    const { data: profile } = await supabase
      .from('users')
      .select('role, status_approval')
      .eq('id', user.id)
      .single();

    const role = profile?.role ?? 'siswa';

    if (path === '/login') {
      return NextResponse.redirect(
        new URL(role === 'guru' ? '/guru/koreksi' : '/siswa/materi/1', request.url)
      );
    }

    if (path.startsWith('/guru') && role !== 'guru' && role !== 'admin') {
      return NextResponse.redirect(new URL('/siswa/materi/1', request.url));
    }

    if (path.startsWith('/siswa') && role === 'guru') {
      return NextResponse.redirect(new URL('/guru/koreksi', request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
