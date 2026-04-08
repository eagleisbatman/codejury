import { Text } from 'ink';

interface BadgeProps {
  label: string;
  dim?: boolean;
}

export function Badge({ label, dim = false }: BadgeProps) {
  return (
    <Text dimColor={dim}>
      [{label}]
    </Text>
  );
}
