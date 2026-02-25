#!/usr/bin/env bun
/**
 * 日志工具
 * 简单的控制台日志，带颜色和日志级别
 */

import type { LogLevel, Logger } from '../core/interfaces.js';

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

// 日志级别优先级
const levelPriority: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// 当前日志级别
let currentLevel: LogLevel = 'info';

/**
 * 设置日志级别
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * 格式化日志消息
 */
function formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
  const timestamp = new Date().toISOString().slice(11, 19);
  const levelStr = level.toUpperCase().padEnd(5);
  
  let color = colors.white;
  switch (level) {
    case 'debug':
      color = colors.gray;
      break;
    case 'info':
      color = colors.cyan;
      break;
    case 'warn':
      color = colors.yellow;
      break;
    case 'error':
      color = colors.red;
      break;
  }

  const formatted = args.length > 0 
    ? `${message} ${args.map(a => JSON.stringify(a)).join(' ')}`
    : message;

  return `${colors.dim}${timestamp}${colors.reset} ${color}${levelStr}${colors.reset} ${formatted}`;
}

/**
 * 检查是否应该输出
 */
function shouldLog(level: LogLevel): boolean {
  return levelPriority[level] >= levelPriority[currentLevel];
}

/**
 * 创建日志器实例
 */
export function createLogger(prefix?: string): Logger {
  return {
    info(message: string, ...args: unknown[]) {
      if (shouldLog('info')) {
        console.log(formatMessage('info', prefix ? `[${prefix}] ${message}` : message, ...args));
      }
    },
    warn(message: string, ...args: unknown[]) {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', prefix ? `[${prefix}] ${message}` : message, ...args));
      }
    },
    error(message: string, ...args: unknown[]) {
      if (shouldLog('error')) {
        console.error(formatMessage('error', prefix ? `[${prefix}] ${message}` : message, ...args));
      }
    },
    debug(message: string, ...args: unknown[]) {
      if (shouldLog('debug')) {
        console.log(formatMessage('debug', prefix ? `[${prefix}] ${message}` : message, ...args));
      }
    },
  };
}

// 默认日志器
export const logger = createLogger();

/**
 * 进度条显示
 */
export class ProgressBar {
  private total: number;
  private current: number = 0;
  private message: string;
  private width: number = 30;

  constructor(message: string, total: number) {
    this.message = message;
    this.total = total;
  }

  update(current: number): void {
    this.current = current;
    const ratio = this.total > 0 ? current / this.total : 0;
    const filled = Math.round(ratio * this.width);
    const bar = '█'.repeat(filled) + '░'.repeat(this.width - filled);
    const percent = Math.round(ratio * 100);
    
    process.stdout.write(`\r${colors.cyan}${bar}${colors.reset} ${percent}% ${this.message} (${current}/${this.total})`);
    
    if (current >= this.total) {
      process.stdout.write('\n');
    }
  }

  increment(): void {
    this.update(this.current + 1);
  }

  complete(): void {
    this.update(this.total);
  }
}

/**
 * 分隔线
 */
export function divider(char: string = '=', length: number = 50): string {
  return char.repeat(length);
}

/**
 * 标题样式
 */
export function title(text: string): string {
  return `\n${colors.bright}${colors.cyan}${text}${colors.reset}\n`;
}

/**
 * 成功样式
 */
export function success(text: string): string {
  return `${colors.green}✓${colors.reset} ${text}`;
}

/**
 * 错误样式
 */
export function error(text: string): string {
  return `${colors.red}✗${colors.reset} ${text}`;
}

/**
 * 警告样式
 */
export function warning(text: string): string {
  return `${colors.yellow}⚠${colors.reset} ${text}`;
}
