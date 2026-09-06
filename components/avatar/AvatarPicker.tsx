'use client';

import { useState } from 'react';
import { AVATARS } from '@/lib/avatars';
import type { Avatar, AvatarId } from '@/types/avatar';

function Thumbnail({ avatar }: { avatar: Avatar }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-semibold text-white"
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
      alt={avatar.name}
      className="h-16 w-16 rounded-full object-cover"
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
    <div className="w-full max-w-3xl overflow-x-auto pb-2">
      <div className="flex w-max gap-3 px-1">
        {AVATARS.map((a) => {
          const selected = a.id === selectedId;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a.id)}
              aria-pressed={selected}
              className={`flex w-28 shrink-0 flex-col items-center gap-2 rounded-xl border-2 p-3 transition ${
                selected
                  ? 'border-emerald-400 bg-white/10'
                  : 'border-transparent bg-white/5 hover:bg-white/10'
              }`}
            >
              <Thumbnail avatar={a} />
              <span className="text-sm font-medium">{a.name}</span>
              <span className="text-xs text-gray-400">{a.personality}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
