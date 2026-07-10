import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';

interface NumberInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  integer?: boolean;
}

// Number field that buffers the raw text while typing, so intermediate states
// like "", "0", "0.", "-" are allowed (the old parseFloat(x) || fallback pattern
// rejected a plain "0" and made "0.9" impossible to type). A valid parse is
// emitted live; on blur the text is normalized back to the last valid value.
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onValueChange,
  min,
  max,
  integer = false,
  ...rest
}) => {
  const [text, setText] = useState(String(value));
  const lastEmitted = useRef(value);

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
    } else {
      // Unparseable leftover ("", "-", "."): restore the last valid value
      setText(String(lastEmitted.current));
    }
  };

  return (
    <Input
      {...rest}
      type="number"
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};
