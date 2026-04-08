# Work-Summary 技能创建计划

## TL;DR

> **目标**：创建 `work-summary` 技能，自动汇总一天的工作内容并生成工作日报
> 
> **核心流程**：调用 4 个数据源技能 → 整合分析 → 生成日报 → 日志存档
> 
> **交付物**：`skills/work-summary/SKILL.md` + `scripts/summary-generator.ts`
> 
> **预计工作量**：Short（1-2 小时）
> **并行执行**：部分可并行

---

## Context

### 用户需求
用户希望创建一个 `work-summary` 技能，用于：
1. 自动获取当天的飞书聊天、飞书文档、浏览器历史、Git 提交
2. 整合数据生成包含时间线的工作日报
3. 自动存档原始数据供后续 AI 分析

### 相关技能
- `feishu-message-deepsearch` - 飞书聊天记录
- `feishu-docs-deepsearch` - 飞书文档搜索
- `browser-history-search` - 浏览器历史
- `git-commits-search` - Git 提交记录

---

## Work Objectives

### Must Have
- [x] `skills/work-summary/` 目录结构
- [x] `SKILL.md` - 技能定义文件
- [x] `scripts/summary-generator.ts` - 日报生成脚本
- [x] `references/report-template.md` - 日报模板参考

### Must NOT Have
- 不包含数据存储实现（只调用已有技能）
- 不修改被调用的技能

---

## 实施步骤

### 阶段 1：目录结构创建

- [x] 1. 创建技能根目录
  - 创建：`skills/work-summary/`
  
- [x] 2. 创建子目录
  - 创建：`skills/work-summary/scripts/`
  - 创建：`skills/work-summary/references/`

---

### 阶段 2：SKILL.md 创建

- [x] 3. 编写技能定义文件

  **文件路径**：`skills/work-summary/SKILL.md`

  **核心内容**：
  ```yaml
  ---
  name: work-summary
  description: 汇总一天的工作内容，生成工作日报。当用户要求"总结今天的工作"、"生成工作日报"、"整理今日工作"或类似需求时使用此 Skill。
  ---
  ```

  **主要章节**：
  1. 功能说明（数据来源、输出内容）
  2. 工作流程（数据采集 → 整合 → 生成 → 存档）
  3. 数据采集命令（各技能的调用方式）
  4. 日报输出格式（Markdown 模板）
  5. 日志存档格式（JSON 结构）
  6. 注意事项

---

### 阶段 3：日报生成脚本

- [x] 4. 创建 `scripts/summary-generator.ts`

  **文件路径**：`skills/work-summary/scripts/summary-generator.ts`

  **核心功能**：
  1. 解析日期参数（默认今天）
  2. 并行调用 4 个数据源技能获取数据
  3. 按时间线整合所有事件
  4. 生成结构化日报（Markdown）
  5. 存档原始数据（JSON）

  **命令行接口**：
  ```bash
  bun run skills/work-summary/scripts/summary-generator.ts
  bun run skills/work-summary/scripts/summary-generator.ts --date=2026-04-08
  bun run skills/work-summary/scripts/summary-generator.ts --output=./today-report.md
  ```

---

### 阶段 4：日报模板参考

- [x] 5. 创建 `references/report-template.md`

  **文件路径**：`skills/work-summary/references/report-template.md`

  **内容**：完整的日报模板，包含：
  - 数据概览表格
  - 时间线视图（上午/下午）
  - 工作内容分类总结
  - 已完成/待办事项
  - 日志存档目录结构

---

## 验证步骤

- [x] 6. 技能文件结构验证
  ```bash
  ls -la skills/work-summary/
  ls -la skills/work-summary/scripts/
  ls -la skills/work-summary/references/
  ```

- [x] 7. 脚本语法检查
  ```bash
  bun run skills/work-summary/scripts/summary-generator.ts --help
  ```

---

## 技术方案

### 脚本架构

```typescript
// summary-generator.ts 结构
interface WorkSummaryOptions {
  date?: string;      // YYYY-MM-DD，默认今天
  output?: string;    // 输出路径，默认输出到终端
  cacheDir?: string;  // 默认 ~/.openclaw/cache/work-summary/{date}/
}

// 主流程
async function generateWorkSummary(options: WorkSummaryOptions) {
  const date = options.date || getTodayDate();
  
  // 1. 并行获取数据
  const [messages, docs, browserHistory, commits] = await Promise.all([
    fetchFeishuMessages(date),
    fetchFeishuDocs(date),
    fetchBrowserHistory(date),
    fetchGitCommits(date)
  ]);
  
  // 2. 整合数据
  const timeline = buildTimeline(messages, docs, browserHistory, commits);
  
  // 3. 生成日报
  const report = generateReport(timeline, { messages, docs, browserHistory, commits });
  
  // 4. 存档原始数据
  await archiveData(date, { messages, docs, browserHistory, commits });
  
  return report;
}
```

### 数据调用方式

各技能通过以下方式调用：
1. **feishu-message-deepsearch**: 使用 MCP 工具 `feishu_im_user_search_messages` 和 `feishu_im_user_get_messages`
2. **feishu-docs-deepsearch**: 使用 MCP 工具 `feishu_search_doc_wiki`
3. **browser-history-search**: 执行 `bun run skills/browser-history-search/scripts/fetch.ts --date={date}`
4. **git-commits-search**: 执行 `bun run skills/git-commits-search/scripts/fetch.ts --date={date}`

---

## 日报输出格式

```markdown
# 📋 2026-04-08 工作日报

## 📊 数据概览
| 数据源 | 数量 |
|--------|------|
| 飞书消息 | X 条 |
| 飞书文档 | X 个 |
| 浏览器记录 | X 条 |
| Git 提交 | X 条 |

## ⏰ 时间线
### 上午
- **09:30** [沟通] 与张三讨论项目进度
### 下午
- **14:00** [代码] 实现用户认证模块
- **15:30** [文档] 更新 API 文档

## 💼 工作内容总结
### 沟通协作
- ...
### 文档处理
- ...
### 代码开发
- ...

## ✅ 已完成事项
- [ ] 用户认证模块开发

## 📋 待办事项
- [ ] 完成单元测试

## 📁 日志存档
原始数据已存档至 `~/.openclaw/cache/work-summary/2026-04-08/`
```

---

## 日志存档结构

```
~/.openclaw/cache/work-summary/2026-04-08/
├── report.md              # 生成的日报
├── feishu-messages.json   # 飞书聊天记录
├── feishu-docs.json       # 飞书文档
├── browser-history.json   # 浏览器历史
└── git-commits.json      # Git 提交
```

---

## Success Criteria

1. 技能目录结构符合 `skills/<skill-name>/` 规范
2. SKILL.md 包含完整的 YAML frontmatter 和描述
3. 脚本可通过 `bun run` 执行
4. 日报输出格式与模板一致
5. 原始数据正确存档为 JSON 格式
