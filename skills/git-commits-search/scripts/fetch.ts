#!/usr/bin/env bun

/**
 * Git 提交记录搜索工具
 * 获取指定日期/时间范围内的 Git 提交记录
 */

interface GitCommit {
  hash: string;
  repo: string;
  author: string;
  email: string;
  subject: string;
  date: string;
  files: string[];
  additions: number;
  deletions: number;
}
interface Options {
  workspaces?: string[];
  date?: string;
  days?: number;
  author?: string;
  all?: boolean; // 是否显示所有作者，默认为 false（只显示自己）
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {};

  for (const arg of args) {
    if (arg.startsWith("--workspaces=")) {
      options.workspaces = arg.slice(13).split(",");
    } else if (arg.startsWith("--date=")) {
      options.date = arg.slice(7);
    } else if (arg.startsWith("--days=")) {
      options.days = parseInt(arg.slice(7), 10);
    } else if (arg === "--all") {
      options.all = true;
    }
  }

  // 自动获取 git 用户名作为 author 过滤
  if (!options.author && !options.all) {
    const gitUser = getGitUser();
    if (gitUser) {
      options.author = gitUser;
    }
  }

  return options;
}

/**
 * 获取当前 Git 用户名
 */
function getGitUser(): string | null {
  try {
    const name = execSync(`git config --global user.name`, { encoding: "utf-8" }).trim();
    return name || null;
  } catch {
    return null;
  }
}

function home(): string {
  return process.env.HOME || "/Users/admin";
}

/**
 * 递归扫描目录下的所有 Git 仓库
 * @param maxDepthInsideRepo 在发现 .git 目录后，最多继续深入扫描的层数
 */
function scanWorkspaceForGitRepos(options: Options, maxDepthInsideRepo: number = 3): string[] {
  const workspaces = options.workspaces || [home()];
  const gitRepos: string[] = [];

  function scanDir(dir: string, depth: number = 0): void {
    try {
      const entries = require("fs").readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // 跳过常见不需要扫描的目录
        if (
          entry.name.startsWith(".") ||
          entry.name === "node_modules" ||
          entry.name === "vendor" ||
          entry.name === "dist" ||
          entry.name === "build"
        ) continue;

        const fullPath = require("path").join(dir, entry.name);

        // 检查是否是 git 仓库
        if (require("fs").existsSync(require("path").join(fullPath, ".git"))) {
          gitRepos.push(fullPath);
          // 找到 .git 后，不再继续深入扫描该仓库内部
          continue;
        }

        // 继续递归扫描子目录（最多深入 maxDepthInsideRepo 层）
        if (depth < maxDepthInsideRepo) {
          scanDir(fullPath, depth + 1);
        }
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  for (const workspace of workspaces) {
    if (require("fs").existsSync(workspace)) {
      scanDir(workspace);
    }
  }

  return gitRepos;
}

/**
 * 从指定时间范围获取提交记录
 * @param author 如果指定，则只查询该作者的提交
 */
function getCommitsForRepo(repoPath: string, since: string, until: string, author?: string): GitCommit[] {
  const commits: GitCommit[] = [];
  let repoName = repoPath.split("/").pop() || repoPath;

  try {
    const gitRemote = execSync(`git -C "${repoPath}" remote get-url origin`, { encoding: "utf-8", silent: true }).trim();

    if (gitRemote) {
      if (gitRemote.startsWith("git@")) {
        repoName = gitRemote.split(":")[1].split(".git")[0];
      } else if (gitRemote.startsWith("https://")) {
        const [, ...rest] = gitRemote.replace("https://", "").split("/")
        repoName = rest.join("/").split(".git")[0];
      }
    }

    // 查询指定时间范围内的 commit 记录
    const authorFilter = author ? `--author="${author}"` : "";
    const logCmd = `git -C "${repoPath}" log ${authorFilter} --since="${since}" --until="${until}" --format="%H|%an|%ae|%s|%ci" --name-only`;
    const logOutput = execSync(logCmd, { encoding: "utf-8", silent: true });

    // 逐行解析 git log 输出：
    // 格式: hash|author|email|subject|date
    //       filename1
    //       filename2
    //       (空行)
    //       next-commit...
    const lines = logOutput.split("\n");
    let i = 0;
    let currentCommit: Partial<GitCommit> | null = null;

    while (i < lines.length) {
      const line = lines[i];

      // 检查是否是空行
      if (!line.trim()) {
        i++;
        continue;
      }

      // 检查是否是 commit header（以 40 位 hash 开头）
      if (line.match(/^[0-9a-f]{40}\|/)) {
        // 保存上一个 commit
        if (currentCommit && currentCommit.hash) {
          commits.push(currentCommit as GitCommit);
        }

        // 解析新的 commit header
        const parts = line.split("|");
        if (parts.length >= 5) {
          currentCommit = {
            hash: parts[0],
            author: parts[1],
            email: parts[2],
            subject: parts[3],
            date: parts[4].split(" +")[0],
            files: [],
            additions: 0,
            deletions: 0,
            repo: repoName,
          };
        }
        i++;
        continue;
      }

      // 否则是文件名（属于当前 commit）
      if (currentCommit && line.trim()) {
        currentCommit.files = currentCommit.files || [];
        currentCommit.files.push(line.trim());
      }

      i++;
    }

    // 保存最后一个 commit
    if (currentCommit && currentCommit.hash) {
      commits.push(currentCommit as GitCommit);
    }

    // 获取每个 commit 的统计信息
    for (const commit of commits) {
      try {
        const statsCmd = `git -C "${repoPath}" show --stat --format="" ${commit.hash}`;
        const statsOutput = execSync(statsCmd, { encoding: "utf-8" });
        const statsLines = statsOutput.trim().split("\n");

        for (const statsLine of statsLines) {
          // 匹配格式: " N +" 表示插入行数
          const insertionMatch = statsLine.match(/(\d+)\s+\+/);
          // 匹配格式: " N -" 表示删除行数
          const deletionMatch = statsLine.match(/(\d+)\s+-/);
          if (insertionMatch) {
            commit.additions += parseInt(insertionMatch[1], 10);
          }
          if (deletionMatch) {
            commit.deletions += parseInt(deletionMatch[1], 10);
          }
        }
      } catch {
        // Ignore errors getting stats
      }
    }
  } catch {
    // Repo might not have commits on this date, or not be a git repo
  }

  return commits;
}

function execSync(cmd: string, options: any): string {
  const { execSync: sync } = require("child_process");
  return sync(cmd, { ...options, stdio: "pipe" }) as string;
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
 * 格式化输出提交记录
 */
function formatCommitOutput(commits: GitCommit[]): string {
  if (commits.length === 0) {
    return "无提交记录";
  }

  let output = "";
  let currentRepo = "";

  for (const commit of commits) {
    // 如果换了仓库，显示仓库名
    if (commit.repo !== currentRepo) {
      currentRepo = commit.repo;
      output += `\n📁 ${currentRepo}\n`;
      output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    }

    // 格式化时间
    const time = commit.date.split(" ")[1]?.slice(0, 8) || "";
    const subject = commit.subject.length > 50 ? commit.subject.slice(0, 50) + "..." : commit.subject;
    const filesStr = commit.files.length > 0 ? `[${commit.files.length} files]` : "";

    output += `${time}  ${subject}\n`;
    if (filesStr) {
      output += `         ${filesStr} +${commit.additions} -${commit.deletions}\n`;
    }
    output += "\n";
  }

  return output;
}

function main() {
  const options = parseArgs();
  const repos = scanWorkspaceForGitRepos(options);

  if (repos.length === 0) {
    console.log("未找到任何 Git 仓库");
    return;
  }

  console.log(`🔍 搜索 Git 提交记录...`);
  console.log(`   时间范围: ${formatTimeRange(options)}`);
  console.log(`   作者: ${options.all ? "全部" : (options.author || "自动检测")}`);
  console.log(`   扫描仓库: ${repos.length} 个`);

  // 计算时间范围
  const now = new Date();
  let since: string;
  let until: string = `${now.toISOString().split("T")[0]} 23:59:59`;

  if (options.date) {
    since = `${options.date} 00:00:00`;
    until = `${options.date} 23:59:59`;
  } else {
    const days = options.days || 1;
    const sinceDate = new Date(now.getTime() - days * 86400 * 1000);
    since = `${sinceDate.toISOString().split("T")[0]} 00:00:00`;
  }

  // 收集所有提交
  const allCommits: GitCommit[] = [];

  for (const repo of repos) {
    const commits = getCommitsForRepo(repo, since, until, options.all ? undefined : options.author);
    allCommits.push(...commits);
  }

  // 按时间排序
  allCommits.sort((a, b) => b.date.localeCompare(a.date));

  if (allCommits.length === 0) {
    console.log("❌ 未找到任何提交记录");
    return;
  }

  // 格式化输出
  console.log(allCommits.map(v => ({
    date: v.date,
    repo: v.repo,
    message: v.subject,
    files: v.files.length,
    additions: v.additions,
    deletions: v.deletions,
  })));

  // 统计信息
  const repoStats = new Map<string, number>();
  for (const commit of allCommits) {
    repoStats.set(commit.repo, (repoStats.get(commit.repo) || 0) + 1);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📊 总计: ${allCommits.length} 条提交`);
  for (const [repo, count] of repoStats) {
    console.log(`   ${repo}: ${count} 条`);
  }
}

main();
