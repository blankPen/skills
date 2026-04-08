---
name: feishu-message-deepsearch
description: 获取飞书用户当天的完整聊天记录并进行汇总分析。当用户要求"查看今天的聊天记录"、"分析我今天做了什么"、"整理今天的沟通内容"或类似需求时使用此 Skill。支持时间分片搜索、会话去重、完整上下文获取、本地缓存和智能分析。
---

# 飞书聊天记录获取与分析

## 权限要求

此 Skill 需要以下飞书 API 权限：

| 权限 | 说明 | 用途 |
|------|------|------|
| `im:message` | 获取用户消息 | 搜索用户发送的消息 |
| `im:message:readonly` | 读取消息内容 | 获取会话完整聊天记录 |

**注意**：这些权限需要用户 OAuth 授权，确保用户已完成授权流程。

## 工作流程

```
1. 时间分片搜索 → 2. 会话汇总去重 → 3. 获取完整内容 → 4. 本地缓存 → 5. 汇总分析
```

### Step 1: 时间分片搜索

按小时分片搜索用户发送的消息，避免飞书搜索 API 的限制：

```
feishu_im_user_search_messages
  sender_ids: ["用户的open_id"]
  start_time: "2024-01-01T09:00:00+08:00"
  end_time: "2024-01-01T10:00:00+08:00"
  page_size: 50
  sort_rule: create_time_asc
```

**时间范围**：从早上 9:00 到晚上 24:00，每小时一个分片。

### Step 2: 会话汇总去重

从搜索结果中提取所有 `chat_id`，去重后得到会话列表：

```python
chat_ids = set()
for message in all_messages:
    chat_ids.add(message['chat_id'])
```

### Step 3: 获取完整会话内容

对每个会话获取当天的完整聊天记录：

```
feishu_im_user_get_messages
  chat_id: "oc_xxx"
  relative_time: "today"
  page_size: 50
  sort_rule: create_time_asc
```

### Step 4: 本地缓存

将原始数据按日期缓存到本地：

**缓存路径**：`~/.openclaw/cache/feishu-chat/{YYYY-MM-DD}.json`

**缓存格式**：
```json
{
  "date": "2024-01-01",
  "user_open_id": "ou_xxx",
  "fetched_at": "2024-01-01T21:00:00+08:00",
  "statistics": {
    "total_chats": 15,
    "total_messages": 300,
    "user_messages": 120,
    "time_range": {
      "start": "09:30",
      "end": "20:45"
    }
  },
  "chats": [
    {
      "chat_id": "oc_xxx",
      "chat_type": "p2p",
      "chat_name": "张三",
      "messages": [...]
    }
  ]
}
```

### Step 5: 汇总分析

生成当日聊天内容分析报告，包含：

1. **统计数据**：会话数、消息数、时间跨度
2. **会话分类**：工作相关、技术学习、日常沟通等
3. **时间线摘要**：按时间顺序列出主要沟通内容
4. **重点事项**：识别关键决策、待办事项等

## 输出格式

### 分析报告模板

```markdown
# 📋 {日期} 聊天记录分析

## 📊 统计数据

| 指标 | 数值 |
|------|------|
| 总会话数 | X 个 |
| 总消息数 | X 条 |
| 你发送的消息 | X 条 |
| 时间跨度 | HH:MM - HH:MM |

## 📋 会话分类

### 工作相关（X 个）
...

### 技术学习（X 个）
...

### 其他（X 个）
...

## ⏰ 时间线

```
HH:MM-HH:MM  事项描述
HH:MM-HH:MM  事项描述
...
```

## 🎯 今日重点

1. ...
2. ...
```

## 工具调用示例

### 完整流程示例

```python
# 1. 时间分片搜索
for hour in range(9, 24):
    search_messages(
        sender_ids=[user_open_id],
        start_time=f"{date}T{hour:02d}:00:00+08:00",
        end_time=f"{date}T{hour+1:02d}:00:00+08:00"
    )

# 2. 汇总去重
chat_ids = deduplicate_chats(all_search_results)

# 3. 获取完整内容
for chat_id in chat_ids:
    get_messages(chat_id=chat_id, relative_time="today")

# 4. 本地缓存
save_to_cache(data, f"~/.openclaw/cache/feishu-chat/{date}.json")

# 5. 汇总分析
generate_report(all_chat_data)
```

## 注意事项

1. **API 限制**：飞书搜索 API 有查询上限，分片查询可绕过限制
2. **隐私保护**：缓存数据仅存储在本地，不会外传
3. **增量更新**：如缓存已存在，可增量追加新消息
4. **敏感信息**：分析报告中应脱敏处理敏感内容

## Resources

### scripts/

- `cache_manager.py` - 缓存管理：读取、写入、增量更新
- `analyzer.py` - 消息分析：分类、摘要、时间线生成

### references/

- `api-reference.md` - 飞书 IM API 详细说明
