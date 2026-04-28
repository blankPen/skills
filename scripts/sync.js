#!/usr/bin/env bun

/**
 * 同步 skills 目录到多个 agent 目录
 *
 * 用法:
 *   bun ./scripts/sync.js                    # 交互式模式
 *   bun ./scripts/sync.js --skills foo,bar   # 只同步指定 skills
 *   bun ./scripts/sync.js --dirs .claude     # 只同步到指定目录
 *   bun ./scripts/sync.js --dry-run          # 预览模式
 *
 * 目标目录: .claude, .openclaw, .cursor, .windsurf, .aider, .continue
 */

import { existsSync, symlinkSync, unlinkSync, mkdirSync, readdirSync, statSync, lstatSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";
import { multiselect, isCancel } from "@clack/prompts";

// Ctrl+C 立即退出
process.on("SIGINT", () => {
  console.log("\n已取消");
  process.exit(0);
});

const SKILLS_DIR = join(process.cwd(), "skills");

const TARGET_DIRS = {
  ".claude": join(process.env.HOME, ".claude", "skills"),
  ".openclaw": join(process.env.HOME, ".openclaw", "skills"),
  ".cursor": join(process.env.HOME, ".cursor", "skills"),
  ".windsurf": join(process.env.HOME, ".windsurf", "skills"),
  ".aider": join(process.env.HOME, ".aider", "skills"),
  ".continue": join(process.env.HOME, ".continue", "skills"),
};

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
同步 skills 到多个 agent 目录

用法:
  bun ./scripts/sync.js [选项]

选项:
  --skills <name1,name2>  指定要同步的 skills（逗号分隔），默认全部
  --dirs <dir1,dir2>       指定目标目录，默认全部
  --dry-run                预览模式，不执行实际操作
  --help, -h               显示帮助信息

目标目录:
  .claude, .openclaw, .cursor, .windsurf, .aider, .continue

示例:
  bun ./scripts/sync.js                           # 交互式模式
  bun ./scripts/sync.js --skills last30days       # 只同步 last30days
  bun ./scripts/sync.js --skills foo,bar --dirs .claude  # 只同步到 .claude
  bun ./scripts/sync.js --dry-run                 # 预览
`);
  process.exit(0);
}

// 获取 skills 目录下的所有 skill
function getAllSkills() {
  if (!existsSync(SKILLS_DIR)) {
    console.error(`错误: skills 目录不存在: ${SKILLS_DIR}`);
    process.exit(1);
  }

  return readdirSync(SKILLS_DIR).filter((name) => {
    const skillPath = join(SKILLS_DIR, name);
    const stat = statSync(skillPath);
    return stat.isDirectory();
  });
}

// 检查是否为软链接
function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// 同步单个 skill 到目标目录
function syncSkill(skillName, targetDir, dryRun = false) {
  const sourcePath = join(SKILLS_DIR, skillName);
  const targetPath = join(targetDir, skillName);

  // 检查源目录是否存在
  if (!existsSync(sourcePath)) {
    console.error(`  跳过: 源目录不存在 ${sourcePath}`);
    return false;
  }

  const targetExists = existsSync(targetPath);
  const targetIsLink = isSymlink(targetPath);

  // 如果目标已存在且是软链接，删除它
  if (targetExists && targetIsLink) {
    if (dryRun) {
      console.log(`  [dry-run] 删除软链接: ${targetPath}`);
    } else {
      unlinkSync(targetPath);
      console.log(`  删除旧软链接: ${targetPath}`);
    }
  } else if (targetExists && !targetIsLink) {
    console.error(`  跳过: 目标已存在且不是软链接: ${targetPath}`);
    return false;
  }

  // 创建软链接
  if (dryRun) {
    console.log(`  [dry-run] 创建软链接: ${targetPath} -> ${sourcePath}`);
  } else {
    // 确保目标目录存在
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }
    symlinkSync(sourcePath, targetPath);
    console.log(`  创建软链接: ${targetPath} -> ${sourcePath}`);
  }

  return true;
}

// 检查是否进入交互式模式（无参数时）
function shouldRunInteractively() {
  return !values.skills && !values.dirs && !values["dry-run"] && process.stdin.isTTY;
}

// 交互式模式
async function runInteractively() {
  console.log("\n=== Skills 同步工具 (交互式模式) ===\n");

  const allSkills = getAllSkills();

  // Step 1: 选择目标目录
  const selectedDirs = await multiselect({
    message: "选择目标目录:",
    options: [
      { label: ".claude", value: ".claude", hint: TARGET_DIRS[".claude"] },
      { label: ".openclaw", value: ".openclaw", hint: TARGET_DIRS[".openclaw"] },
      { label: ".cursor", value: ".cursor", hint: TARGET_DIRS[".cursor"] },
      { label: ".windsurf", value: ".windsurf", hint: TARGET_DIRS[".windsurf"] },
      { label: ".aider", value: ".aider", hint: TARGET_DIRS[".aider"] },
      { label: ".continue", value: ".continue", hint: TARGET_DIRS[".continue"] },
    ],
    required: true,
    defaultValue: Object.keys(TARGET_DIRS),
  });

  if (isCancel(selectedDirs)) process.exit(0);

  // Step 2: 选择要同步的 skills
  const selectedSkills = await multiselect({
    message: "选择要同步的 skills:",
    options: allSkills.map((name) => ({ label: name, value: name })),
    required: true,
    defaultValue: allSkills,
  });

  if (isCancel(selectedSkills)) process.exit(0);

  // 更新 values 以便后续使用
  values.dirs = selectedDirs.join(",");
  values.skills = selectedSkills.join(",");

  console.log("\n");
}


// 主函数
async function main() {
  // 检查是否进入交互式模式
  if (shouldRunInteractively()) {
    await runInteractively();
  }

  // 解析 skills 列表
  const skillsToSync = values.skills
    ? values.skills.split(",").map((s) => s.trim())
    : null;

  // 解析目标目录列表
  const dirsToSync = values.dirs
    ? values.dirs.split(",").map((d) => d.trim())
    : Object.keys(TARGET_DIRS);

  // 验证目标目录
  for (const dir of dirsToSync) {
    if (!TARGET_DIRS[dir]) {
      console.error(`错误: 未知的目标目录 "${dir}"。可用选项: ${Object.keys(TARGET_DIRS).join(", ")}`);
      process.exit(1);
    }
  }

  const allSkills = getAllSkills();
  const skills = skillsToSync || allSkills;

  console.log("\n=== Skills 同步工具 ===\n");
  console.log(`源目录: ${SKILLS_DIR}`);
  console.log(`目标目录: ${dirsToSync.map((d) => `${d} -> ${TARGET_DIRS[d]}`).join(", ")}`);
  console.log(`待同步 skills: ${skills.join(", ")}`);
  console.log(`模式: ${values["dry-run"] ? "dry-run (预览)" : "实际同步"}`);
  console.log();

  // 验证指定的 skills 是否存在
  for (const skill of skills) {
    if (!allSkills.includes(skill)) {
      console.error(`错误: 未找到 skill "${skill}"。可用 skills: ${allSkills.join(", ")}`);
      process.exit(1);
    }
  }

  let totalSynced = 0;
  const errors = [];

  for (const dir of dirsToSync) {
    const targetDir = TARGET_DIRS[dir];
    console.log(`\n同步到 ${dir} (${targetDir}):`);

    // 确保目标目录存在
    if (!existsSync(targetDir)) {
      if (!values["dry-run"]) {
        mkdirSync(targetDir, { recursive: true });
        console.log(`  创建目录: ${targetDir}`);
      } else {
        console.log(`  [dry-run] 创建目录: ${targetDir}`);
      }
    }

    for (const skill of skills) {
      try {
        if (syncSkill(skill, targetDir, values["dry-run"])) {
          totalSynced++;
        }
      } catch (err) {
        errors.push({ skill, dir, error: err.message });
        console.error(`  错误: ${err.message}`);
      }
    }
  }

  console.log("\n=== 完成 ===");
  console.log(`成功同步: ${totalSynced}`);

  if (errors.length > 0) {
    console.log(`失败: ${errors.length}`);
    for (const e of errors) {
      console.error(`  - ${e.skill} -> ${e.dir}: ${e.error}`);
    }
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
