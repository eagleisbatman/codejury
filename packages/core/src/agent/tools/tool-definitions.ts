import type { ToolDefinition } from '../types.js';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read a file from the reviewed codebase. Returns content with line numbers. Use start_line/end_line to read a range.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path from repo root' },
        start_line: { type: 'number', description: 'Start line (1-indexed, optional)' },
        end_line: { type: 'number', description: 'End line (1-indexed, optional)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for files matching a glob pattern. Returns a list of matching file paths.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g., "src/**/*.ts", "*.json")' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'grep',
    description: 'Search file contents using a regex pattern. Returns matching lines with file paths and line numbers.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'File or directory to search in (optional, defaults to repo root)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'list_directory',
    description: 'List contents of a directory. Shows files and subdirectories with type indicators.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative directory path (optional, defaults to repo root)' },
      },
      required: [],
    },
  },
  {
    name: 'git_blame',
    description: 'Show git blame for a file range. Shows who last changed each line and when.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
        start_line: { type: 'number', description: 'Start line' },
        end_line: { type: 'number', description: 'End line' },
      },
      required: ['path', 'start_line', 'end_line'],
    },
  },
  {
    name: 'git_log',
    description: 'Show recent git commits. Optionally filter by file path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Filter to commits touching this file (optional)' },
        count: { type: 'number', description: 'Number of commits to show (default 10)' },
      },
      required: [],
    },
  },
  {
    name: 'get_dependencies',
    description: 'Extract import/require statements from a file to understand its dependencies.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path' },
      },
      required: ['path'],
    },
  },
  {
    name: 'report_finding',
    description: 'Submit a code review finding. Call this for each issue you discover. The finding is validated and added to the review.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Relative file path' },
        line_start: { type: 'number', description: 'Start line of the issue' },
        line_end: { type: 'number', description: 'End line of the issue' },
        severity: { type: 'string', description: 'critical | error | warning | info | style', enum: ['critical', 'error', 'warning', 'info', 'style'] },
        category: { type: 'string', description: 'security | correctness | performance | maintainability | style | test_coverage', enum: ['security', 'correctness', 'performance', 'maintainability', 'style', 'test_coverage'] },
        title: { type: 'string', description: 'One-line summary (max 120 chars)' },
        description: { type: 'string', description: 'Detailed explanation' },
        suggested_fix: { type: 'string', description: 'Concrete code fix (optional)' },
        confidence: { type: 'number', description: '0.0 to 1.0 confidence in this finding' },
      },
      required: ['file_path', 'line_start', 'line_end', 'severity', 'category', 'title', 'description', 'confidence'],
    },
  },
  {
    name: 'read_memory',
    description: 'Read project memory from previous reviews. Types: codebase (structure, architecture), patterns (conventions), calibration (accuracy).',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Memory type to read', enum: ['codebase', 'patterns', 'calibration'] },
      },
      required: ['type'],
    },
  },
  {
    name: 'write_memory',
    description: 'Write an observation to project memory for future reviews. Merged with existing data.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Memory type', enum: ['codebase', 'patterns', 'calibration'] },
        content: { type: 'string', description: 'JSON string of the content to merge' },
      },
      required: ['type', 'content'],
    },
  },
];
