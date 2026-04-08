---
name: work-summary
description: 生成工作日报，汇总用户当天的工作内容。当用户要求"总结今天的工作"、"生成工作日报"、"整理今日工作"、"查看今日工作内容"或类似需求时使用此 Skill。通过调用飞书聊天记录、飞书文档、浏览器历史、Git 提交四个数据源，生成结构化日报并留档保存。
---

# 工作日报生成

## 功能说明

自动汇总用户当天的工作内容，从多个数据源采集信息，生成结构化的工作日报。

### 数据来源

| 数据源 | 说明 | 调用方式 |
|--------|------|----------|
| 飞书聊天记录 | 用户当天的飞书消息和会话 | MCP 工具 |
| 飞书文档 | 用户当天编辑或打开的文档 | MCP 工具 |
| 浏览器历史 | 用户当天访问的网页记录 | 命令行脚本 |
| Git 提交 | 用户当天的代码提交记录 | 命令行脚本 |

## 工作流程

```
1. 确定日期（默认今天）
2. 并行采集四类数据
3. 数据解析与汇总
4. 生成日报
5. 日志存档
```

## 数据采集详细步骤

### Step 1: 飞书聊天记录

使用 MCP 工具获取用户当天的飞书消息。

**调用方式**：
```typescript
// 1. 获取用户 open_id（通过 feishu_im_get_user_info 或从上下文获取）

// 2. 时间分片搜索（每2小时一个分片，避免API限制）
feishu_im_user_search_messages({
  sender_ids: ["用户open_id"],
  start_time: "2026-04-08T09:00:00+08:00",
  end_time: "2026-04-08T11:00:00+08:00",
  page_size: 50,
  sort_rule: "create_time_asc"
})

// 3. 获取完整会话内容
feishu_im_user_get_messages({
  chat_id: "oc_xxx",
  relative_time: "today",
  page_size: 50,
  sort_rule: "create_time_asc"
})
```

**时间范围**：当天 09:00 - 24:00，每2小时一个分片

**输出结构**：
```json
{
  "chat_count": 15,
  "message_count": 300,
  "chats": [
    {
      "chat_id": "oc_xxx",
      "chat_name": "张三",
      "message_count": 25,
      "messages": [
        { "time": "09:30", "content": "讨论项目进度..." }
      ]
    }
  ]
}
```

---

### Step 2: 飞书文档

使用 MCP 工具 `feishu_search_doc_wiki` 搜索文档。

**模式一：用户创建的文档（按编辑时间）**
```typescript
feishu_search_doc_wiki({
  action: "search",
  query: "",
  filter: {
    creator_ids: ["用户open_id"],
    sort_type: "EDIT_TIME"
  },
  time_range: {
    start: "2026-04-08T00:00:00+08:00",
    end: "2026-04-08T23:59:59+08:00"
  }
})
```

**模式二：用户打开的文档（按打开时间）**
```typescript
feishu_search_doc_wiki({
  action: "search",
  query: "",
  filter: {
    sort_type: "OPEN_TIME"
  },
  time_range: {
    start: "2026-04-08T00:00:00+08:00",
    end: "2026-04-08T23:59:59+08:00"
  }
})
```

**输出结构**：
```json
{
  "created_count": 5,
  "opened_count": 20,
  "created_docs": [
    { "doc_id": "xxx", "title": "项目方案", "type": "doc", "time": "14:30" }
  ],
  "opened_docs": [
    { "doc_id": "xxx", "title": "需求文档", "type": "sheet", "time": "10:15" }
  ]
}
```

---

### Step 3: 浏览器历史

执行命令行脚本获取浏览器访问记录。

```bash
bun run skills/browser-history-search/scripts/fetch.ts --date=2026-04-08
```

**输出格式**：
```
2026-04-08 11:23:48  tabbit  百度一下，你就知道  https://www.baidu.com/
2026-04-08 10:00:56  chrome  GitHub  https://github.com/
```

---

### Step 4: Git 提交

执行命令行脚本获取代码提交记录。

```bash
bun run skills/git-commits-search/scripts/fetch.ts --date=2026-04-08
```

**输出格式**：
```
📁 my-project
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
14:30:15  feat: 添加用户认证模块
         [3 files] +125 -23

14:20:03  fix: 修复登录问题
         [1 files] +5 -3
```

---

## 日报生成

### 输出格式模板

```markdown
# 📋 工作日报 - {日期}

## 📊 今日概览

| 指标 | 数值 |
|------|------|
| 飞书消息 | X 条 / X 个会话 |
| 文档操作 | X 篇（创建 X / 打开 X） |
| 浏览器访问 | X 次 |
| Git 提交 | X 次 |

## ⏰ 今日时间线

### 上午
- **09:30** - [飞书] 与 XX 讨论项目进度
- **10:15** - [文档] 编辑《XXX 文档》
- **11:00** - [Git] 提交 feat: 完成 XXX 功能

### 下午
- **14:00** - [浏览器] 查看 XXX 技术文档
- **15:30** - [飞书] 参加 XXX 会议
- **16:45** - [Git] 提交 fix: 修复 XXX 问题

## 📝 今日重点事项

### 已完成
1. 完成 XXX 功能开发
2. 修复 XXX 问题
3. 参加 XXX 会议

### 待跟进
1. XXX 事项（预计明天完成）
2. XXX 事项（等待 XX 反馈）

## 🔧 技术产出

### Git 提交
| 时间 | 仓库 | 内容 |
|------|------|------|
| 10:15 | my-project | feat: 添加 XXX 功能 |
| 16:45 | my-project | fix: 修复 XXX 问题 |

## 🌐 知识获取

### 浏览器访问记录
| 时间 | 标题 | URL |
|------|------|-----|
| 14:00 | XXX 技术文档 | https://... |
| 15:30 | XXX 博客 | https://... |

## 💬 沟通记录

### 主要会话
| 会话 | 消息数 | 主要内容 |
|------|--------|----------|
| 张三 | 25 条 | 项目进度讨论 |
| 李四 | 12 条 | 技术方案评审 |

## 📋 后续建议

1. **XXX**：建议明天优先处理
2. **XXX**：需要与 XX 进一步沟通
3. **XXX**：可安排在下周进行

---
*日报生成时间：{timestamp}*
```

---

## 日志存档

### 存档路径

`~/.openclaw/cache/work-summary/{YYYY-MM-DD}/`

### 存档结构

```
~/.openclaw/cache/work-summary/2026-04-08/
├── data.json              # 完整数据（JSON格式）
└── report.md              # 生成的日报
```

### data.json 格式

```json
{
  "date": "2026-04-08",
  "generated_at": "2026-04-08T21:00:00+08:00",
  "sources": {
    "feishu_messages": {
      "chat_count": 15,
      "message_count": 300,
      "data": [...]
    },
    "feishu_docs": {
      "created_count": 5,
      "opened_count": 12,
      "created_docs": [...],
      "opened_docs": [...]
    },
    "browser_history": {
      "visit_count": 45,
      "data": [...]
    },
    "git_commits": {
      "commit_count": 8,
      "by_repo": {
        "my-project": 5,
        "another-repo": 3
      },
      "data": [...]
    }
  },
  "summary": {
    "timeline": [...],
    "key_accomplishments": [...],
    "follow_ups": [...]
  }
}
```

---

## 注意事项

1. **数据隐私**：所有数据仅在本地处理，不会上传到任何外部服务
2. **时间范围**：默认采集当天数据（00:00:00 - 23:59:59）
3. **并行采集**：四个数据源可并行调用，提高采集效率
4. **缓存策略**：原始数据自动缓存到 `~/.openclaw/cache/work-summary/`
5. **敏感信息**：生成的日报中应脱敏处理敏感内容
6. **MCP 工具**：飞书相关操作需要 MCP 服务器支持

---

## 相关信息

- 飞书消息技能：`feishu-message-deepsearch`
- 飞书文档技能：`feishu-docs-deepsearch`
- 浏览器历史技能：`browser-history-search`
- Git 提交技能：`git-commits-search`
