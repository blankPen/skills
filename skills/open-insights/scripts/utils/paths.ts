#!/usr/bin/env bun
/**
 * 路径工具函数
 * 跨平台路径处理，支持 ~ 展开和环境变量
 */

import { join, resolve, normalize } from 'path';
import { homedir, platform } from 'os';
import { existsSync } from 'fs';

/**
 * 获取当前平台
 */
export function getPlatform(): 'macos' | 'linux' | 'windows' {
  const p = platform();
  if (p === 'darwin') return 'macos';
  if (p === 'win32') return 'windows';
  return 'linux';
}

/**
 * 展开 ~ 为用户主目录
 */
export function expandTilde(path: string): string {
  if (path.startsWith('~/') || path === '~') {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * 展开环境变量
 */
export function expandEnvVars(path: string): string {
  return path.replace(/\$\{?(\w+)\}?/g, (_, key) => {
    return process.env[key] || '';
  });
}

/**
 * 标准化路径
 */
export function normalizePath(path: string): string {
  let expanded = expandTilde(path);
  expanded = expandEnvVars(expanded);
  return normalize(expanded);
}

/**
 * 解析路径（支持相对路径和绝对路径）
 */
export function resolvePath(path: string, base?: string): string {
  const normalized = normalizePath(path);
  if (normalized.startsWith('/') || normalized.match(/^[a-zA-Z]:/)) {
    return normalized;
  }
  return resolve(base || process.cwd(), normalized);
}

/**
 * 获取默认数据目录
 */
export function getDefaultDataPath(agent: 'cursor' | 'claude-code' | 'opencode'): string {
  const p = getPlatform();
  
  const paths: Record<typeof agent, Record<typeof p, string>> = {
    'cursor': {
      macos: '~/Library/Application Support/Cursor/User/workspaceStorage',
      linux: '~/.config/Cursor/User/workspaceStorage',
      windows: '%APPDATA%/Cursor/User/workspaceStorage',
    },
    'claude-code': {
      macos: '~/.claude/projects',
      linux: '~/.claude/projects',
      windows: '%USERPROFILE%/.claude/projects',
    },
    'opencode': {
      macos: '~/.local/share/opencode/storage',
      linux: '~/.local/share/opencode/storage',
      windows: '%USERPROFILE%/.local/share/opencode/storage',
    },
  };

  return normalizePath(paths[agent][p]);
}

/**
 * 检查目录是否存在
 */
export function pathExists(path: string): boolean {
  return existsSync(normalizePath(path));
}

/**
 * 获取输出目录
 */
export function getOutputDir(): string {
  return normalizePath('~/.agent-insights/conversations');
}

/**
 * 安全的路径创建（确保目录存在）
 */
export function ensureDir(path: string): string {
  const normalized = normalizePath(path);
  // 目录创建由主脚本处理，这里只返回标准化路径
  return normalized;
}


/**
 * 获取按工具分类的输出目录
 * @param agent Agent 类型
 */
export function getOutputDirByAgent(agent: 'cursor' | 'claude-code' | 'opencode'): string {
  return normalizePath(`~/.agent-insights/conversations/${agent}`);
}