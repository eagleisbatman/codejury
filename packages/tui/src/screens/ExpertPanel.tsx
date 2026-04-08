import { Box, Text, useInput } from 'ink';
import { useState, useEffect } from 'react';
import Spinner from 'ink-spinner';
import {
  discoverAvailableProviders,
  type ProviderDiscovery,
  type ProjectConfig,
} from '@codejury/core';
import { ExpertDot } from '../components/ExpertDot.js';

interface ExpertPanelProps {
  config: ProjectConfig;
  onBack?: () => void;
}

export function ExpertPanel({ config, onBack }: ExpertPanelProps) {
  const [discoveries, setDiscoveries] = useState<ProviderDiscovery[]>([]);
  const [selected, setSelected] = useState(0);
  const [testing, setTesting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    discoverAvailableProviders({
      claude: config.experts.claude,
      gemini: config.experts.gemini,
      openai: config.experts.openai,
      ollama: config.experts.ollama,
    }).then((results) => {
      setDiscoveries(results);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [config]);

  useInput((input, key) => {
    if (input === 'j' || key.downArrow) setSelected((s) => Math.min(s + 1, discoveries.length - 1));
    if (input === 'k' || key.upArrow) setSelected((s) => Math.max(s - 1, 0));
    if (input === 't' && discoveries[selected]) {
      const id = discoveries[selected]!.id;
      setTesting(id);
      discoverAvailableProviders({
        [id]: (config.experts as Record<string, unknown>)[id] as Parameters<typeof discoverAvailableProviders>[0][string],
      }).then((results) => {
        setDiscoveries((prev) => prev.map((d) => (d.id === id && results[0] ? results[0] : d)));
        setTesting(null);
      });
    }
    if (key.escape) onBack?.();
  });

  const enabledSet = new Set(config.experts.enabled);

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>Experts</Text>

      {loading && (
        <Box gap={1}><Spinner type="dots" /><Text dimColor>discovering providers...</Text></Box>
      )}

      <Box flexDirection="column">
        {discoveries.map((d, i) => {
          const sel = i === selected;
          const enabled = enabledSet.has(d.id);
          const ec = (config.experts as Record<string, unknown>)[d.id] as
            | { model?: string; timeout?: number; focus?: string[] } | undefined;

          return (
            <Box key={d.id} gap={1}>
              <Text bold={sel}>{sel ? '>' : ' '}</Text>
              <ExpertDot expertId={d.id} active={d.available} />
              <Text bold={sel}>{d.id.padEnd(10)}</Text>
              {d.available ? <Text color="green">ready</Text> : <Text color="red">offline</Text>}
              <Text dimColor={!enabled}>{enabled ? 'on ' : 'off'}</Text>
              <Text dimColor>{ec?.model ?? 'default'}</Text>
              {testing === d.id && <><Spinner type="dots" /><Text dimColor> testing</Text></>}
            </Box>
          );
        })}
      </Box>

      {/* Detail pane for selected expert */}
      {discoveries.length > 0 && discoveries[selected] && (
        <Box borderStyle="round" borderColor="gray" paddingX={1} flexDirection="column">
          {(() => {
            const d = discoveries[selected]!;
            const ec = (config.experts as Record<string, unknown>)[d.id] as
              | { model?: string; timeout?: number; focus?: string[] } | undefined;
            return (
              <>
                <Text bold>{d.id}</Text>
                <Text dimColor>status   {d.available ? 'available' : d.error}</Text>
                <Text dimColor>model    {ec?.model ?? 'default'}</Text>
                <Text dimColor>timeout  {ec?.timeout ?? 120}s</Text>
                <Text dimColor>focus    {ec?.focus?.join(', ') ?? 'general'}</Text>
                <Text dimColor>panel    {enabledSet.has(d.id) ? 'enabled' : 'disabled'}</Text>
              </>
            );
          })()}
        </Box>
      )}

      <Text dimColor>j/k navigate  t test  esc back</Text>
    </Box>
  );
}
