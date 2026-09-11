import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isLocalMode } from '@/lib/supabase/env';
import AppShell from '@/components/app/AppShell';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (isLocalMode()) {
    if (!cookies().get('ar-profile')?.value) redirect('/login');
    return <AppShell>{children}</AppShell>;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <AppShell>{children}</AppShell>;
}
