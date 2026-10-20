"use client";

// "모름" checkbox beside a date field (구매일, 독서 날짜).
export function UnknownToggle({ checked, onChange, label = "모름" }: { checked: boolean; onChange: (checked: boolean) => void; label?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-[12px] text-muted">
      <input type="checkbox" className="size-3.5 accent-accent" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
