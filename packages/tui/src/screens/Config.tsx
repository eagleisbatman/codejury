import { Box, Text, useInput } from 'ink';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { ProjectConfig } from '@codejury/core';
import { PROJECT_DIR } from '@codejury/core';

interface ConfigProps {
  cwd: string;
  config: ProjectConfig;
  onBack?: () => void;
}

export function Config({ cwd, config, onBack }: ConfigProps) {
  useInput((input, key) => {
    if (input === 'e') {
      const editor = process.env['EDITOR'] ?? process.env['VISUAL'] ?? 'vi';
      spawn(editor, [join(cwd, PROJECT_DIR, 'config.toml')], { stdio: 'inherit' });
    }
    if (key.escape) onBack?.();
  });

  const { experts, synthesis, cost, rules, ci } = config;

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Configuration</Text>
      <Text dimColor>.codejury/config.toml</Text>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>project</Text>
        <Text dimColor>  name            {config.project.name || '(unnamed)'}</Text>
        <Text dimColor>  default_branch  {config.project.default_branch}</Text>
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Text bold>experts</Text>
        <Text dimColor>  enabled  [{experts.enabled.join(', ')}]</Text>
        {(['claude', 'gemini', 'openai', 'ollama'] as const).map((id) => {
          const ec = experts[id];
          const on = experts.enabled.includes(id);
          return (
            <Text key={id} dimColor={!on}>
              {'  '}{id.padEnd(8)} {on ? 'on ' : 'off'} {ec.model} timeout={ec.timeout}s focus=[{ec.focus.join(',')}]
            </Text>
          );
        })}
      </Box>

      <Box gap={2}>
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold>synthesis</Text>
          <Text dimColor>  strategy   {synthesis.strategy}</Text>
          <Text dimColor>  dedup      {synthesis.dedup_threshold}</Text>
        </Box>
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold>cost</Text>
          <Text dimColor>  per_review  ${cost.budget_per_review.toFixed(2)}</Text>
          <Text dimColor>  monthly     ${cost.budget_monthly.toFixed(2)}</Text>
          <Text dimColor>  free_tier   {String(cost.prefer_free_tier)}</Text>
        </Box>
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold>ci</Text>
          <Text dimColor>  fail_on   {ci.fail_on_severity}</Text>
          <Text dimColor>  timeout   {ci.max_review_time_seconds}s</Text>
        </Box>
      </Box>

      {rules.custom_rules.length > 0 && (
        <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold>rules ({rules.custom_rules.length})</Text>
          {rules.custom_rules.map((r, i) => (
            <Text key={i} dimColor>  {i + 1}. {r}</Text>
          ))}
        </Box>
      )}

      <Text dimColor>e open in $EDITOR  esc back</Text>
    </Box>
  );
}
