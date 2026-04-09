import type { Category, Severity } from '../types/finding.js';

// --- Feedback ---

export type FeedbackAction = 'accept' | 'dismiss' | 'ignore';

export interface FindingFeedback {
  findingId: string;
  reviewId: string;
  action: FeedbackAction;
  timestamp: Date;
  reason?: string;
}

// --- Episodic Memory ---

export interface AgentStep {
  iteration: number;
  type: 'tool_call' | 'tool_result' | 'thinking' | 'finding' | 'context_reset';
  toolName?: string;
  params?: Record<string, unknown>;
  resultSummary?: string;
  findingId?: string;
  timestamp: number;
}

export interface AgentTrajectory {
  expertId: string;
  model: string;
  steps: AgentStep[];
  totalInputTokens: number;
  totalOutputTokens: number;
  iterations: number;
  toolCallCount: number;
  finalFindingCount: number;
}

export interface ReviewEpisode {
  reviewId: string;
  repoPath: string;
  timestamp: Date;
  trajectories: AgentTrajectory[];
  findingIds: string[];
  totalCostUsd: number;
  durationMs: number;
  compressed: boolean;
}

// --- Reflections ---

export interface Reflection {
  id: string;
  reviewId: string;
  trigger: 'post_review' | 'post_feedback';
  observations: string[];
  patternSuggestions: string[];
  calibrationUpdates: CalibrationDelta[];
  timestamp: Date;
}

export interface CalibrationDelta {
  expertId: string;
  category: Category;
  severity: Severity;
  adjustment: number;
  reason: string;
}

// --- Review Patterns (Voyager Skills) ---

export interface ReviewPattern {
  id: string;
  name: string;
  description: string;
  promptFragment: string;
  triggerConditions: PatternTrigger[];
  successRate: number;
  expertSource: string;
  examples: PatternExample[];
  createdAt: Date;
  lastUsed: Date;
  timesApplied: number;
  timesAccepted: number;
  active: boolean;
}

export interface PatternTrigger {
  type: 'file_glob' | 'language' | 'category' | 'keyword';
  value: string;
}

export interface PatternExample {
  filePath: string;
  codeSnippet: string;
  findingTitle: string;
  accepted: boolean;
}

// --- Calibration ---

export interface CalibrationEntry {
  expertId: string;
  category: Category;
  severity: Severity;
  totalFindings: number;
  accepted: number;
  dismissed: number;
  ignored: number;
  confidenceMultiplier: number;
  lastUpdated: Date;
}

export interface CalibrationConfig {
  minFindingsForCalibration: number;
  confidenceFloor: number;
  decayFactor: number;
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  minFindingsForCalibration: 5,
  confidenceFloor: 0.2,
  decayFactor: 0.95,
};

// --- Compression ---

export interface CompressedObservation {
  id: string;
  sourceEpisodeIds: string[];
  observation: string;
  category: 'expert_strength' | 'expert_weakness' | 'codebase_pattern' | 'false_positive_pattern';
  confidence: number;
  createdAt: Date;
}
