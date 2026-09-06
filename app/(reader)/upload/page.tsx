import { redirect } from 'next/navigation';

/** Upload now lives inside the reader. Keep the old URL working. */
export default function UploadPage() {
  redirect('/read/new');
}
