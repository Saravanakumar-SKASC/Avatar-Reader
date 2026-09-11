'use client';

import { useEffect, useRef, useState } from 'react';
import { AVATARS } from '@/lib/avatars';
import type { Avatar, AvatarId } from '@/types/avatar';
import { ChevronIcon } from '@/components/app/icons';

function Thumbnail({ avatar, selected }: { avatar: Avatar; selected: boolean }) {
  const [missing, setMissing] = useState(false);
  const ring = selected
    ? 'ring-2 ring-violet-300 shadow-[0_0_22px_rgba(167,139,250,.65)]'
    : 'ring-1 ring-white/10 group-hover:ring-white/30';
  if (missing) {
    return (
      <div className={`flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold text-white transition ${ring}`} style={{ backgroundColor: avatar.color }}>
        {avatar.name[0]}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatar.thumbnailUrl} alt="" className={`h-14 w-14 rounded-full object-cover transition ${ring}`} onError={() => setMissing(true)} />
  );
}

export default function AvatarPicker({ selectedId, onSelect }: { selectedId: AvatarId; onSelect: (id: AvatarId) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () =>
      setEdges({ start: el.scrollLeft > 4, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  const nudge = (dir: -1 | 1) => scroller.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={() => nudge(-1)}
        aria-label="Previous narrators"
        className={`absolute left-0 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 ${edges.start ? '' : 'pointer-events-none opacity-0'}`}
      >
        <ChevronIcon dir="left" width={16} height={16} />
      </button>

      <div ref={scroller} className="no-scrollbar flex gap-2 overflow-x-auto scroll-smooth px-9" role="radiogroup" aria-label="Choose your avatar">
        {AVATARS.map((a) => {
          const selected = a.id === selectedId;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={selected}
              title={`${a.name} · ${a.personality}`}
              onClick={() => onSelect(a.id)}
              className={`group flex w-[88px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-2 py-2.5 transition ${
                selected ? 'border-violet-400/60 bg-violet-500/15' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.07]'
              }`}
            >
              <Thumbnail avatar={a} selected={selected} />
              <span className={`text-xs font-medium leading-none ${selected ? 'text-white' : 'text-violet-100/80'}`}>{a.name}</span>
              <span className="text-[10px] leading-none text-violet-200/50">{a.personality}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => nudge(1)}
        aria-label="More narrators"
        className={`absolute right-0 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70 ${edges.end ? '' : 'pointer-events-none opacity-0'}`}
      >
        <ChevronIcon dir="right" width={16} height={16} />
      </button>
    </div>
  );
}
