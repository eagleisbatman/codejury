import type { Finding } from '../../types/finding.js';
import type { ToolHandler, ToolResult } from '../types.js';
import type { MemoryStore } from '../memory/memory-store.js';
import { readFileTool } from './read-file.js';
import { searchFilesTool } from './search-files.js';
import { grepTool } from './grep.js';
import { listDirectoryTool } from './list-directory.js';
import { gitBlameTool } from './git-blame.js';
import { gitLogTool } from './git-log.js';
import { getDependenciesTool } from './get-dependencies.js';
import { reportFindingTool } from './report-finding.js';
import { readMemoryTool } from './read-memory.js';
import { writeMemoryTool } from './write-memory.js';

export class ToolExecutor {
  private findings: Finding[] = [];
  private toolMap: Map<string, ToolHandler>;

  constructor(repoPath: string, memoryStore: MemoryStore, expertId: string) {
    this.toolMap = new Map([
      ['read_file', readFileTool(repoPath)],
      ['search_files', searchFilesTool(repoPath)],
      ['grep', grepTool(repoPath)],
      ['list_directory', listDirectoryTool(repoPath)],
      ['git_blame', gitBlameTool(repoPath)],
      ['git_log', gitLogTool(repoPath)],
      ['get_dependencies', getDependenciesTool(repoPath)],
      ['report_finding', reportFindingTool(this.findings, expertId)],
      ['read_memory', readMemoryTool(memoryStore)],
      ['write_memory', writeMemoryTool(memoryStore)],
    ]);
  }

  async execute(callId: string, name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const handler = this.toolMap.get(name);
    if (!handler) {
      return { toolCallId: callId, name, content: `Unknown tool: ${name}`, isError: true };
    }
    try {
      const content = await handler(args);
      return { toolCallId: callId, name, content, isError: false };
    } catch (e) {
      return {
        toolCallId: callId,
        name,
        content: `Tool error: ${e instanceof Error ? e.message : String(e)}`,
        isError: true,
      };
    }
  }

  getFindings(): Finding[] {
    return [...this.findings];
  }

  addFinding(f: Finding): void {
    this.findings.push(f);
  }

  hasFinding(f: Finding): boolean {
    return this.findings.some(
      (existing) =>
        existing.file_path === f.file_path &&
        existing.line_start === f.line_start &&
        existing.title === f.title,
    );
  }
}
