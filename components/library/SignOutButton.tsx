'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <button type="button" onClick={signOut} className="text-xs text-gray-400 underline hover:text-white">
      Sign out
    </button>
  );
}
