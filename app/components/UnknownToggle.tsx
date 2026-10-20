"use client";

// "모름" checkbox beside the 구매일 field.
export function UnknownToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1 text-[12px] text-muted">
      <input type="checkbox" className="size-3.5 accent-accent" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      모름
    </label>
  );
}
