'use client';

import { useState } from 'react';
import { AVATARS } from '@/lib/avatars';
import type { Avatar, AvatarId } from '@/types/avatar';

function Thumbnail({ avatar, selected }: { avatar: Avatar; selected: boolean }) {
  const [missing, setMissing] = useState(false);
  const ring = selected ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-black/60 shadow-[0_0_18px_rgba(52,211,153,.55)]' : 'ring-1 ring-white/10';
  if (missing) {
    return (
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold text-white transition ${ring}`}
        style={{ backgroundColor: avatar.color }}
      >
        {avatar.name[0]}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatar.thumbnailUrl}
      alt=""
      className={`h-12 w-12 rounded-full object-cover transition ${ring}`}
      onError={() => setMissing(true)}
    />
  );
}

export default function AvatarPicker({
  selectedId,
  onSelect,
}: {
  selectedId: AvatarId;
  onSelect: (id: AvatarId) => void;
}) {
  return (
    <div className="flex max-w-full gap-1 overflow-x-auto px-1 py-1" role="radiogroup" aria-label="Narrator">
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
            className={`flex w-16 shrink-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition ${
              selected ? 'bg-white/10' : 'hover:bg-white/5'
            }`}
          >
            <Thumbnail avatar={a} selected={selected} />
            <span className={`text-[11px] leading-none ${selected ? 'text-white' : 'text-gray-400'}`}>{a.name}</span>
          </button>
        );
      })}
    </div>
  );
}
