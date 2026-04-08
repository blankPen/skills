---
name: git-commits-search
description: 获取指定时间的 Git 提交记录；仅在用户明确要求「Git 提交」「代码提交」「commit 记录」或类似表述时调用
---

# git-commits-search

获取 Git 仓库的提交记录。

## 使用方式

```bash
# 默认扫描 $WORKSPACE 目录下的所有 Git 仓库
bun run scripts/fetch.ts

# 指定仓库（覆盖默认扫描）
bun run scripts/fetch.ts --workspaces=/path/to/repo1,/path/to/repo2

# 指定日期
bun run scripts/fetch.ts --date=2024-01-15
```

## 自动扫描

默认情况下，脚本会自动扫描 `WORKSPACE` 环境变量指定的目录（默认为 `~/`），递归查找该目录下的所有 Git 仓库，并获取每个仓库在指定日期的提交记录。

会跳过以下目录：
- 隐藏目录（以 `.` 开头）
- `node_modules`、`vendor`、`dist`、`build`
- 已识别的 Git 仓库内部不再继续深入扫描

## 输出

输出到 `~/.git-commits-search/{date}/commits.json`

