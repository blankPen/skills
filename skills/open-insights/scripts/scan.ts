#!/usr/bin/env bun
/**
 * 统一扫描入口
 * 支持多 Agent 工具会话扫描
 * 
 * 使用方式：
 *   bun run scripts/scan.ts              # 交互式选择
 *   bun run scripts/scan.ts --cursor     # 仅扫描 Cursor
 *   bun run scripts/scan.ts --claude     # 仅扫描 ClaudeCode
 *   bun run scripts/scan.ts --opencode  # 仅扫描 OpenCode
 *   bun run scripts/scan.ts --all        # 扫描所有工具
 *   bun run scripts/scan.ts --path=~/custom/path  # 自定义路径
 */

import { readFileSync } from 'fs';
import { AgentType, UnifiedSession, ScanResult } from './core/interfaces.js';
import { CursorAdapter, createCursorAdapter } from './adapters/cursor-adapter.js';
import { ClaudeCodeAdapter, createClaudeCodeAdapter } from './adapters/claude-code-adapter.js';
import { OpenCodeAdapter, createOpenCodeAdapter } from './adapters/opencode-adapter.js';
import { logger, title, success, error, warning } from './utils/logger.js';
import { getOutputDir, getOutputDirByAgent, normalizePath } from './utils/paths.js';

// 适配器注册表
const adapters: Record<AgentType, () => any> = {
  'cursor': createCursorAdapter,
  'claude-code': createClaudeCodeAdapter,
  'opencode': createOpenCodeAdapter,
};

// 适配器显示名称
const adapterNames: Record<AgentType, string> = {
  'cursor': 'Cursor',
  'claude-code': 'ClaudeCode',
  'opencode': 'OpenCode',
};

/**
 * 检测已安装的工具
 */
async function detectInstalledTools(): Promise<Record<AgentType, boolean>> {
  const results: Record<AgentType, boolean> = {
    'cursor': false,
    'claude-code': false,
    'opencode': false,
  };

  for (const [name, createAdapter] of Object.entries(adapters)) {
    try {
      const adapter = createAdapter();
      results[name as AgentType] = await adapter.isInstalled();
    } catch (e) {
      logger.warn(`检测 ${name} 失败`, e);
    }
  }

  return results;
}

/**
 * 扫描指定工具
 */
async function scanTool(
  tool: AgentType,
  customPath?: string
): Promise<{ sessions: UnifiedSession[]; error?: string }> {
  const createAdapter = adapters[tool];
  if (!createAdapter) {
    return { sessions: [], error: `未知工具: ${tool}` };
  }

  try {
    const adapter = createAdapter();
    const sessions = await adapter.scanSessions(customPath);
    return { sessions };
  } catch (e) {
    return { sessions: [], error: String(e) };
  }
}

/**
 * 主扫描函数
 */
async function scan(
  tools?: AgentType[],
  customPaths?: Partial<Record<AgentType, string>>
): Promise<ScanResult> {
  const result: ScanResult = {
    sessions: [],
    totalCount: 0,
    byTool: {
      'cursor': 0,
      'claude-code': 0,
      'opencode': 0,
    },
    errors: [],
  };

  // 确定要扫描的工具
  const toolsToScan = tools || (Object.keys(adapters) as AgentType[]);

  logger.info(`开始扫描工具: ${toolsToScan.map(t => adapterNames[t]).join(', ')}`);

  for (const tool of toolsToScan) {
    const customPath = customPaths?.[tool];
    const toolName = adapterNames[tool];
    
    logger.info(`扫描 ${toolName}...`);
    
    const { sessions, error } = await scanTool(tool, customPath);
    
    if (error) {
      logger.error(`${toolName} 扫描失败:`, error);
      result.errors.push(`${toolName}: ${error}`);
    } else {
      result.sessions.push(...sessions);
      result.byTool[tool] = sessions.length;
      result.totalCount += sessions.length;
      logger.info(`${toolName}: 找到 ${sessions.length} 个会话`);
    }
  }

  return result;
}

/**
 * 打印扫描结果摘要
 */
function printSummary(result: ScanResult): void {
  console.log('\n' + title('扫描完成'));
  
  for (const [tool, count] of Object.entries(result.byTool)) {
    if (count > 0) {
      console.log(success(`${adapterNames[tool as AgentType]}: ${count} 个会话`));
    }
  }
  
  console.log(`\n总计: ${result.totalCount} 个会话`);
  console.log(`输出目录:
  - Cursor: ${getOutputDirByAgent('cursor')}
  - ClaudeCode: ${getOutputDirByAgent('claude-code')}
  - OpenCode: ${getOutputDirByAgent('opencode')}`);
  
  if (result.errors.length > 0) {
    console.log('\n' + warning('错误:'));
    for (const err of result.errors) {
      console.log(error(err));
    }
  }
}

/**
 * 解析命令行参数
 */
function parseArgs(): {
  tools?: AgentType[];
  customPaths?: Partial<Record<AgentType, string>>;
  help?: boolean;
} {
  const args = process.argv.slice(2);
  const result: {
    tools?: AgentType[];
    customPaths?: Partial<Record<AgentType, string>>;
    help?: boolean;
  } = {};

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }

    if (arg === '--all') {
      result.tools = ['cursor', 'claude-code', 'opencode'];
      continue;
    }

    if (arg.startsWith('--cursor')) {
      result.tools = result.tools || [];
      result.tools.push('cursor');
      continue;
    }

    if (arg.startsWith('--claude') || arg.startsWith('--claude-code')) {
      result.tools = result.tools || [];
      result.tools.push('claude-code');
      continue;
    }

    if (arg.startsWith('--opencode')) {
      result.tools = result.tools || [];
      result.tools.push('opencode');
      continue;
    }

    if (arg.startsWith('--path=')) {
      const path = arg.slice(7);
      // 尝试推断工具（通过路径特征）
      if (path.includes('.cursor')) {
        result.customPaths = result.customPaths || {};
        result.customPaths['cursor'] = path;
        result.tools = result.tools || [];
        if (!result.tools.includes('cursor')) result.tools.push('cursor');
      } else if (path.includes('.claude')) {
        result.customPaths = result.customPaths || {};
        result.customPaths['claude-code'] = path;
        result.tools = result.tools || [];
        if (!result.tools.includes('claude-code')) result.tools.push('claude-code');
      } else if (path.includes('opencode')) {
        result.customPaths = result.customPaths || {};
        result.customPaths['opencode'] = path;
        result.tools = result.tools || [];
        if (!result.tools.includes('opencode')) result.tools.push('opencode');
      }
      continue;
    }
  }

  return result;
}

/**
 * 显示帮助信息
 */
function showHelp(): void {
  console.log(`
${title('Agent Insights 扫描工具')}

用法:
  bun run scripts/scan.ts [选项]

选项:
  --cursor, --claude, --opencode  选择要扫描的工具
  --all                           扫描所有已安装的工具
  --path=<路径>                   指定自定义数据路径
  --help, -h                     显示帮助信息

示例:
  bun run scripts/scan.ts                    # 交互式选择
  bun run scripts/scan.ts --all               # 扫描所有工具
  bun run scripts/scan.ts --cursor             # 仅扫描 Cursor
  bun run scripts/scan.ts --claude-code        # 仅扫描 ClaudeCode
  bun run scripts/scan.ts --path=~/.custom/    # 指定自定义路径

输出:
  扫描结果将保存到 ~/.agent-insights/conversations/ 目录
  每个会话保存为独立的 .md 文件
`);
}

/**
 * 主函数
 */
async function main() {
  const args = parseArgs();

  if (args.help) {
    showHelp();
    return;
  }

  console.log(title('🔍 Agent Insights 扫描工具'));

  // 检测已安装的工具
  const installed = await detectInstalledTools();
  
  const availableTools: AgentType[] = [];
  for (const [tool, isInstalled] of Object.entries(installed)) {
    if (isInstalled) {
      availableTools.push(tool as AgentType);
      console.log(success(`${adapterNames[tool as AgentType]} 已安装`));
    } else {
      console.log(warning(`${adapterNames[tool as AgentType]} 未安装`));
    }
  }

  if (availableTools.length === 0) {
    console.log(error('没有检测到已安装的 Agent 工具'));
    console.log('请确保已安装 Cursor、ClaudeCode 或 OpenCode 之一');
    process.exit(1);
  }

  // 确定要扫描的工具
  let tools = args.tools;
  
  if (!tools || tools.length === 0) {
    // 默认扫描所有已安装的工具
    tools = availableTools;
  } else {
    // 过滤未安装的工具
    tools = tools.filter(t => installed[t]);
    if (tools.length === 0) {
      console.log(error('指定的所有工具都未安装'));
      process.exit(1);
    }
  }

  // 执行扫描
  console.log('');
  const result = await scan(tools, args.customPaths);
  
  // 打印结果摘要
  printSummary(result);

  // 输出 JSON 格式结果（供后续处理使用）
  console.log('\n---JSON_OUTPUT---');
  console.log(JSON.stringify({
    totalCount: result.totalCount,
    byTool: result.byTool,
    errors: result.errors,
  }, null, 2));
}

// 运行主函数
main().catch((err) => {
  logger.error('扫描失败', err);
  process.exit(1);
});
