/**
 * Turns a PDF filename into something that reads like a book title.
 * "005-SUNNY-MEADOWS-Free-Childrens-Book" → "Sunny Meadows Free Childrens Book"
 */
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

export function prettifyTitle(raw: string): string {
  let t = raw.replace(/\.pdf$/i, '');
  // Leading catalogue number, but only when real words follow (keeps "1706.03762v7" intact).
  t = t.replace(/^[\s_\-–—]*\d{1,4}[\s_\-–—.)]+(?=[A-Za-z])/, '');
  t = t.replace(/_+/g, ' ').replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return raw.replace(/\.pdf$/i, '');

  // Only re-case words whose casing carries no information (ALLCAPS or alllower).
  return t
    .split(' ')
    .map((w, i) => {
      if (/[a-z]/.test(w) && /[A-Z]/.test(w)) return w; // MixedCase is deliberate
      const lower = w.toLowerCase();
      if (i > 0 && SMALL.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/** True for a title that still looks like a raw filename, so older rows can be cleaned up once. */
export function looksLikeFilename(title: string): boolean {
  return /_/.test(title) || /[A-Za-z0-9]-[A-Za-z0-9]/.test(title) || /^\d{1,4}[-_. ]\s*[A-Za-z]/.test(title);
}
