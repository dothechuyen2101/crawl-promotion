import { PLATFORM_LABELS, type Platform } from '@cp/shared';
import { PLATFORM_STYLE } from '@/lib/format';

export function PlatformBadge({ platform, className = '' }: { platform: Platform; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${PLATFORM_STYLE[platform]} ${className}`}>
      {PLATFORM_LABELS[platform]}
    </span>
  );
}
