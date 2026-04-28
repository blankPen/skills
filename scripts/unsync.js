#!/usr/bin/env bun

/**
 * 删除已同步的 skills 软链接
 *
 * 用法:
 *   bun ./scripts/unsync.js                    # 删除所有 skills 软链接
 *   bun ./scripts/unsync.js --skills foo,bar   # 只删除指定 skills 软链接
 *   bun ./scripts/unsync.js --dirs .claude     # 只删除指定目录下的软链接
 *   bun ./scripts/unsync.js --dry-run          # 预览模式，不执行实际操作
 */

import { existsSync, unlinkSync, readdirSync, lstatSync, statSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

const SKILLS_DIR = join(process.cwd(), "skills");

const TARGET_DIRS = {
  ".claude": join(process.env.HOME, ".claude", "skills"),
  ".openclaw": join(process.env.HOME, ".openclaw", "skills"),
};

// 获取当前仓库的 skills 列表
function getRepoSkills() {
  if (!existsSync(SKILLS_DIR)) {
    return [];
  }
  return readdirSync(SKILLS_DIR).filter((name) => {
    const skillPath = join(SKILLS_DIR, name);
    return statSync(skillPath).isDirectory();
  });
}

// 解析命令行参数
const { values } = parseArgs({
  options: {
    skills: { type: "string", short: "s" },
    dirs: { type: "string", short: "d" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`
删除 skills 软链接

用法:
  bun ./scripts/unsync.js [选项]

选项:
  --skills <name1,name2>  指定要删除的 skills（逗号分隔），默认全部
  --dirs <dir1,dir2>       指定目标目录（.claude/.openclaw），默认全部
  --dry-run                预览模式，不执行实际操作
  --help, -h               显示帮助信息

示例:
  bun ./scripts/unsync.js                           # 删除所有软链接
  bun ./scripts/unsync.js --skills last30days       # 只删除 last30days
  bun ./scripts/unsync.js --dirs .claude             # 只删除 .claude 下的软链接
  bun ./scripts/unsync.js --dry-run                 # 预览
`);
  process.exit(0);
}

// 解析 skills 列表
const skillsToRemove = values.skills
  ? values.skills.split(",").map((s) => s.trim())
  : null;

// 解析目标目录列表
const dirsToProcess = values.dirs
  ? values.dirs.split(",").map((d) => d.trim())
  : Object.keys(TARGET_DIRS);

// 验证目标目录
for (const dir of dirsToProcess) {
  if (!TARGET_DIRS[dir]) {
    console.error(`错误: 未知的目标目录 "${dir}"。可用选项: ${Object.keys(TARGET_DIRS).join(", ")}`);
    process.exit(1);
  }
}

// 检查是否为软链接
function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// 获取目录下的软链接
function getSymlinks(dirPath) {
  if (!existsSync(dirPath)) {
    return [];
  }
  return readdirSync(dirPath).filter((name) => isSymlink(join(dirPath, name)));
}

// 删除单个软链接
function removeSymlink(skillName, targetDir, dryRun = false) {
  const targetPath = join(targetDir, skillName);

  if (!existsSync(targetPath)) {
    console.log(`  跳过: 不存在 ${targetPath}`);
    return false;
  }

  if (!isSymlink(targetPath)) {
    console.error(`  跳过: 不是软链接 ${targetPath}`);
    return false;
  }

  if (dryRun) {
    console.log(`  [dry-run] 删除软链接: ${targetPath}`);
  } else {
    unlinkSync(targetPath);
    console.log(`  删除软链接: ${targetPath}`);
  }

  return true;
}

// 主函数
function main() {
  const repoSkills = getRepoSkills();

  console.log("\n=== Skills 取消同步工具 ===\n");
  console.log(`仓库 skills 目录: ${SKILLS_DIR}`);
  console.log(`仓库内 skills: ${repoSkills.join(", ")}`);
  console.log(`目标目录: ${dirsToProcess.map((d) => `${d} -> ${TARGET_DIRS[d]}`).join(", ")}`);
  console.log(`待删除 skills: ${skillsToRemove ? skillsToRemove.join(", ") : "仓库内的全部软链接"}`);
  console.log(`模式: ${values["dry-run"] ? "dry-run (预览)" : "实际删除"}`);
  console.log();

  let totalRemoved = 0;
  const errors = [];

  for (const dir of dirsToProcess) {
    const targetDir = TARGET_DIRS[dir];

    if (!existsSync(targetDir)) {
      console.log(`\n${dir} (${targetDir}): 目录不存在，跳过`);
      continue;
    }

    const symlinks = getSymlinks(targetDir);

    if (symlinks.length === 0) {
      console.log(`\n${dir} (${targetDir}): 无软链接`);
      continue;
    }

    // 只处理存在于当前仓库 skills 目录中的软链接
    const repoSymlinks = symlinks.filter((s) => repoSkills.includes(s));

    if (repoSymlinks.length === 0) {
      console.log(`\n${dir} (${targetDir}): 无仓库内的软链接`);
      continue;
    }

    console.log(`\n处理 ${dir} (${targetDir}):`);

    const skillsToProcess = skillsToRemove
      ? repoSymlinks.filter((s) => skillsToRemove.includes(s))
      : repoSymlinks;

    for (const skill of skillsToProcess) {
      try {
        if (removeSymlink(skill, targetDir, values["dry-run"])) {
          totalRemoved++;
        }
      } catch (err) {
        errors.push({ skill, dir, error: err.message });
        console.error(`  错误: ${err.message}`);
      }
    }
  }

  console.log("\n=== 完成 ===");
  console.log(`成功删除: ${totalRemoved}`);

  if (errors.length > 0) {
    console.log(`失败: ${errors.length}`);
    for (const e of errors) {
      console.error(`  - ${e.skill} -> ${e.dir}: ${e.error}`);
    }
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
