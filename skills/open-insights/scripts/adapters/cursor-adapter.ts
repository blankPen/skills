#!/usr/bin/env bun
/**
 * Cursor 适配器 - 扫描 Cursor 会话
 */

import { join, dirname, basename, sep } from 'path';
import { homedir, platform } from 'os';
import { readFileSync, existsSync, statSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import type { AgentAdapter, AgentType, UnifiedSession } from '../core/interfaces.js';
import { normalizePath, pathExists, getOutputDirByAgent } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

function ensureDirSync(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function getCursorProjectsPath() { 
  return join(homedir(), '.cursor', 'projects')
}

function getCursorProjectsPathLegacy() { return join(homedir(), '.cursor', 'projects'); }

function getWorkspaceStoragePath() {
  if (platform() === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Cursor', 'User', 'workspaceStorage');
  return join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage');
}

const readdirAsync = async (dir: string): Promise<string[]> => {
  const filenames: string[] = [];
  const files = readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const filename = join(dir, file.name);
    if (file.isDirectory()) filenames.push(...await readdirAsync(filename));
    else filenames.push(filename);
  }
  return filenames;
};

async function loadWorkspaceMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const WORKSPACE_STORAGE = getWorkspaceStoragePath();
  if (!existsSync(WORKSPACE_STORAGE)) return map;
  try {
    const filenames = await readdirAsync(WORKSPACE_STORAGE);
    for (const filename of filenames) {
      if (filename.endsWith('workspace.json')) {
        const res = JSON.parse(readFileSync(filename, 'utf-8'));
        if (res.folder && res.folder.startsWith('file://')) {
          const p = fileURLToPath(res.folder);
          let k = '';
          if (platform() === 'win32') k = p.replace(/[a-zA-Z]:[\/\\]/, '').split(sep).join('-').replace(/\./g, '').replace(/_/g, '-') || '';
          else k = p.slice(1).split(sep).join('-').replace(/\./g, '').replace(/_/g, '-');
          map.set(k, p);
        }
      }
    }
  } catch (e) { logger.warn('加载 workspace map 失败', e); }
  return map;
}

function findJsonlFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...findJsonlFiles(full));
      else if (entry.name.endsWith('.jsonl')) files.push(full);
    }
  } catch (e) { logger.warn('无法读取目录: ' + dir, e); }
  return files.sort((a, b) => statSync(b).mtime.getTime() - statSync(a).mtime.getTime());
}

function formatTime(ts: string | number | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n: number) => n.toString().padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function getCursorStats(messages: Array<{ role: string; content: any[]; timestamp?: string }>) {
  let userMsg = 0, toolCalls = 0, inTok = 0, outTok = 0, minT = 0, maxT = 0;
  
  for (const m of messages) {
    if (m.role === 'user') {
      const hasText = m.content.some(c => c.type === 'text' && c.text);
      if (hasText) userMsg++;
    }
    for (const c of m.content) {
      // 统计工具调用 - 支持多种类型
      if (c.type === 'tool_use' || c.type === 'tool' || c.type === 'tool_call' || c.type === 'tool-call') {
        toolCalls++;
      }
      // 也检查是否有 name 字段（某些格式）
      if (c.name) toolCalls++;
      
      // 提取 token 信息 - 从 step-finish 类型中获取
      if (c.type === 'step_finish' || c.type === 'step-finish') {
        const tok = c.tokens || (c as any).tokenUsage;
        if (tok) {
          inTok += tok.input || tok.input_tokens || tok.prompt_tokens || 0;
          outTok += tok.output || tok.output_tokens || tok.completion_tokens || 0;
        }
      }
      // 也检查 content 内部是否包含 usage/token 信息
      if (c.usage) {
        inTok += c.usage.input_tokens || c.usage.input || 0;
        outTok += c.usage.output_tokens || c.usage.output || 0;
      }
    }
    
    // 计算时间范围
    if (m.timestamp) {
      const t = new Date(m.timestamp).getTime();
      if (t > 0) {
        if (!minT || t < minT) minT = t;
        if (t > maxT) maxT = t;
      }
    }
  }
  
  const dur = maxT > minT ? Math.round((maxT - minT) / 1000) : 0;
  return { userMsg, toolCalls, inTok, outTok, dur, durF: dur > 0 ? Math.floor(dur/60)+'m'+(dur%60)+'s' : '0s' };
}

function convToMarkdown(conv: { id: string; projectName: string; projectPath: string; startTime: string; endTime: string; messages: Array<{ role: string; content: any[]; timestamp?: string }> }): string {
  const stats = getCursorStats(conv.messages);
  // 如果从消息计算出的 duration 为 0，尝试使用 startTime 和 endTime
  let durF = stats.durF;
  if (stats.dur === 0 && conv.startTime && conv.endTime) {
    const start = new Date(conv.startTime).getTime();
    const end = new Date(conv.endTime).getTime();
    if (end > start) {
      const dur = Math.round((end - start) / 1000);
      durF = dur > 0 ? Math.floor(dur/60)+'m'+(dur%60)+'s' : '0s';
    }
  }
  const front = '---\n' +
    'conv_id: ' + conv.id + '\n' +
    'project_name: ' + conv.projectName + '\n' +
    'project_path: ' + conv.projectPath + '\n' +
    'start_time: ' + formatTime(conv.startTime) + '\n' +
    'end_time: ' + formatTime(conv.endTime) + '\n' +
    'duration: ' + durF + '\n' +
    'user_messages: ' + stats.userMsg + '\n' +
    'tool_calls: ' + stats.toolCalls + '\n' +
    'input_tokens: ' + stats.inTok + '\n' +
    'output_tokens: ' + stats.outTok + '\n' +
    'agent: cursor\n---\n';
  const blocks = conv.messages.map(({ role, content }) => {
    const body = content.map(c => {
      if (c.type === 'text') return c.text || '';
      if (c.type === 'thinking') return '<thinking>' + (c.thinking || '') + '</thinking>';
      if (c.type === 'code_selection') return '<code_selection>' + (c.text || '') + '</code_selection>';
      if (c.type === 'attached_files') return '<attached_files>' + (c.text || '') + '</attached_files>';
      return '';
    }).filter(Boolean).join('\n\n');
    return '---\n**' + role.charAt(0).toUpperCase() + role.slice(1) + '**\n\n' + body + '\n';
  });
  return front + blocks.join('\n');
}

/**
 * 将会话转换为 JSON 格式
 */
function convToJson(conv: { id: string; projectName: string; projectPath: string; startTime: string; endTime: string; messages: Array<{ role: string; content: any[]; timestamp?: string }> }): object {
  const stats = getCursorStats(conv.messages);
  let durF = stats.durF;
  if (stats.dur === 0 && conv.startTime && conv.endTime) {
    const start = new Date(conv.startTime).getTime();
    const end = new Date(conv.endTime).getTime();
    if (end > start) {
      const dur = Math.round((end - start) / 1000);
      durF = dur > 0 ? Math.floor(dur/60)+'m'+(dur%60)+'s' : '0s';
    }
  }
  
  return {
    conv_id: conv.id,
    project_name: conv.projectName,
    project_path: conv.projectPath,
    start_time: formatTime(conv.startTime),
    end_time: formatTime(conv.endTime),
    duration: durF,
    user_messages: stats.userMsg,
    tool_calls: stats.toolCalls,
    input_tokens: stats.inTok,
    output_tokens: stats.outTok,
    agent: 'cursor',
    messages: conv.messages.map(({ role, content }) => ({
      role,
      content: content.map(c => {
        if (c.type === 'text') return { type: c.type, text: c.text || '' };
        if (c.type === 'thinking') return { type: c.type, thinking: c.thinking || '' };
        if (c.type === 'code_selection') return { type: c.type, text: c.text || '' };
        if (c.type === 'attached_files') return { type: c.type, text: c.text || '' };
        return { type: c.type };
      })
    }))
  };
}

/**
 * 获取 Git 信息
 */
function getGitInfo(projectPath: string): { branch: string; remote: string; commits: number } {
  const result = { branch: '', remote: '', commits: 0 };
  try {
    if (!existsSync(projectPath)) return result;
    // 获取当前分支
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectPath, encoding: 'utf-8', timeout: 5000 }).trim();
    result.branch = branch;
    // 获取 remote
    const remote = execSync('git remote get-url origin', { cwd: projectPath, encoding: 'utf-8', timeout: 5000 }).trim();
    result.remote = remote;
  } catch { /* ignore */ }
  return result;
}

/**
 * 写入会话 JSON 文件
 */
function writeSessionJson(conv: { id: string; projectName: string; projectPath: string; startTime: string; endTime: string; messages: Array<{ role: string; content: any[]; timestamp?: string }> }, projectName: string): void {
  const outPath = join(getOutputDirByAgent('cursor'), projectName, conv.id + '.json');
  try {
    ensureDirSync(dirname(outPath));
    writeFileSync(outPath, JSON.stringify(convToJson(conv), null, 2));
    logger.debug('已写入 JSON: ' + outPath);
  } catch (e) {
    logger.warn('写入 JSON 失败: ' + outPath, e);
  }
}

/**
 * 写入 project.json 文件
 */
function writeProjectJson(projectName: string, projectPath: string, sessionCount: number): void {
  const gitInfo = getGitInfo(projectPath);
  const projectJson = {
    project_name: projectName,
    project_path: projectPath,
    agent: 'cursor',
    session_count: sessionCount,
    git: {
      branch: gitInfo.branch,
      remote: gitInfo.remote,
      commits: gitInfo.commits
    },
    scanned_at: new Date().toISOString()
  };
  const outPath = join(getOutputDirByAgent('cursor'), projectName, 'project.json');
  try {
    ensureDirSync(dirname(outPath));
    writeFileSync(outPath, JSON.stringify(projectJson, null, 2));
    logger.debug('已写入 project.json: ' + outPath);
  } catch (e) {
    logger.warn('写入 project.json 失败: ' + outPath, e);
  }
}

export class CursorAdapter implements AgentAdapter {
  readonly name: AgentType = 'cursor';
  readonly displayName = 'Cursor';
  readonly description = 'Cursor IDE 的 AI 助手会话';
  readonly defaultPaths = { 
    macos: join(homedir(), '.cursor', 'projects'), 
    linux: join(homedir(), '.cursor', 'projects'), 
    windows: join(homedir(), '.cursor', 'projects'),
  };
  private projectsPath = getCursorProjectsPath();

  async isInstalled() { 
    return pathExists(this.projectsPath) || pathExists(getCursorProjectsPathLegacy());
  }

  async scanSessions(customPath?: string) {
    // 优先使用新路径，如果不存在则尝试旧路径
    let scanPath = customPath ? normalizePath(customPath) : this.projectsPath;
    if (!existsSync(scanPath)) {
      const legacyPath = getCursorProjectsPathLegacy();
      if (existsSync(legacyPath)) {
        scanPath = legacyPath;
      }
    }
    
    logger.info('扫描 Cursor: ' + scanPath);
    if (!existsSync(scanPath)) { logger.warn('目录不存在: ' + scanPath); return []; }

    const workspaceMap = await loadWorkspaceMap();
    const sessions: UnifiedSession[] = [];
    let totalConvs = 0;
    
    // 追踪每个项目的会话数
    const projectSessionCounts: Map<string, { path: string; count: number }> = new Map();

    // 尝试两种目录结构
    const findTranscripts = (dir: string): string[] => {
      return findJsonlFiles(dir);
    };

    const processDir = (dir: string, entryName: string) => {
      const jsonlFiles = findTranscripts(dir);
      if (jsonlFiles.length === 0) return 0;

      const projectPath = workspaceMap.get(entryName) || dir;
      const projectName = basename(projectPath) || entryName;
      let count = 0;

      for (const filePath of jsonlFiles) {
        try {
          const stat = statSync(filePath);
          const lines = readFileSync(filePath, 'utf-8').split('\n').filter(v => v.trim()).map(v => JSON.parse(v));

          const messages: Array<{ role: string; content: any[]; timestamp?: string }> = [];
          for (const row of lines) {
            if (row.role !== 'user' && row.role !== 'assistant') continue;
            const content = row.message?.content || [];
            messages.push({ role: row.role, content, timestamp: row.timestamp });
          }

          const convId = basename(filePath, '.jsonl');
          const startTime = lines[0]?.timestamp || stat.birthtime.toISOString();
          const endTime = lines[lines.length - 1]?.timestamp || stat.mtime.toISOString();

          const conv = { id: convId, projectName, projectPath, startTime, endTime, messages };
          
          // 过滤: 会话时长<1分钟 且 用户消息<2
          const stats = getCursorStats(conv.messages);
          if (stats.dur < 60 && stats.userMsg < 2) {
            logger.debug('过滤 ' + convId + ': msg=' + stats.userMsg + ', dur=' + stats.dur);
            continue;
          }

          // 写入 Markdown
          const outPath = join(getOutputDirByAgent('cursor'), projectName, convId + '.md');
          ensureDirSync(dirname(outPath));
          writeFileSync(outPath, convToMarkdown(conv));
          
          // 写入 JSON
          writeSessionJson(conv, projectName);
          
          // 添加到结果集
          sessions.push({
            id: convId,
            agent: 'cursor',
            title: projectName,
            directory: projectPath,
            timestamp: startTime,
            startTime,
            endTime,
            messages: messages.map(m => ({
              id: '',
              role: m.role as 'user' | 'assistant' | 'system',
              content: m.content.map(c => ({ type: (c.type || 'text') as any, data: c })),
              timestamp: m.timestamp
            })),
            metadata: { source: 'cursor', ...stats }
          });
          
          count++;
        } catch (e) { logger.warn('处理会话失败: ' + filePath, e); }
      }
      
      // 记录项目信息用于生成 project.json
      if (count > 0) {
        projectSessionCounts.set(projectName, { path: projectPath, count });
      }
      
      return count;
    };

    // 扫描目录
    const entries = readdirSync(scanPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        totalConvs += processDir(join(scanPath, entry.name), entry.name);
      } else if (entry.name.endsWith('.jsonl')) {
        totalConvs += processDir(scanPath, 'unknown');
      }
    }

    // 为每个项目生成 project.json
    for (const [projectName, info] of projectSessionCounts) {
      writeProjectJson(projectName, info.path, info.count);
    }

    logger.info('Cursor 扫描完成: ' + totalConvs + ' 个会话');
    return sessions;
  }

  getInfo() { 
    const installed = pathExists(this.projectsPath) || pathExists(getCursorProjectsPathLegacy());
    return { installed, path: this.projectsPath }; 
  }
}

export function createCursorAdapter() { return new CursorAdapter(); }
