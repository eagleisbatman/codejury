import { Text } from 'ink';
import type { Severity } from '@codejury/core';

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: 'red',
  error: 'redBright',
  warning: 'yellow',
  info: 'white',
  style: 'gray',
};

const SEVERITY_LABELS: Record<Severity, string> = {
  critical: 'CRIT',
  error: 'ERR ',
  warning: 'WARN',
  info: 'INFO',
  style: 'STYL',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <Text color={SEVERITY_COLORS[severity]} bold={severity === 'critical' || severity === 'error'}>
      [{SEVERITY_LABELS[severity]}]
    </Text>
  );
}
