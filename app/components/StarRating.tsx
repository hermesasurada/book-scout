"use client";

import { useState } from "react";

// Five stars in half steps. Read-only when onChange is omitted. Clicking the
// left half of a star gives x.5; clicking the current value clears it.
export function StarRating({
  value,
  onChange,
  size = 16,
  label = "별점",
}: {
  value: number | null | undefined;
  onChange?: (value: number | null) => void;
  size?: number;
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  const interactive = Boolean(onChange);

  return (
    <span
      className="inline-flex items-center"
      role={interactive ? "radiogroup" : "img"}
      aria-label={interactive ? label : value ? `${label} ${value}점` : `${label} 없음`}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = Math.max(0, Math.min(1, shown - (star - 1)));
        return (
          <span key={star} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="text-line-strong" />
            <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="text-warn" filled />
            </span>
            {interactive &&
              [star - 0.5, star].map((candidate, half) => (
                <button
                  key={candidate}
                  type="button"
                  role="radio"
                  aria-checked={value === candidate}
                  aria-label={`${candidate}점`}
                  className="absolute inset-y-0 cursor-pointer"
                  style={{ left: half ? "50%" : 0, width: "50%" }}
                  onMouseEnter={() => setHover(candidate)}
                  onFocus={() => setHover(candidate)}
                  onBlur={() => setHover(null)}
                  onClick={() => onChange?.(value === candidate ? null : candidate)}
                />
              ))}
          </span>
        );
      })}
    </span>
  );
}

function Star({ size, className, filled }: { size: number; className: string; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <path
        d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
