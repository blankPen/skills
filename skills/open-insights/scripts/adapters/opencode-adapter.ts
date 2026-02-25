#!/usr/bin/env bun
/**
 * OpenCode 适配器 - 扫描 OpenCode 会话
 */

import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'fs';
import type { AgentAdapter, AgentType, UnifiedSession, UnifiedMessage, ContentBlock } from '../core/interfaces.js';
import { normalizePath, pathExists, getOutputDirByAgent } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

interface OpenCodeSession { id: string; title: string; directory: string; time: { created: number; updated?: number }; parentID?: string; }
interface OpenCodeMessage { id: string; role: 'user' | 'assistant'; session_id: string; content: string; time?: { created: number; completed?: number }; tokens?: { input: number; output: number; reasoning?: number; cache?: { read: number; write: number } }; }
interface OpenCodePart { id: string; type: string; content?: string; data?: Record<string, unknown>; tokens?: { input: number; output: number } };

function findAllFiles(dir: string, ext?: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) files.push(...findAllFiles(full, ext));
      else if (!ext || e.name.endsWith(ext)) files.push(full);
    }
  } catch (e) { logger.warn('无法读取目录: ' + dir, e); }
  return files;
}

function loadSessions(path: string): OpenCodeSession[] {
  const dir = join(path, 'session');
  return findAllFiles(dir, '.json').map(f => { try { return JSON.parse(readFileSync(f, 'utf-8')); } catch (e) { logger.warn('加载失败: ' + f, e); return null; } }).filter(Boolean) as OpenCodeSession[];
}

function loadMessages(path: string, sid: string): OpenCodeMessage[] {
  const msgs = findAllFiles(join(path, 'message', sid), '.json').map(f => { try { return JSON.parse(readFileSync(f, 'utf-8')); } catch (e) { return null; } }).filter(Boolean) as OpenCodeMessage[];
  msgs.sort((a, b) => parseInt(a.id.split('_')[1] || '0') - parseInt(b.id.split('_')[1] || '0'));
  return msgs;
}

function loadParts(path: string, mid: string): OpenCodePart[] {
  const parts = findAllFiles(join(path, 'part', mid), '.json').map(f => { try { return JSON.parse(readFileSync(f, 'utf-8')); } catch (e) { return null; } }).filter(Boolean) as OpenCodePart[];
  parts.sort((a, b) => parseInt((a.id || '0').split('_')[0] || '0') - parseInt((b.id || '0').split('_')[0] || '0'));
  return parts;
}

function normalize(sess: OpenCodeSession, msgs: OpenCodeMessage[], path: string, custom?: string): UnifiedSession {
  // 收集所有消息的时间戳用于计算 duration
  const timestamps: number[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  
  const msgs2: UnifiedMessage[] = msgs.map(m => {
    // 提取消息级时间戳
    const msgTime = m.time?.created ? String(m.time.created) : (m.time?.completed ? String(m.time.completed) : undefined);
    if (msgTime) timestamps.push(parseInt(msgTime));
    
    // 提取消息级 token
    if (m.tokens) {
      totalInputTokens += m.tokens.input || 0;
      totalOutputTokens += m.tokens.output || 0;
    }
    
    const parts = loadParts(path, m.id);
    const content: ContentBlock[] = parts.map(p => {
      if (p.type === 'text' && p.content) return { type: 'text', data: p.content };
      if (p.type === 'reasoning') return { type: 'thinking', data: p.content || '' };
      // OpenCode 的 tool 类型
      if (p.type === 'tool') return { type: 'tool-call', data: p };
      if (p.type === 'tool-use') return { type: 'tool-call', data: p.data || {} };
      if (p.type === 'resource') return { type: 'file', data: p.data || {} };
      return { type: 'text', data: JSON.stringify(p) };
    });
    if (!content.length && m.content) content.push({ type: 'text', data: m.content });
    return { id: m.id, role: m.role, content, timestamp: msgTime || String(sess.time?.created) };
  });
  
  // 计算会话起止时间
  timestamps.sort((a, b) => a - b);
  const startTime = timestamps.length > 0 ? String(timestamps[0]) : String(sess.time?.created);
  const endTime = timestamps.length > 0 ? String(timestamps[timestamps.length - 1]) : String(sess.time?.created);
  
  return { 
    id: sess.id, 
    agent: 'opencode', 
    title: sess.title || 'Untitled', 
    directory: sess.directory || '', 
    timestamp: startTime, 
    startTime, 
    endTime, 
    messages: msgs2, 
    metadata: { 
      source: 'opencode', 
      customPath: custom, 
      storagePath: path, 
      parentID: sess.parentID,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens
    } 
  };
}

function fmtContent(d: unknown): string {
  const o = typeof d === 'string' ? JSON.parse(d) : d;
  if (!o || typeof o !== 'object') return JSON.stringify(o);
  const t = (o as any).type;
  if (t === 'step-start') return '<step_start>\n  snapshot: ' + ((o as any).snapshot || '').slice(0, 8) + '...\n</step_start>';
  if (t === 'step-finish') { let r = '<step_finish>\n  reason: ' + ((o as any).reason || '') + '\n'; const tok = (o as any).tokens; if (tok) r += '  tokens: in=' + (tok.input||0) + ', out=' + (tok.output||0) + '\n'; return r + '</step_finish>'; }
  if (t === 'tool') { const s = (o as any).state || {}; let r = '<tool_use id="' + ((o as any).callID||'') + '" name="' + ((o as any).tool||'') + '">\n  status: ' + (s.status||'') + '\n'; if (s.input) { r += '  Input:\n'; for (const [k,v] of Object.entries(s.input)) r += '    ' + k + ': ' + (typeof v==='string'?v.slice(0,100):JSON.stringify(v).slice(0,100)) + '\n'; } if (s.output) r += '  Output: ' + ((s.output as string).slice(0,200) || '') + '\n'; return r + '</tool_use>'; }
  if (t === 'patch') { let r = '<patch>\n  hash: ' + ((o as any).hash||'').slice(0,8) + '...\n'; const fs = (o as any).files; if (fs) { r += '  files:\n'; for (const f of fs) r += '    - ' + f + '\n'; } return r + '</patch>'; }
  if (t === 'text') return (o as any).text || '';
  if (t === 'file') { let r = '<file'; const fn = (o as any).filename, mn = (o as any).mime; if (fn) r += ' name="' + fn + '"'; if (mn) r += ' type="' + mn + '"'; r += '>\n'; const src = (o as any).source?.text?.value; if (src) { const lines = (src as string).split('\n').slice(0,20); r += lines.join('\n'); if ((src as string).split('\n').length > 20) r += '\n  ... (truncated)'; } return r + '\n</file>'; }
  return '<' + t + '>\n' + JSON.stringify(o, null, 2) + '\n</' + t + '>';
}

function parseContent(c: { type: string; data: unknown }): string {
  if (c.type === 'thinking') { const c2 = c.data as string; return c2 && c2.trim() ? '<thinking>' + c2 + '</thinking>' : '<thinking></thinking>'; }
  if (c.type === 'tool-call') return fmtContent(c.data);
  if (c.type === 'file') return fmtContent(c.data);
  if (c.type === 'text') { const t = c.data as string; if (typeof t === 'string' && t.trim().startsWith('{')) try { return fmtContent(JSON.parse(t)); } catch { return t; } return t; }
  return JSON.stringify(c.data, null, 2);
}

function fmtTime(ts: string|number|undefined): string {
  if (!ts) return '';
  const d = new Date(typeof ts === 'string' ? parseInt(ts) : ts);
  const p = (n: number) => n.toString().padStart(2,'0');
  return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

function getStats(msgs: UnifiedMessage[], metadata?: Record<string, unknown>) {
  let u = 0, tc = 0, inT = 0, outT = 0, minT = 0, maxT = 0;
  
  // 从 metadata 获取 message 级别的 token
  if (metadata?.inputTokens) inT += metadata.inputTokens as number;
  if (metadata?.outputTokens) outT += metadata.outputTokens as number;
  
  for (const m of msgs) {
    for (const c of m.content) {
      if (c.type === 'tool-call') {
        const d = c.data as Record<string, unknown>;
        if (d && typeof d === 'object') {
          // 提取 token 信息 - 支持多种格式
          if (d.type === 'step-finish' || d.type === 'step_finish') {
            const tok = (d as any).tokens || (d as any).tokenUsage;
            if (tok) {
              inT += tok.input || tok.input_tokens || tok.prompt_tokens || 0;
              outT += tok.output || tok.output_tokens || tok.completion_tokens || 0;
            }
          }
          // 统计工具调用 - 支持多种类型
          const dType = (d as any).type;
          if (dType === 'tool' || dType === 'tool-use' || dType === 'tool_use' || dType === 'tool_call' || dType === 'tool-call') {
            tc++;
          }
          // 也检查 name 或 tool 字段
          if ((d as any).name || (d as any).tool) {
            tc++;
          }
        }
      }
      // 也检查 text 类型中是否包含 token 信息
      if (c.type === 'text') {
        const textData = c.data as string;
        if (textData && typeof textData === 'string') {
          try {
            const parsed = JSON.parse(textData);
            if (parsed.tokens) {
              inT += parsed.tokens.input || 0;
              outT += parsed.tokens.output || 0;
            }
          } catch { /* not JSON */ }
        }
      }
    }
    if (m.role === 'user' && m.content.some(c => c.type === 'text' || c.type === 'thinking')) u++;
    if (m.timestamp) { const t = parseInt(m.timestamp); if (t > 0) { if (!minT || t < minT) minT = t; if (t > maxT) maxT = t; } }
  }
  const dur = maxT > minT ? Math.round((maxT - minT) / 1000) : 0;
  return { u, tc, inT, outT, dur, durF: dur > 0 ? Math.floor(dur/60)+'m'+(dur%60)+'s' : '0s' };
}

function toMd(s: UnifiedSession): string {
  const st = getStats(s.messages, s.metadata);
  const f = '---\n' +
    'conv_id: ' + s.id + '\n' +
    'project_name: ' + s.title + '\n' +
    'project_path: ' + s.directory + '\n' +
    'start_time: ' + fmtTime(s.startTime) + '\n' +
    'end_time: ' + fmtTime(s.endTime) + '\n' +
    'duration: ' + st.durF + '\n' +
    'user_messages: ' + st.u + '\n' +
    'tool_calls: ' + st.tc + '\n' +
    'input_tokens: ' + st.inT + '\n' +
    'output_tokens: ' + st.outT + '\n' +
    'agent: opencode\n---\n';
  const bs = s.messages.map(({role, content}) => '---\n**' + role.charAt(0).toUpperCase() + role.slice(1) + '**\n\n' + content.map(parseContent).filter(Boolean).join('\n\n') + '\n');
  return f + bs.join('\n');
}
function write(s: UnifiedSession, pn: string) {
  const p = join(getOutputDirByAgent('opencode'), pn, s.id + '.md');
  try { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, toMd(s)); logger.info('已写入: ' + p); } catch (e) { logger.warn('写入失败: ' + p, e); }
}

export class OpenCodeAdapter implements AgentAdapter {
  readonly name: AgentType = 'opencode';
  readonly displayName = 'OpenCode';
  readonly description = 'OpenCode 的会话';
  readonly defaultPaths = { macos: '~/.local/share/opencode/storage', linux: '~/.local/share/opencode/storage', windows: '%USERPROFILE%/.local/share/opencode/storage' };
  private basePath = join(homedir(), '.local', 'share', 'opencode', 'storage');
  async isInstalled() { return pathExists(this.basePath); }
  async scanSessions(customPath?: string) {
    const p = customPath ? normalizePath(customPath) : this.basePath;
    logger.info('扫描 OpenCode: ' + p);
    if (!existsSync(p)) { logger.warn('目录不存在: ' + p); return []; }
    const sessions = loadSessions(p);
    const results: UnifiedSession[] = [];
    logger.info('找到 ' + sessions.length + ' 个会话');
    for (const sess of sessions) {
      try {
        const msgs = loadMessages(p, sess.id);
        if (!msgs.length) continue;
        const u = normalize(sess, msgs, p, customPath);
        const st = getStats(u.messages);
        // 过滤: 会话时长<1分钟 且 用户消息<2
        if (st.dur < 60 && st.u < 2) { logger.debug('过滤 ' + sess.id + ': msg=' + st.u + ', dur=' + st.dur); continue; }
        results.push(u);
        write(u, basename(u.directory) || 'unknown');
      } catch (e) { logger.warn('处理失败: ' + sess.id, e); }
    }
    logger.info('完成: ' + results.length + ' 个会话');
    return results;
  }
  getInfo() { return { installed: pathExists(this.basePath), path: this.basePath }; }
}
export function createOpenCodeAdapter() { return new OpenCodeAdapter(); }
