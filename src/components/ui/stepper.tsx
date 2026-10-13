"use client";

export function Stepper(props: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  const min = props.min ?? 0;
  const max = props.max ?? 50;
  const btn =
    "flex h-11 w-11 items-center justify-center rounded-full border border-stone-300 bg-white text-xl text-ink disabled:opacity-30";

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-ink">{props.label}</p>
        {props.hint && <p className="text-sm text-stone-500">{props.hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          className={btn}
          aria-label={`Fewer: ${props.label}`}
          disabled={props.value <= min}
          onClick={() => props.onChange(Math.max(min, props.value - 1))}
        >
          −
        </button>
        <span className="w-6 text-center text-lg tabular-nums" aria-live="polite">
          {props.value}
        </span>
        <button
          type="button"
          className={btn}
          aria-label={`More: ${props.label}`}
          disabled={props.value >= max}
          onClick={() => props.onChange(Math.min(max, props.value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}
