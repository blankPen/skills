#!/usr/bin/env bun
/**
 * ClaudeCode 适配器
 * 扫描 ~/.claude/projects/ 目录下的会话
 */

import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import type { AgentAdapter, AgentType, UnifiedSession, UnifiedMessage, ContentBlock } from '../core/interfaces.js';
import { normalizePath, pathExists, getOutputDirByAgent } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

// ClaudeCode 原始数据行
interface ClaudeCodeRow {
  type: string;
  uuid?: string;
  parentUuid?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
    model?: string;
  };
  toolUseMessages?: unknown[];
  isSidechain?: boolean;
}

/**
 * 格式化时间戳为 YYYY-MM-DD hh:mm:ss 格式
 */
function formatTime(ts: string | number | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => n.toString().padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

/**
 * 计算会话统计信息
 */
function getSessionStats(messages: UnifiedMessage[], metadata?: Record<string, unknown>) {
  let userMessages = 0;
  let toolCalls = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let minTime = 0;
  let maxTime = 0;

  // 从 metadata 获取 token 信息
  if (metadata?.inputTokens) inputTokens = metadata.inputTokens as number;
  if (metadata?.outputTokens) outputTokens = metadata.outputTokens as number;

  for (const m of messages) {
    for (const c of m.content) {
      // 统计工具调用 - 支持多种类型
      if (c.type === 'tool-call' || c.type === 'tool_use' || c.type === 'tool_use') {
        toolCalls++;
      }
      // 检查 text 内容中是否包含 tool_use 信息
      if (c.type === 'text') {
        const data = c.data as string;
        if (data && data.includes('"type":"tool_use"')) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'tool_use') toolCalls++;
          } catch {}
        }
      }
    }

    // 统计用户消息
    if (m.role === 'user' && m.content.some(c => c.type === 'text' || c.type === 'thinking')) {
      userMessages++;
    }

    // 时间戳处理 - 支持 ISO 字符串格式
    if (m.timestamp) {
      let t: number;
      if (typeof m.timestamp === 'string') {
        // 处理 ISO 8601 格式
        t = new Date(m.timestamp).getTime();
      } else {
        t = parseInt(String(m.timestamp));
      }
      if (t > 0 && !isNaN(t)) {
        if (!minTime || t < minTime) minTime = t;
        if (t > maxTime) maxTime = t;
      }
    }
  }

  const duration = maxTime > minTime ? Math.round((maxTime - minTime) / 1000) : 0;
  const durationStr = duration > 0 ? Math.floor(duration / 60) + 'm' + (duration % 60) + 's' : '0s';

  return { userMessages, toolCalls, inputTokens, outputTokens, duration, durationStr };
}

/**
 * 查找所有 .jsonl 文件
 */
function findJsonlFiles(dir: string, filter?: (name: string) => boolean): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;

  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findJsonlFiles(full, filter));
      } else if (entry.name.endsWith('.jsonl')) {
        if (!filter || filter(entry.name)) {
          files.push(full);
        }
      }
    }
  } catch (e) {
    logger.warn(`无法读取目录: ${dir}`, e);
  }

  return files.sort((a, b) => statSync(b).mtime.getTime() - statSync(a).mtime.getTime());
}

/**
 * 将 ClaudeCode 会话转换为统一格式
 */
function normalizeToUnified(
  rows: ClaudeCodeRow[],
  projectPath: string,
  projectName: string,
  projectId: string,
  customPath?: string
): UnifiedSession | null {
  let sessionId = '';
  let branch = '';
  let model = '';
  let startTime = '';
  let endTime = '';
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const messages: UnifiedMessage[] = [];

  rows.forEach((row) => {
    if (row.timestamp && !startTime) startTime = row.timestamp;
    if (row.sessionId) sessionId = row.sessionId;
    if (row.gitBranch) branch = row.gitBranch;
    if (row.message?.model) model = row.message.model;

    if (row.type === 'user' || row.type === 'assistant') {
      if (row.message) {
        let content: ContentBlock[];

        if (typeof row.message.content === 'string') {
          content = [{ type: 'text', data: row.message.content }];
        } else if (Array.isArray(row.message.content)) {
          content = row.message.content.map(c => {
            if (c.type === 'text') {
              return { type: 'text' as const, data: c.text ?? '' };
            }
            if (c.type === 'tool_use') {
              return { type: 'tool-call' as const, data: c };
            }
            if (c.type === 'thinking') {
              return { type: 'thinking' as const, data: c.thinking || '' };
            }
            return { type: 'text' as const, data: JSON.stringify(c) };
          });
        } else {
          content = [{ type: 'text', data: JSON.stringify(row.message.content) }];
        }

        // 处理工具调用
        if (row.toolUseMessages && Array.isArray(row.toolUseMessages)) {
          for (const toolMsg of row.toolUseMessages) {
            content.push({
              type: 'tool-call',
              data: toolMsg,
            });
          }
        }

        messages.push({
          id: row.uuid || `${sessionId}-${messages.length}`,
          role: row.type as 'user' | 'assistant' | 'system',
          content,
          timestamp: row.timestamp,
          metadata: {
            parentUuid: row.parentUuid,
            isSidechain: row.isSidechain,
          },
        });
      }
    }
  });

  // 计算统计信息
  const stats = getSessionStats(messages, { inputTokens: totalInputTokens, outputTokens: totalOutputTokens });

  if (!sessionId) return null;

  return {
    id: sessionId || projectId,
    agent: 'claude-code',
    title: projectName || 'Unknown',
    directory: projectPath,
    timestamp: startTime,
    startTime: startTime,
    endTime: rows[rows.length - 1]?.timestamp,
    messages,
    metadata: {
      source: 'claude-code',
      customPath,
      projectId,
      branch,
      model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      ...stats,
    },
  };
}

/**
 * 解析单个项目
 */
async function scanProject(
  projectDir: string,
  projectId: string,
  customPath?: string
): Promise<UnifiedSession[]> {
  const files = findJsonlFiles(projectDir, name => !name.startsWith('agent-'));
  if (files.length === 0) return [];

  const sessions: UnifiedSession[] = [];

  for (const filePath of files) {
    try {
      const rows = readFileSync(filePath, 'utf-8')
        .split('\n')
        .filter(v => v.trim())
        .map(v => JSON.parse(v) as ClaudeCodeRow);

      let projectPath = '';
      let projectName = '';

      for (const row of rows) {
        if (row.cwd) {
          projectPath = row.cwd;
          projectName = basename(row.cwd);
          break;
        }
      }

      if (!projectPath) {
        projectPath = projectDir;
        projectName = basename(projectDir);
      }

      const unified = normalizeToUnified(rows, projectPath, projectName, projectId, customPath);
      if (unified) sessions.push(unified);
    } catch (e) {
      logger.warn(`解析会话失败: ${filePath}`, e);
    }
  }

  return sessions;
}

/**
 * 格式化 JSON 数据为易读的 Markdown 格式
 */
function formatJsonContent(type: string, data: unknown): string {
  const obj = typeof data === 'string' ? JSON.parse(data) : data;

  if (type === 'thinking' && obj && typeof obj === 'object') {
    const thinking = (obj as any).thinking;
    if (thinking) {
      return `<thinking>${thinking}</thinking>`;
    }
  }

  if (type === 'tool_use' && obj && typeof obj === 'object') {
    const tool = obj as any;
    let result = `<tool_use id="${tool.id}" name="${tool.name}">\n`;
    if (tool.input) {
      const input = typeof tool.input === 'string' ? JSON.parse(tool.input) : tool.input;
      result += `  Input:\n`;
      for (const [key, value] of Object.entries(input)) {
        if (typeof value === 'string') {
          result += `    ${key}: ${value}\n`;
        } else {
          result += `    ${key}: ${JSON.stringify(value)}\n`;
        }
      }
    }
    result += `</tool_use>`;
    return result;
  }

  if (type === 'tool_result' && obj && typeof obj === 'object') {
    const result = obj as any;
    let output = `<tool_result tool_use_id="${result.tool_use_id}"`;
    if (result.is_error) output += ' is_error="true"';
    output += '>\n';
    if (result.content) {
      const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
      output += content.length > 500 ? `  ${content.slice(0, 500)}...\n` : `  ${content}\n`;
    }
    output += `</tool_result>`;
    return output;
  }

  return `<${type}>${JSON.stringify(obj, null, 2)}</${type}>`;
}

/**
 * 解析并转换 JSON 字符串内容
 */
function parseAndFormatContent(c: { type: string; data: unknown }): string {
  if (typeof c.data === 'string') {
    try {
      const parsed = JSON.parse(c.data);
      if (parsed.type) return formatJsonContent(parsed.type, parsed);
    } catch { /* ignore */ }
  }

  if (typeof c.data === 'object' && c.data !== null) {
    const obj = c.data as any;
    if (obj.type) return formatJsonContent(obj.type, obj);
  }

  if (c.type === 'text') return c.data as string;
  if (c.type === 'thinking') return `<thinking>${c.data}</thinking>`;
  if (c.type === 'code') return `<code>${c.data}</code>`;
  if (c.type === 'tool-call') return `<tool_call>${JSON.stringify(c.data)}</tool_call>`;
  return JSON.stringify(c.data);
}

/**
 * 将会话转换为 Markdown 格式
 */
function sessionToMarkdown(session: UnifiedSession): string {
  const stats = getSessionStats(session.messages, session.metadata);
  const front = `---
conv_id: ${session.id}
project_name: ${session.title}
project_path: ${session.directory}
start_time: ${formatTime(session.startTime)}
end_time: ${formatTime(session.endTime)}
duration: ${stats.durationStr}
user_messages: ${stats.userMessages}
tool_calls: ${stats.toolCalls}
input_tokens: ${stats.inputTokens}
output_tokens: ${stats.outputTokens}
agent: claude-code
---
`;
  const blocks = session.messages.map(({ role, content }) => {
    const body = content
      .map((c) => parseAndFormatContent(c))
      .filter(Boolean)
      .join('\n\n');
    return `---
**${role.charAt(0).toUpperCase() + role.slice(1)}**

${body}
`;
  });
  return front + blocks.join('\n');
}

/**
 * 写入会话到 Markdown 文件
 */
function writeSessionToFile(session: UnifiedSession, projectName: string): void {
  const outPath = join(getOutputDirByAgent('claude-code'), projectName, session.id + '.md');

  try {
    mkdirSync(dirname(outPath), { recursive: true });
    const markdown = sessionToMarkdown(session);
    writeFileSync(outPath, markdown);
    logger.info(`已写入: ${outPath}`);
  } catch (e) {
    logger.warn(`写入文件失败: ${outPath}`, e);
  }
}

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly name: AgentType = 'claude-code';
  readonly displayName = 'ClaudeCode';
  readonly description = 'Anthropic Claude Code 的会话';

  readonly defaultPaths = {
    macos: '~/.claude/projects',
    linux: '~/.claude/projects',
    windows: '%USERPROFILE%/.claude/projects',
  };

  private basePath: string;

  constructor() {
    this.basePath = join(homedir(), '.claude', 'projects');
  }

  async isInstalled(): Promise<boolean> {
    return pathExists(this.basePath);
  }

  async scanSessions(customPath?: string): Promise<UnifiedSession[]> {
    const scanPath = customPath
      ? normalizePath(customPath)
      : this.basePath;

    logger.info(`扫描 ClaudeCode 会话: ${scanPath}`);

    if (!existsSync(scanPath)) {
      logger.warn(`ClaudeCode 项目目录不存在: ${scanPath}`);
      return [];
    }

    const sessions: UnifiedSession[] = [];

    try {
      const entries = readdirSync(scanPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectPath = join(scanPath, entry.name);
          const projectSessions = await scanProject(projectPath, entry.name, customPath);

          // 写入 Markdown 文件并过滤
          for (const session of projectSessions) {
            const stats = getSessionStats(session.messages);
            // 过滤: 会话时长<1分钟 且 用户消息<2
            if (stats.duration < 60 && stats.userMessages < 2) {
              logger.debug(`过滤 ${session.id}: msg=${stats.userMessages}, dur=${stats.duration}`);
              continue;
            }
            const name = session.title || entry.name;
            writeSessionToFile(session, name);
          }

          sessions.push(...projectSessions);
        }
      }
    } catch (e) {
      logger.error('扫描 ClaudeCode 失败', e);
    }

    // 过滤最终结果
    const filteredSessions = sessions.filter(s => {
      const stats = getSessionStats(s.messages);
      if (stats.duration < 60 && stats.userMessages < 2) {
        logger.debug(`过滤最终结果 ${s.id}: msg=${stats.userMessages}, dur=${stats.duration}`);
        return false;
      }
      return true;
    });

    logger.info(`ClaudeCode 扫描完成: ${filteredSessions.length} 个会话 (过滤了 ${sessions.length - filteredSessions.length} 个)`);
    return filteredSessions;
  }

  getInfo() {
    const installed = pathExists(this.basePath);
    return {
      installed,
    };
  }
}

// 导出工厂函数
export function createClaudeCodeAdapter(): AgentAdapter {
  return new ClaudeCodeAdapter();
}
