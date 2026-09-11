import { hashText } from '@/lib/clip-cache';

const PALETTES = [
  ['#7c3aed', '#c026d3'], ['#0ea5e9', '#6366f1'], ['#f59e0b', '#ef4444'], ['#10b981', '#0ea5e9'],
  ['#ec4899', '#8b5cf6'], ['#f97316', '#eab308'], ['#14b8a6', '#22c55e'], ['#6366f1', '#ec4899'],
];

/** Deterministic cover art from the title: gradient + big initials + title/author. */
export default function BookCover({
  title,
  author,
  className,
  size = 'md',
}: {
  title: string;
  author?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [a, b] = PALETTES[parseInt(hashText(title), 36) % PALETTES.length];
  const initials = title
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  const dims = size === 'sm' ? 'h-14 w-10' : size === 'lg' ? 'h-64 w-44' : 'h-40 w-28';
  const font = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-4xl' : 'text-2xl';
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md shadow-[0_8px_20px_rgba(0,0,0,.45)] ring-1 ring-white/15 ${dims} ${className ?? ''}`}
      style={{ background: `linear-gradient(160deg, ${a}, ${b})` }}
      aria-hidden
    >
      <div className="absolute inset-y-0 left-0 w-1.5 bg-black/30" />
      <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center text-white">
        <span className={`font-serif font-semibold drop-shadow ${font}`}>{initials || '📖'}</span>
        {size !== 'sm' && (
          <>
            <span className="mt-2 line-clamp-2 text-[10px] font-medium leading-tight opacity-95">{title}</span>
            {author && <span className="mt-0.5 line-clamp-1 text-[9px] italic opacity-80">{author}</span>}
          </>
        )}
      </div>
    </div>
  );
}
