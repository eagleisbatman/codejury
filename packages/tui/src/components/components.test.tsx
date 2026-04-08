import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { SeverityBadge } from './SeverityBadge.js';
import { ExpertDot } from './ExpertDot.js';
import { Badge } from './Badge.js';
import { ProgressBar } from './ProgressBar.js';
import { Header } from './Header.js';

describe('SeverityBadge', () => {
  it('renders critical badge', () => {
    const { lastFrame } = render(<SeverityBadge severity="critical" />);
    expect(lastFrame()).toContain('CRIT');
  });

  it('renders warning badge', () => {
    const { lastFrame } = render(<SeverityBadge severity="warning" />);
    expect(lastFrame()).toContain('WARN');
  });

  it('renders info badge', () => {
    const { lastFrame } = render(<SeverityBadge severity="info" />);
    expect(lastFrame()).toContain('INFO');
  });
});

describe('ExpertDot', () => {
  it('renders claude dot', () => {
    const { lastFrame } = render(<ExpertDot expertId="claude" />);
    expect(lastFrame()).toContain('C');
  });

  it('renders gemini dot', () => {
    const { lastFrame } = render(<ExpertDot expertId="gemini" />);
    expect(lastFrame()).toContain('G');
  });

  it('renders ollama dot', () => {
    const { lastFrame } = render(<ExpertDot expertId="ollama" />);
    expect(lastFrame()).toContain('O');
  });

  it('renders unknown expert with first letter', () => {
    const { lastFrame } = render(<ExpertDot expertId="deepseek" />);
    expect(lastFrame()).toContain('D');
  });
});

describe('Badge', () => {
  it('renders label in brackets', () => {
    const { lastFrame } = render(<Badge label="ENABLED" />);
    expect(lastFrame()).toContain('[ENABLED]');
  });
});

describe('ProgressBar', () => {
  it('renders filled blocks for 50%', () => {
    const { lastFrame } = render(<ProgressBar value={0.5} width={10} />);
    const frame = lastFrame()!;
    expect(frame).toContain('█');
    expect(frame).toContain('░');
  });

  it('renders fully filled for 100%', () => {
    const { lastFrame } = render(<ProgressBar value={1} width={10} done />);
    expect(lastFrame()).toContain('██████████');
  });

  it('renders empty for 0%', () => {
    const { lastFrame } = render(<ProgressBar value={0} width={10} />);
    expect(lastFrame()).toContain('░░░░░░░░░░');
  });
});

describe('Header', () => {
  it('renders project name and screen', () => {
    const { lastFrame } = render(
      <Header projectName="my-api" activeScreen="Dashboard" experts={['claude', 'gemini']} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('codejury');
    expect(frame).toContain('my-api');
    expect(frame).toContain('Dashboard');
  });

  it('renders expert dots', () => {
    const { lastFrame } = render(
      <Header projectName="test" activeScreen="Dashboard" experts={['claude', 'gemini']} />,
    );
    const frame = lastFrame()!;
    expect(frame).toContain('C');
    expect(frame).toContain('G');
  });

  it('renders cost when provided', () => {
    const { lastFrame } = render(
      <Header projectName="test" activeScreen="Dashboard" experts={[]} cost={0.1234} />,
    );
    expect(lastFrame()).toContain('$0.1234');
  });
});
