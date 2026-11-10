'use client';

interface Props {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
  size?: 'sm' | 'md';
}

export function QuantityStepper({ value, onChange, min = 1, max = 50, label, size = 'md' }: Props) {
  const btn =
    size === 'sm'
      ? 'h-8 w-8 text-lg'
      : 'h-11 w-11 text-xl';
  return (
    <div className="flex items-center rounded-full border border-line bg-surface-2" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={`Diminuir ${label}`}
        className={`${btn} rounded-full font-semibold text-gold disabled:text-line`}
      >
        −
      </button>
      <span className="min-w-6 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label={`Aumentar ${label}`}
        className={`${btn} rounded-full font-semibold text-gold disabled:text-line`}
      >
        +
      </button>
    </div>
  );
}
