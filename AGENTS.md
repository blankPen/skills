# AGENTS.md

**Generated:** 2026-02-25
**Commit:** 7464056
**Branch:** main

## OVERVIEW

个人的 Agent Skills 仓库，用于存放和管理 AI Agent 技能定义。当前包含 2 个 Cursor 会话分析技能。

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个个人的 Agent Skills 仓库，用于存放和管理 AI Agent 技能定义。

## 相关规范

Agent Skills 规范文档: [https://agentskills.io/specification](https://agentskills.io/specification)

## 测试规范

如果有修改 `open-insights` 的扫描功能时，都需要重新调研脚本进行验证，并且查看 `.agent-insights/conversations` 生成的内容是否符合预期

## 语言规范

- 所有对话和文档均使用简体中文
- 代码注释、提交信息、文档统一用中文表述

## Skills 脚本开发规范

Skills 内附带的可执行脚本需遵循以下约定，以便用户**下载即用**，无需安装依赖。

### 语言与运行时

- **使用 TypeScript 编写**（`.ts` 文件）
- **使用 Bun 直接执行**：用户通过 `bun scripts/xxx.ts` 或 `bun run scripts/xxx.ts` 即可运行，无需先执行 `npm install` 或 `bun install`

### 零依赖要求

- 脚本**不得依赖**本仓库外的 npm 包（即不使用 `node_modules`）
- 仅使用 **Node/Bun 内置 API**（如 `fs`、`path`、`os`、`child_process`、`url` 等）或 Bun 自带的兼容能力实现功能
- 若功能必须依赖第三方库，应在 SKILL 文档中说明，并视为「需额外环境」的例外情况

### 文件约定

- 脚本文件建议放在对应 skill 的 `scripts/` 目录下
- 文件首行添加 **shebang**：`#!/usr/bin/env bun`，便于在类 Unix 环境下直接执行（`./scripts/xxx.ts`）
- 在脚本顶部或 SKILL 文档中注明运行方式，例如：`bun scripts/scan.ts`

### 用户体验目标

- 用户克隆或下载包含该 skill 的仓库后，**仅需安装 Bun**，即可运行脚本，无需再执行任何依赖安装步骤。
### 用户体验目标


## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 查找技能定义 | `skills/*/SKILL.md` | 主要技能文档 |
| 运行技能脚本 | `skills/*/scripts/*.ts` | 使用 `bun` 直接执行 |
| 理解规范 | `AGENTS.md` | 项目级开发规范 |
| 安装技能 | 根目录 `README.md` | 安装说明 |

- 用户克隆或下载包含该 skill 的仓库后，**仅需安装 Bun**，即可运行脚本，无需再执行任何依赖安装步骤。

---

## STRUCTURE

```
skills/
├── cursor-insights/    # Cursor Agent 会话洞察分析
│   ├── SKILL.md
│   ├── scripts/
│   │   └── scan.ts
│   └── temp/
│       └── report_temp.html
└── open-insights/       # 与 cursor-insights 功能高度相似
    ├── SKILL.md
    ├── scripts/
    │   └── cursor-scan.ts
    └── temp/
        └── report_temp.html

spec/
└── agent-skills-spec.md  # Agent Skills 规范引用
```
