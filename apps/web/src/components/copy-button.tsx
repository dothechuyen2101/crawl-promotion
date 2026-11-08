'use client';
import { useState } from 'react';

export function CopyButton({ text, label = 'Sao chép', className = '' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* trình duyệt chặn clipboard */
        }
      }}
      className={`rounded-md border border-dashed border-accent px-2 py-1 font-mono text-xs font-semibold text-accent hover:bg-accent-soft ${className}`}
      aria-label={`${label} ${text}`}
    >
      {done ? 'Đã chép ✓' : text}
    </button>
  );
}
