# SKILLS 目录知识库

**Generated:** 2026-02-25
**Commit:** 7464056
**Branch:** main

## OVERVIEW

存放和管理 AI Agent 技能定义。每个技能都是自包含的，遵循零依赖原则，使用 Bun 运行时。

## STRUCTURE

```
skills/
├── cursor-insights/    # Cursor Agent Agent 会话洞察分析
│   ├── SKILL.md
│   ├── scripts/
│   │   └── scan.ts
│   └── temp/
│       └── report_temp.html
└── open-insights/       # 与 cursor-insights 功能高度相似（可能为重复或实验性实现）
    ├── SKILL.md
    ├── scripts/
    │   └── cursor-scan.ts
    └── temp/
        └── report_temp.html
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| 技能定义 | `skill-name/SKILL.md` | 主要技能文档，包含名称、描述、处理流程 |
| 技能脚本 | `skill-name/scripts/*.ts` | TypeScript 可执行脚本，使用 Bun 运行 |
| 报告模板 | `skill-name/temp/*.html` | HTML 报告模板 |

## CONVENTIONS

### 技能组织
- **目录命名**：使用 kebab-case (如 `cursor-insights`)
- **核心文件**：每个技能必须有 `SKILL.md` 定义文件
- **脚本目录**：`scripts/` 目录存放可执行 TypeScript 脚本
- **零依赖**：脚本仅使用 Node/Bun 内置 API，不依赖外部 npm 包
- **Shebang**：脚本首行必须有 `#!/usr/bin/env bun`

### 脚本开发
- **语言**：TypeScript (`.ts` 文件)
- **运行时**：使用 Bun 直接执行
- **API 限制**：仅使用 `fs`、`path`、`os`、`child_process`、`url` 等 Node/Bun 内置 API
- **例外说明**：若必须依赖第三方库，需在 SKILL.md 中注明为「需额外环境」

### 文档规范
- **语言**：所有文档使用简体中文
- **触发条件**：在 SKILL.md 描述中明确说明何时调用（如"仅在用户明确要求『生成会话分析报告』时调用"）

## ANTI-PATTERNS (THIS PROJECT)

1. **禁止依赖外部 npm 包**：脚本不得使用外部依赖（零依赖原则）
2. **禁止使用 `node_modules`**：所有功能必须通过内置 API 实现
3. **禁止跳过 shebang**：脚本首行必须包含 `#!/usr/bin/env bun`
4. **禁止使用非中文文档**：所有 SKILL.md 内容必须使用简体中文

## NOTES

- **技能重复**：`cursor-insights` 和 `open-insights` 功能高度相似，可能需要合并或删除其中一个
- **脚本命名不一致**：两个相似技能的脚本文件名不同 (`scan.ts` vs `cursor-scan.ts`)
- **无测试文件**：项目没有传统的测试文件结构，测试能力集成在技能功能中
- **无 CI/CD**：项目采用零依赖设计，没有 GitHub Actions 或其他 CI 配置
