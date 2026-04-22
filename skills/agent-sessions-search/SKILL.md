---
name: x-agent-sessions
description: 获取 AI Agent 会话记录；仅在用户明确要求「Agent 会话」「Cursor 记录」「ClaudeCode 记录」「OpenCode 会话」或类似表述时调用
---

# x-agent-sessions

获取 Cursor、ClaudeCode、OpenCode 的会话记录。

## 使用方式

```bash
# 获取所有 Agent
bun run scripts/fetch.ts

# 指定 Agent（cursor/claude-code/opencode）
bun run scripts/fetch.ts --agent=cursor

# 输出更适合 Agent 读取的格式
bun run scripts/fetch.ts --format=agent

# 指定日期
bun run scripts/fetch.ts --date=2024-04-15 --format=agent
```