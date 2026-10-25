import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { alasanTolak, berandaUntuk } from '@/lib/akses';

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

  // Redirect tetap membawa cookie sesi yang mungkin baru diperbarui.
  const redirectTo = (target: string) => {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const rutePrivat = path.startsWith('/siswa') || path.startsWith('/guru') || path.startsWith('/admin');

  // 1. Rute privat tanpa login
  if (!user) {
    return rutePrivat ? redirectTo('/login') : response;
  }

  // Profil hanya perlu dicek untuk rute privat & halaman login
  if (!rutePrivat && path !== '/login') {
    return response;
  }

  // 2. Akun harus terdaftar di public.users dan sudah disetujui admin
  const { data: profile } = await supabase
    .from('users')
    .select('role, status_approval')
    .eq('id', user.id)
    .maybeSingle();

  const alasan = alasanTolak(profile);
  if (alasan) {
    // Halaman login menampilkan alasannya lalu mengeluarkan sesi
    return path === '/login' ? response : redirectTo(`/login?status=${alasan}`);
  }

  // 3. Arahkan sesuai peran
  const role = profile!.role;
  const beranda = berandaUntuk(role);

  if (path === '/login') {
    return redirectTo(beranda);
  }

  if (path.startsWith('/guru') && role !== 'guru' && role !== 'admin') {
    return redirectTo(beranda);
  }

  if (path.startsWith('/admin') && role !== 'admin') {
    return redirectTo(beranda);
  }

  if (path.startsWith('/siswa') && role !== 'siswa') {
    return redirectTo(beranda);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
