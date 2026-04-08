# 飞书 IM API 参考

## 相关工具

### feishu_im_user_search_messages

**用途**：跨会话搜索飞书消息

**参数说明**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 否 | 搜索关键词，匹配消息内容 |
| sender_ids | array | 否 | 发送者 open_id 列表 |
| start_time | string | 否 | 起始时间（ISO 8601 格式） |
| end_time | string | 否 | 结束时间（ISO 8601 格式） |
| relative_time | string | 否 | 相对时间：today/yesterday/this_week 等 |
| chat_id | string | 否 | 限定搜索范围的会话 ID |
| page_size | number | 否 | 每页消息数（1-50），默认 50 |
| page_token | string | 否 | 分页标记 |
| sort_rule | string | 否 | 排序方式：create_time_asc/create_time_desc |

**限制**：
- 单次查询有结果数量上限
- 建议使用时间分片绕过限制

**返回字段**：

```json
{
  "messages": [
    {
      "message_id": "om_xxx",
      "msg_type": "text",
      "content": "消息内容",
      "sender": {
        "id": "ou_xxx",
        "name": "发送者姓名"
      },
      "create_time": "2024-01-01T10:00:00+08:00",
      "chat_id": "oc_xxx",
      "chat_type": "p2p/group",
      "chat_name": "会话名称",
      "chat_partner": {
        "open_id": "ou_xxx",
        "name": "对方姓名"
      }
    }
  ],
  "has_more": false
}
```

---

### feishu_im_user_get_messages

**用途**：获取群聊或单聊的历史消息

**参数说明**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| chat_id | string | 是* | 会话 ID（与 open_id 二选一） |
| open_id | string | 是* | 用户 open_id，获取与该用户的单聊消息 |
| relative_time | string | 否 | 相对时间范围 |
| start_time | string | 否 | 起始时间（ISO 8601 格式） |
| end_time | string | 否 | 结束时间（ISO 8601 格式） |
| page_size | number | 否 | 每页消息数（1-50），默认 50 |
| page_token | string | 否 | 分页标记 |
| sort_rule | string | 否 | 排序方式 |

**返回字段**：

```json
{
  "messages": [
    {
      "message_id": "om_xxx",
      "msg_type": "text/post/image/file/...",
      "content": "消息内容",
      "sender": {
        "id": "ou_xxx",
        "sender_type": "user/bot",
        "name": "发送者姓名"
      },
      "create_time": "2024-01-01T10:00:00+08:00"
    }
  ],
  "has_more": false,
  "page_token": ""
}
```

---

## 时间格式

所有时间参数使用 **ISO 8601 / RFC 3339** 格式，包含时区：

```
2024-01-01T09:00:00+08:00
```

---

## 消息类型

| msg_type | 说明 |
|----------|------|
| text | 纯文本 |
| post | 富文本 |
| image | 图片 |
| file | 文件 |
| audio | 音频 |
| media | 视频 |
| interactive | 交互式卡片 |

---

## 最佳实践

### 1. 时间分片查询

避免单次查询结果过多，建议按小时分片：

```python
for hour in range(9, 24):
    start = f"{date}T{hour:02d}:00:00+08:00"
    end = f"{date}T{hour+1:02d}:00:00+08:00"
    # 调用 search_messages
```

### 2. 会话去重

从搜索结果中提取唯一会话：

```python
chat_ids = set()
for msg in search_results:
    chat_ids.add(msg['chat_id'])
```

### 3. 完整上下文

对于重要会话，使用 `get_messages` 获取完整聊天记录，包括对方的回复。

### 4. 分页处理

当 `has_more` 为 true 时，使用 `page_token` 获取更多结果。
