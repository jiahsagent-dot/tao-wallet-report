import { redirect } from 'next/navigation';

// The Tao app's primary entry point is now the Personalised Report tab. The
// homepage redirects there so old links + bookmarks land on the new shell.
export default function HomePage() {
  redirect('/personalised-report');
}
