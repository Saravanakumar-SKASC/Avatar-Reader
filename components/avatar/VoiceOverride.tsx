'use client';

import { useState } from 'react';
import { fishVoiceOptions } from '@/lib/avatars';

const CUSTOM = '__custom__';

/**
 * Manual Fish Audio voice override. "" = use the selected avatar's own voice.
 * Any other value is a reference_id sent instead of the avatar's.
 */
export default function VoiceOverride({
  value,
  onChange,
}: {
  value: string;
  onChange: (referenceId: string) => void;
}) {
  const options = fishVoiceOptions();
  const isKnown = value === '' || options.some((o) => o.referenceId === value);
  const [custom, setCustom] = useState(!isKnown);

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
      <label htmlFor="voice-override" className="text-gray-400">
        Voice
      </label>
      <select
        id="voice-override"
        value={custom ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(e.target.value);
          }
        }}
        className="rounded bg-white/10 px-2 py-1"
      >
        <option value="">Avatar default</option>
        {options.map((o) => (
          <option key={o.referenceId} value={o.referenceId}>
            {o.label}
          </option>
        ))}
        <option value={CUSTOM}>Custom reference_id…</option>
      </select>
      {custom && (
        <input
          type="text"
          placeholder="paste Fish reference_id"
          value={value}
          onChange={(e) => onChange(e.target.value.trim())}
          className="w-64 rounded bg-white/10 px-2 py-1 font-mono text-xs"
          spellCheck={false}
        />
      )}
    </div>
  );
}
