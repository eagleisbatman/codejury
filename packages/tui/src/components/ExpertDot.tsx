import { Text } from 'ink';

const EXPERT_ICONS: Record<string, string> = {
  claude: 'C',
  gemini: 'G',
  openai: 'X',
  ollama: 'O',
};

export function ExpertDot({ expertId, active = true }: { expertId: string; active?: boolean }) {
  const icon = EXPERT_ICONS[expertId] ?? expertId[0]?.toUpperCase() ?? '?';

  return (
    <Text color={active ? 'white' : 'gray'} bold={active} dimColor={!active}>
      {icon}
    </Text>
  );
}
