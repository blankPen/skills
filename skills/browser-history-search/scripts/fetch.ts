#!/usr/bin/env bun

/**
 * 浏览器历史记录搜索工具
 * 支持 Chrome 和 Tabbit 浏览器历史记录查询
 */

import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

interface HistoryItem {
  url: string;
  title: string;
  visit_time: string;
  visit_count?: number;
  browser: string;
}

interface Output {
  browser: string;
  date: string;
  count: number;
  history: HistoryItem[];
}

// 时间戳常量
const CHROME_EPOCH_OFFSET = 11644473600; // Chrome 使用 Windows FILETIME，需要减去这个偏移

/**
 * 解析命令行参数
 */
function parseArgs(): {
  days?: number;
  date?: string;
  search?: string;
  browser?: string;
  limit?: number;
} {
  const args = process.argv.slice(2);
  const options: {
    days?: number;
    date?: string;
    search?: string;
    browser?: string;
    limit?: number;
  } = {};

  for (const arg of args) {
    if (arg.startsWith("--days=")) {
      options.days = parseInt(arg.slice(7), 10);
    } else if (arg.startsWith("--date=")) {
      options.date = arg.slice(7);
    } else if (arg.startsWith("--search=")) {
      options.search = arg.slice(9);
    } else if (arg.startsWith("--browser=")) {
      options.browser = arg.slice(10);
    } else if (arg.startsWith("--limit=")) {
      options.limit = parseInt(arg.slice(8), 10);
    }
  }

  // 设置默认值：--days 和 --date 互斥
  if (!options.days && !options.date) options.days = 1;
  if (options.limit === undefined) options.limit = 1000;

  return options;
}

/**
 * 查找 Chrome 历史数据库路径
 */
function findChromeHistoryPath(): string | null {
  const home = homedir();
  const candidates = [
    join(home, "Library/Application Support/Google/Chrome/Default/History"),
    join(home, ".config/google-chrome/Default/History"),
  ];

  for (const historyPath of candidates) {
    if (existsSync(historyPath)) {
      return historyPath;
    }
  }
  return null;
}

/**
 * 查找 Tabbit 历史数据库路径
 */
function findTabbitHistoryPath(): string | null {
  const home = homedir();
  const candidates = [
    join(home, "Library/Application Support/Tabbit/Default/History"),
  ];

  for (const historyPath of candidates) {
    if (existsSync(historyPath)) {
      return historyPath;
    }
  }
  return null;
}

/**
 * 执行 SQL 查询
 */
function runSqlQuery(dbPath: string, sql: string): string[] {
  try {
    const escapedDbPath = dbPath.replace(/"/g, '\\"');
    const escapedSql = sql.replace(/"/g, '\\"');

    const output = execSync(`sqlite3 -separator $'\\t' "${escapedDbPath}" "${escapedSql}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    return output.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * 计算 Chrome 时间戳范围
 */
function calcChromeTimestampRange(options: { days?: number; date?: string }): { start: number; end?: number } {
  if (options.date) {
    // 指定日期：计算该天的开始和结束时间戳（北京时间）
    // 日期格式：YYYY-MM-DD
    const [year, month, day] = options.date.split("-").map(Number);
    
    // 北京时间当天 00:00:00 = UTC 前一天 16:00:00
    const startUtc = new Date(Date.UTC(year, month - 1, day - 1, 16, 0, 0));
    // 北京时间当天 23:59:59 = UTC 当天 15:59:59
    const endUtc = new Date(Date.UTC(year, month - 1, day, 15, 59, 59));
    
    const start = Math.floor(startUtc.getTime() / 1000) * 1000000 + 11644473600000000;
    const end = Math.floor(endUtc.getTime() / 1000) * 1000000 + 11644473600000000;
    
    return { start, end };
  } else {
    // 按天数：计算从现在往前推 N 天的开始时间戳
    const days = options.days || 1;
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - days * 86400;
    const start = startTime * 1000000 + 11644473600000000;
    
    return { start };
  }
}

/**
 * 构建历史记录 SQL 查询
 */
function buildHistorySql(params: {
  search?: string;
  limit?: number;
  start: number;
  end?: number;
}): string {
  const timeCondition = params.end
    ? `last_visit_time > ${params.start} AND last_visit_time <= ${params.end}`
    : `last_visit_time > ${params.start}`;

  if (params.search) {
    const searchTerm = params.search.replace(/'/g, "''");
    return `
SELECT
  url,
  IFNULL(title, ''),
  IFNULL(last_visit_time, 0),
  IFNULL(visit_count, 0)
FROM urls
WHERE (url LIKE '%${searchTerm}%' OR title LIKE '%${searchTerm}%')
  AND ${timeCondition}
ORDER BY last_visit_time DESC
LIMIT ${params.limit || 1000};
`.trim();
  } else {
    return `
SELECT
  url,
  IFNULL(title, ''),
  IFNULL(last_visit_time, 0),
  IFNULL(visit_count, 0)
FROM urls
WHERE ${timeCondition}
ORDER BY last_visit_time DESC
LIMIT ${params.limit || 1000};
`.trim();
  }
}

/**
 * 从 Chrome 类型浏览器获取历史记录
 */
function getChromeTypeHistory(options: {
  days?: number;
  date?: string;
  search?: string;
  limit?: number;
  type: "chrome" | "tabbit";
}): HistoryItem[] {
  const find = {
    chrome: findChromeHistoryPath,
    tabbit: findTabbitHistoryPath,
  };

  const historyPath = find[options.type]();
  if (!historyPath) {
    return [];
  }

  const tempPath = join(tmpdir(), `chrome-history-${Date.now()}.db`);

  try {
    // 复制文件避免锁定
    copyFileSync(historyPath, tempPath);

    // 计算时间戳范围
    const { start, end } = calcChromeTimestampRange({
      days: options.days,
      date: options.date,
    });

    // 构建查询
    const sql = buildHistorySql({
      search: options.search,
      limit: options.limit,
      start,
      end,
    });

    const results: HistoryItem[] = [];

    for (const line of runSqlQuery(tempPath, sql)) {
      const parts = line.split("\t");
      if (parts.length < 4) continue;

      const chromeTimestamp = Number(parts[2]) || 0;
      // Chrome 时间戳是微秒级 Windows FILETIME，转换为 Unix 秒再转为本地时间
      const unixTimestamp = chromeTimestamp > 0 ? chromeTimestamp / 1000000 - CHROME_EPOCH_OFFSET : 0;
      const localDate = unixTimestamp > 0 ? new Date(unixTimestamp * 1000) : new Date(0);
      // 使用 Asia/Shanghai 时区格式化时间 (YYYY-MM-DD HH:MM:SS)
      const localTimeStr = localDate.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).replace(/\//g, "-");

      results.push({
        url: parts[0] || "",
        title: parts[1] || "",
        visit_time: localTimeStr,
        visit_count: Number(parts[3]) || 0,
        browser: options.type,
      });
    }

    return results;
  } catch (error) {
    console.error(`读取 ${options.type} 历史记录失败:`, error);
    return [];
  } finally {
    try {
      unlinkSync(tempPath);
    } catch {
      // 忽略清理错误
    }
  }
}

/**
 * 格式化时间范围显示
 */
function formatTimeRange(options: { days?: number; date?: string }): string {
  if (options.date) {
    return `日期: ${options.date}`;
  } else {
    return `最近 ${options.days || 1} 天`;
  }
}

/**
 * 主函数
 */
function main() {
  const options = parseArgs();
  const browsers = options.browser || "all";

  console.log(`🔍 搜索浏览器历史记录...`);
  console.log(`   时间范围: ${formatTimeRange(options)}`);
  if (options.search) {
    console.log(`   搜索关键词: ${options.search}`);
  }
  console.log("");

  let allHistory: HistoryItem[] = [];

  // 获取 Chrome 历史
  if (browsers === "all" || browsers === "chrome") {
    const chromeHistory = getChromeTypeHistory({ ...options, type: "chrome" });
    if (chromeHistory.length > 0) {
      allHistory.push(...chromeHistory);
    }
  }

  // 获取 Tabbit 历史
  if (browsers === "all" || browsers === "tabbit") {
    const tabbitHistory = getChromeTypeHistory({ ...options, type: "tabbit" });
    if (tabbitHistory.length > 0) {
      allHistory.push(...tabbitHistory);
    }
  }

  // 输出结果
  if (allHistory.length > 0) {
    // 按时间排序
    allHistory.sort((a, b) => b.visit_time.localeCompare(a.visit_time));
    // 过滤空标题和登录页
    allHistory = allHistory.filter((v) => !!v.title.trim() && !v.title.includes("登录"));

    console.log(allHistory.map((v) => [v.visit_time, v.browser, v.title, v.url].join("  ")).join("\n"));
  } else {
    console.log("❌ 未找到任何浏览器历史记录");
  }
}

// 运行主函数
main();
