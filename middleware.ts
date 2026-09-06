import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Everything except static assets and the avatar models/thumbnails.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|avatars/).*)'],
};
