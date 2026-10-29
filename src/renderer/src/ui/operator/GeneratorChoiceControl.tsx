import { SegmentedControl, Text } from '@mantine/core';
import { useResizeObserver } from '@mantine/hooks';

export function GeneratorChoiceControl<Value extends string>({
  label,
  value,
  data,
  onChange
}: {
  label: string;
  value: Value;
  data: Array<{ value: Value; label: string }>;
  onChange(value: Value): void;
}) {
  const [ref, { width }] = useResizeObserver<HTMLDivElement>();
  const minimumWidth = data.length > 2 ? 480 : 360;
  return (
    <div ref={ref} className="generator-choice-control">
      <Text fw={700} size="sm" mb={4}>
        {label}
      </Text>
      <SegmentedControl
        fullWidth
        aria-label={label}
        orientation={width > 0 && width < minimumWidth ? 'vertical' : 'horizontal'}
        value={value}
        data={data}
        onChange={(nextValue) => {
          const choice = data.find((option) => option.value === nextValue);
          if (choice) onChange(choice.value);
        }}
      />
    </div>
  );
}
