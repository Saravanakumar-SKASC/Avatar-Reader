'use client';

import { useRouter } from 'next/navigation';
import { OPEN_UPLOAD_EVENT } from '@/lib/events';

export default function UploadButton() {
  const router = useRouter();
  function onClick() {
    // If a reader is mounted it opens its drop-zone and cancels the event; otherwise navigate.
    const notHandled = window.dispatchEvent(new CustomEvent(OPEN_UPLOAD_EVENT, { cancelable: true }));
    if (notHandled) router.push('/read/new');
  }
  return (
    <button type="button" onClick={onClick} className="rounded bg-emerald-600 px-3 py-2 text-center text-sm font-medium hover:bg-emerald-500">
      + Upload PDF
    </button>
  );
}
