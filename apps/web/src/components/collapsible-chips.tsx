'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Hàng chip tự xuống dòng (không cuộn ngang). Mặc định chỉ hiện `rows` dòng đầu, có nút "Xem tất cả".
 * Chip đang chọn (aria-current="true") nằm ở phần bị ẩn thì tự mở sẵn.
 */
export function CollapsibleChips({ children, rows = 2, moreLabel = 'Xem tất cả' }: { children: ReactNode; rows?: number; moreLabel?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  // chip text-xs py-1 có viền ≈ 26px, gap-2 = 8px
  const maxHeight = rows * 26 + (rows - 1) * 8;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollHeight > maxHeight + 2);
    check();
    const active = el.querySelector<HTMLElement>('[aria-current="true"]');
    if (active && active.offsetTop + active.offsetHeight > maxHeight + 2) setOpen(true);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxHeight]);

  return (
    <div>
      <div
        ref={ref}
        className="relative flex flex-wrap gap-2 overflow-hidden"
        style={open ? undefined : { maxHeight }}
        // Dùng bàn phím tab tới chip đang bị ẩn thì mở ra
        onFocus={(e) => {
          if (!open && e.target.offsetTop >= maxHeight) setOpen(true);
        }}
      >
        {children}
      </div>
      {overflow && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-xs font-medium text-accent hover:underline">
          {open ? 'Thu gọn ▴' : `${moreLabel} ▾`}
        </button>
      )}
    </div>
  );
}
