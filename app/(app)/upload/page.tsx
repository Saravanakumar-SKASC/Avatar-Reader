import { redirect } from 'next/navigation';

/** Upload lives in the Library and the reader now. Keep the old URL working. */
export default function UploadPage() {
  redirect('/library');
}
