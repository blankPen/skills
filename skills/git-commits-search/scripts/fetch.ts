#!/usr/bin/env bun

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

interface Output {
  date: string;
  time_range: { start: string; end: string };
  commits: GitCommit[];
  total: number;
}

interface Options {
  workspaces?: string[];
  date?: string;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {};

  for (const arg of args) {
    if (arg.startsWith("--workspaces=")) {
      options.workspaces = arg.slice(13).split(",");
    } else if (arg.startsWith("--date=")) {
      options.date = arg.slice(7);
    }
  }

  return options;
}

function getRepos(options: Options): string[] {
  // 默认扫描 workspace，自动查找所有 git 仓库
  return scanWorkspaceForGitRepos(options);
}

/**
 * 递归扫描目录下的所有 Git 仓库
 */
function scanWorkspaceForGitRepos(options: Options): string[] {
  const workspaces = options.workspaces || [join(home())];
  const gitRepos: string[] = [];

  function scanDir(dir: string, depth: number = 0): void {
    // console.log(`Scanning ${dir} at depth ${depth}`);
    // if (depth > 3) return; // 限制递归深度

    try {
      const entries = require("fs").readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // 跳过常见不需要扫描的目录
        if (entry.name.startsWith(".") ||
          entry.name === "node_modules" ||
          entry.name === "vendor" ||
          entry.name === "vendor/bundle" ||
          entry.name === "dist" ||
          entry.name === "build" ||
          entry.name === ".git") continue;

        const fullPath = join(dir, entry.name);

        // 检查是否是 git 仓库
        if (require("fs").existsSync(join(fullPath, ".git"))) {
          gitRepos.push(fullPath);
          continue; // 不继续深入扫描 git 仓库内部
        }

        // 继续递归扫描子目录
        scanDir(fullPath, depth + 1);
      }
    } catch {
      // 忽略无法访问的目录
    }
  }

  workspaces.map(workspace => {
    if (require("fs").existsSync(workspace)) {
      scanDir(workspace);
      console.log(`Found ${gitRepos.length} git repositories in ${workspace}`);
    }
  });

  // if (require("fs").existsSync(workspace)) {
  //   scanDir(workspace);
  // }


  return gitRepos;
}

function home(): string {
  return process.env.HOME || "/Users/admin";
}

function join(...paths: string[]): string {
  return paths.join("/");
}

function getDateDir(date: string): string {
  return join(home(), ".x-git-commits", date);
}

function ensureDir(dir: string): void {
  const fs = require("fs");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getCommitsForRepo(repoPath: string, date: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const repoName = repoPath.split("/").pop() || repoPath;

  try {
    const since = `${date} 00:00:00`;
    const until = `${date} 23:59:59`;

    // Get commit hashes for the date
    const logCmd = `git -C "${repoPath}" log --since="${since}" --until="${until}" --format="%H|%an|%ae|%s|%ci" --name-only`;
    const logOutput = execSync(logCmd, { encoding: "utf-8", silent: true });

    const entries = logOutput.trim().split("\n\n").filter(Boolean);

    for (const entry of entries) {
      const lines = entry.split("\n");
      if (lines.length === 0) continue;

      const header = lines[0].split("|");
      if (header.length < 5) continue;

      const [hash, author, email, subject, dateStr] = header;
      const files = lines.slice(1).filter(Boolean);

      // Get diff stats for this commit
      let additions = 0;
      let deletions = 0;
      try {
        const statsCmd = `git -C "${repoPath}" show --stat --format="" ${hash}`;
        const statsOutput = execSync(statsCmd, { encoding: "utf-8" });
        const statsLines = statsOutput.trim().split("\n");

        for (const line of statsLines) {
          const match = line.match(/(\d+)\s+(\d+)/);
          if (match) {
            additions += parseInt(match[1], 10);
            deletions += parseInt(match[2], 10);
          }
        }
      } catch {
        // Ignore errors getting stats
      }

      commits.push({
        hash,
        repo: repoName,
        author,
        email,
        subject,
        date: dateStr,
        files,
        additions,
        deletions,
      });
    }
  } catch (error) {
    // Repo might not have commits on this date, or not be a git repo
    // console.error(`Error getting commits from ${repoPath}:`, error.message);
  }

  return commits;
}

function execSync(cmd: string, options: any): string {
  const { execSync: sync } = require("child_process");
  // 静默执行，忽略 stderr 输出，避免 git 错误信息干扰
  return sync(cmd, { ...options, stdio: "pipe" }) as string;
}
function main() {
  const options = parseArgs();
  const date = options.date || new Date().toISOString().split("T")[0];
  const repos = getRepos(options);

  const allCommits: GitCommit[] = [];
  let startTime = "";
  let endTime = "";

  for (const repo of repos) {
    const commits = getCommitsForRepo(repo, date);
    allCommits.push(...commits);

    if (commits.length > 0) {
      if (!startTime || commits[0].date < startTime) {
        startTime = commits[0].date;
      }
      const lastCommit = commits[commits.length - 1];
      if (!endTime || lastCommit.date > endTime) {
        endTime = lastCommit.date;
      }
    }
  }

  // Sort by date descending
  allCommits.sort((a, b) => b.date.localeCompare(a.date));

  const output: Output = {
    date,
    time_range: {
      start: startTime || "",
      end: endTime || "",
    },
    commits: allCommits,
    total: allCommits.length,
  };

  const outputDir = getDateDir(date);
  ensureDir(outputDir);
  const outputPath = join(outputDir, "commits.json");

  const fs = require("fs");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`Output written to ${outputPath}`);
  console.log(`Total commits: ${output.total}`);
}

main();
