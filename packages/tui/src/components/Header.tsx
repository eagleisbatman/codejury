import { Box, Text } from 'ink';
import { ExpertDot } from './ExpertDot.js';

interface HeaderProps {
  projectName: string;
  activeScreen: string;
  experts: string[];
  cost?: number;
}

export function Header({ projectName, activeScreen, experts, cost }: HeaderProps) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Box gap={1}>
        <Text bold>codejury</Text>
        <Text dimColor>|</Text>
        <Text>{projectName}</Text>
        <Text dimColor>|</Text>
        <Text bold>{activeScreen}</Text>
      </Box>
      <Box gap={1}>
        {experts.map((e) => (
          <ExpertDot key={e} expertId={e} />
        ))}
        {cost !== undefined && (
          <Text dimColor> ${cost.toFixed(4)}</Text>
        )}
        <Text dimColor> ?=help</Text>
      </Box>
    </Box>
  );
}
