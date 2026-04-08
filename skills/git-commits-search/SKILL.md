---
name: git-commits-search
description: 获取指定时间的 Git 提交记录；仅在用户明确要求「Git 提交」「代码提交」「commit 记录」或类似表述时调用
---

# git-commits-search

获取 Git 仓库的提交记录。

## 使用方式

```bash
# 获取今天的提交记录
bun run skills/git-commits-search/scripts/fetch.ts

# 获取最近 7 天的提交记录
bun run skills/git-commits-search/scripts/fetch.ts --days=7

# 指定日期
bun run skills/git-commits-search/scripts/fetch.ts --date=2024-01-15

# 指定仓库路径
bun run skills/git-commits-search/scripts/fetch.ts --workspaces=/path/to/repo1,/path/to/repo2
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--days` | 最近 N 天的提交记录 | 1 |
| `--date` | 指定日期（YYYY-MM-DD） | 今天 |
| `--workspaces` | 指定仓库路径，多个用逗号分隔 | 扫描 HOME 目录 |

## 自动扫描

默认扫描 `HOME` 环境变量指定的目录（默认为 `~/`），递归查找该目录下的所有 Git 仓库。

会跳过以下目录：
- 隐藏目录（以 `.` 开头）
- `node_modules`、`vendor`、`dist`、`build`
- 已识别的 Git 仓库内部不再继续深入扫描

## 输出格式

```
🔍 搜索 Git 提交记录...
   时间范围: 最近 7 天
   扫描仓库: 3 个

📁 my-project
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
14:30:15  feat: 添加新功能
         [3 files] +125 -23

14:20:03  fix: 修复登录问题
         [1 files] +5 -3

📁 another-repo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10:15:42  chore: 更新依赖
         [2 files] +50 -10

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 总计: 3 条提交
   my-project: 2 条
   another-repo: 1 条
```

## 输出字段说明

| 字段 | 说明 |
|------|------|
| 时间 | 提交时间（HH:MM:SS） |
| repo | 仓库名称 |
| message | 提交信息 |
| files | 变更文件数及加减行数 |
