import { Text } from 'ink';

interface ProgressBarProps {
  value: number; // 0 to 1
  width?: number;
  done?: boolean;
  failed?: boolean;
}

export function ProgressBar({ value, width = 20, done, failed }: ProgressBarProps) {
  const filled = Math.round(value * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  const color = failed ? 'red' : done ? 'white' : 'gray';

  return (
    <Text color={color}>{bar}</Text>
  );
}
