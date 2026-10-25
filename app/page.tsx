import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { alasanTolak, berandaUntuk } from '@/lib/akses';

export default async function HomePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role, status_approval')
    .eq('id', user.id)
    .maybeSingle();

  const alasan = alasanTolak(profile);
  if (alasan) {
    redirect(`/login?status=${alasan}`);
  }

  redirect(berandaUntuk(profile!.role));
}
