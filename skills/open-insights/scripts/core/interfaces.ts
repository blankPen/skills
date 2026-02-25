#!/usr/bin/env bun
/**
 * 核心接口定义
 * 定义多 Agent 会话分析器的核心类型
 */

// Agent 类型
export type AgentType = 'cursor' | 'claude-code' | 'opencode';

// 内容块类型
export type ContentBlockType = 'text' | 'code' | 'thinking' | 'tool-call' | 'file' | 'image';

// 内容块接口
export interface ContentBlock {
  type: ContentBlockType;
  data: string | Record<string, unknown>;
  format?: string;
}

// 统一消息接口
export interface UnifiedMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: ContentBlock[];
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

// 统一会话接口
export interface UnifiedSession {
  id: string;
  agent: AgentType;
  title: string;
  directory: string;
  timestamp: string;
  startTime?: string;
  endTime?: string;
  messages: UnifiedMessage[];
  metadata: Record<string, unknown>;
}

// 扫描结果接口
export interface ScanResult {
  sessions: UnifiedSession[];
  totalCount: number;
  byTool: Record<AgentType, number>;
  errors: string[];
}

// 适配器接口
export interface AgentAdapter {
  // 适配器标识
  name: AgentType;
  displayName: string;
  description: string;

  // 默认路径配置
  defaultPaths: {
    macos: string;
    linux: string;
    windows: string;
  };

  // 检测是否安装
  isInstalled(): Promise<boolean>;

  // 扫描会话
  scanSessions(customPath?: string): Promise<UnifiedSession[]>;

  // 获取适配器信息
  getInfo(): AdapterInfo;
}

// 适配器信息
export interface AdapterInfo {
  installed: boolean;
  version?: string;
  sessionCount?: number;
  path?: string;
}

// 工具函数类型
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

// 扫描选项
export interface ScanOptions {
  tools?: AgentType[];
  customPaths?: Partial<Record<AgentType, string>>;
  includeMetadata?: boolean;
  quiet?: boolean;
}

// 会话存储格式（输出到 Markdown）
export interface StoredSession {
  id: string;
  projectName: string;
  projectPath: string;
  startTime: string;
  endTime: string;
  messages: Array<{
    role: string;
    content: Array<{
      type: string;
      text?: string;
      thinking?: string;
    }>;
  }>;
}
