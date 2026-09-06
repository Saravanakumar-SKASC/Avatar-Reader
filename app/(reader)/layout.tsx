import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isLocalMode } from '@/lib/supabase/env';
import LibrarySidebar from '@/components/library/LibrarySidebar';
import LocalLibrarySidebar from '@/components/library/LocalLibrarySidebar';
import ReaderShell from '@/components/library/ReaderShell';

export const dynamic = 'force-dynamic';

export default async function ReaderLayout({ children }: { children: React.ReactNode }) {
  if (isLocalMode()) {
    return <ReaderShell sidebar={<LocalLibrarySidebar />}>{children}</ReaderShell>;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  return <ReaderShell sidebar={<LibrarySidebar email={user.email ?? user.id} />}>{children}</ReaderShell>;
}
