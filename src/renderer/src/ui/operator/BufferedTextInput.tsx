import { TextInput, type TextInputProps } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';

type BufferedTextInputProps = Omit<TextInputProps, 'defaultValue' | 'onChange' | 'value'> & {
  value: string;
  onCommit?(value: string): void;
  idleCommitMs?: number;
};

/** Keep typing local; commit after an idle pause or immediately on blur. */
export function BufferedTextInput({
  value,
  onCommit,
  idleCommitMs = 1500,
  onBlur,
  onFocus,
  ...props
}: BufferedTextInputProps) {
  const [buffer, setBuffer] = useState(value);
  const focusedRef = useRef(false);
  const timeoutRef = useRef<number | undefined>(undefined);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    if (!focusedRef.current) setBuffer(value);
  }, [value]);

  useEffect(() => {
    window.clearTimeout(timeoutRef.current);
    if (buffer === value || props.disabled || props.readOnly) return;
    timeoutRef.current = window.setTimeout(() => commitRef.current?.(buffer), idleCommitMs);
    return () => window.clearTimeout(timeoutRef.current);
  }, [buffer, idleCommitMs, props.disabled, props.readOnly, value]);

  return (
    <TextInput
      {...props}
      value={buffer}
      data-buffered-pending={buffer !== value && !props.readOnly}
      onChange={(event) => setBuffer(event.currentTarget.value)}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        window.clearTimeout(timeoutRef.current);
        if (buffer !== value) onCommit?.(buffer);
        onBlur?.(event);
      }}
    />
  );
}
