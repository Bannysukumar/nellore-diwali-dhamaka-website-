export function UpiAppButton({
  name,
  short,
  color,
  hint,
  onClick,
}: {
  name: string;
  short: string;
  color: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-paper p-2 text-center transition hover:border-gold hover:shadow-sm active:scale-[0.98]"
    >
      <span
        className="grid size-10 place-items-center rounded-xl text-[13px] font-bold text-white"
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {short}
      </span>
      <span className="text-[11.5px] font-semibold leading-tight text-ink">{name}</span>
      {hint ? <span className="text-[10px] leading-tight text-muted">{hint}</span> : null}
    </button>
  );
}
