import React, { useState, useRef, useEffect } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';

interface NumberInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValueChange: (v: number) => void;
  onValueCommit?: (v: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
  showSteppers?: boolean;
}

// Number field that buffers the raw text while typing, so intermediate states
// like "", "0", "0.", "-" are allowed (the old parseFloat(x) || fallback pattern
// rejected a plain "0" and made "0.9" impossible to type). A valid parse is
// emitted live; on blur the text is normalized back to the last valid value.
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onValueChange,
  onValueCommit,
  min,
  max,
  integer = false,
  showSteppers = false,
  ...rest
}) => {
  const { t } = useI18n();
  const [text, setText] = useState(String(value));
  const lastEmitted = useRef(value);
  const step = typeof rest.step === 'number' ? rest.step : Number(rest.step ?? 1);

  // Sync from the outside (undo, import, programmatic change) without
  // clobbering the text mid-typing when the change originated here.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(String(value));
    }
  }, [value]);

  const clamp = (v: number) => {
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    if (integer) v = Math.round(v);
    return v;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);
    const parsed = parseFloat(raw);
    // Emit only complete, in-range numbers; partial input just stays in the buffer
    if (Number.isFinite(parsed) && clamp(parsed) === parsed) {
      lastEmitted.current = parsed;
      onValueChange(parsed);
    }
  };

  const handleBlur = () => {
    const parsed = parseFloat(text);
    if (Number.isFinite(parsed)) {
      const v = clamp(parsed);
      lastEmitted.current = v;
      onValueChange(v);
      setText(String(v));
      onValueCommit?.(v);
    } else {
      // Unparseable leftover ("", "-", "."): restore the last valid value
      setText(String(lastEmitted.current));
      onValueCommit?.(lastEmitted.current);
    }
  };

  const changeBy = (direction: -1 | 1) => {
    const current = Number.isFinite(value) ? value : lastEmitted.current;
    const increment = Number.isFinite(step) && step > 0 ? step : 1;
    const precision = Math.max(
      decimalPlaces(current),
      decimalPlaces(increment),
    );
    const next = clamp(Number((current + direction * increment).toFixed(precision)));
    lastEmitted.current = next;
    setText(String(next));
    onValueChange(next);
    onValueCommit?.(next);
  };

  const input = (
    <Input
      {...rest}
      type="number"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );

  if (!showSteppers) return input;

  return (
    <div className="inline-flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label={t('decreaseValue')}
        title={t('decreaseValue')}
        onClick={() => changeBy(-1)}
        disabled={min !== undefined && value <= min}
      >
        <Minus className="size-3.5" />
      </Button>
      {input}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7 shrink-0"
        aria-label={t('increaseValue')}
        title={t('increaseValue')}
        onClick={() => changeBy(1)}
        disabled={max !== undefined && value >= max}
      >
        <Plus className="size-3.5" />
      </Button>
    </div>
  );
};

function decimalPlaces(value: number) {
  const text = String(value);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}
