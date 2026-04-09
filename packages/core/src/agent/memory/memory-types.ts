export interface CodebaseMemory {
  lastUpdated: string;
  structure: {
    keyFiles: string[];
    directories: string[];
    languages: string[];
  };
  architecture: string[];
  entryPoints: string[];
}

export interface PatternsMemory {
  lastUpdated: string;
  conventions: Array<{
    pattern: string;
    examples: string[];
    firstSeen: string;
  }>;
  antiPatterns: Array<{
    pattern: string;
    occurrences: number;
  }>;
}

export interface CalibrationMemory {
  lastUpdated: string;
  perExpert: Record<string, {
    totalFindings: number;
    accepted: number;
    dismissed: number;
    accuracy: number;
  }>;
  falsePositivePatterns: string[];
}

export type MemoryType = 'codebase' | 'patterns' | 'calibration';

export const EMPTY_CODEBASE: CodebaseMemory = {
  lastUpdated: '',
  structure: { keyFiles: [], directories: [], languages: [] },
  architecture: [],
  entryPoints: [],
};

export const EMPTY_PATTERNS: PatternsMemory = {
  lastUpdated: '',
  conventions: [],
  antiPatterns: [],
};

export const EMPTY_CALIBRATION: CalibrationMemory = {
  lastUpdated: '',
  perExpert: {},
  falsePositivePatterns: [],
};
