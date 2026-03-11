---
name: feishu-messages
description: 获取飞书群聊或话题的历史消息记录。通过飞书 Open API 获取指定会话的聊天历史，支持时间筛选、排序和分页。触发场景：(1) 获取飞书群聊消息，(2) 导出飞书聊天记录，(3) 分析飞书群聊内容，(4) 按时间范围筛选消息
---

# Feishu Messages

获取飞书群聊或话题的历史消息记录。

## 快速开始

### 前置要求

1. 安装 Node.js（脚本使用内置库，无需额外安装依赖）

### 参数说明

所有参数通过命令行传递：

| 参数 | 缩写 | 必填 | 说明 |
|------|------|------|------|
| --appid | - | 是 | 飞书应用 ID |
| --secret | - | 是 | 飞书应用密钥 |
| --chatid | - | 是 | 群聊 ID 或话题 ID |
| --container-type | - | 否 | 容器类型：`chat`(群聊/单聊) 或 `thread`(话题)，默认 `chat` |
| --start-time | - | 否 | 起始时间（YYYY-MM-DD hh:mm:ss 格式） |
| --end-time | - | 否 | 结束时间（YYYY-MM-DD hh:mm:ss 格式） |
| --sort | - | 否 | 排序方式：`ByCreateTimeAsc`(升序) 或 `ByCreateTimeDesc`(降序)，默认 `ByCreateTimeDesc` |
| --page-size | - | 否 | 分页大小，取值范围 1-50，默认 50 |
| --help | - | 否 | 显示帮助信息 |

### 使用方法

```bash
cd /path/to/feishu-messages
node ./scripts/get_feishu_messages.js \
  --appid <app_id> \
  --secret <app_secret> \
  --chatid <chat_id>
```

### 使用示例

```bash
# 基本用法
node ./scripts/get_feishu_messages.js --appid xxx --secret xxx --chatid xxx

# 筛选特定时间范围
node ./scripts/get_feishu_messages.js --appid xxx --secret xxx --chatid xxx \
  --start-time "2024-01-01 00:00:00" \
  --end-time "2024-12-31 23:59:59"

# 升序排列，最旧的消息在前
node ./scripts/get_feishu_messages.js --appid xxx --secret xxx --chatid xxx \
  --sort ByCreateTimeAsc

# 限制返回数量
node ./scripts/get_feishu_messages.js --appid xxx --secret xxx --chatid xxx \
  --page-size 20

# 获取话题消息
node ./scripts/get_feishu_messages.js --appid xxx --secret xxx --chatid <thread_id> \
  --container-type thread
```

## 获取参数的方法

### app_id 和 app_secret

1. 打开 [飞书开放平台](https://open.feishu.cn/)
2. 创建或使用已有应用
3. 在应用详情页获取 App ID 和 App Secret

### chat_id（群 ID / 话题 ID）

获取方式：
- 群聊：创建群后从返回结果中获取，或调用获取用户或机器人所在的群列表 API
- 话题：获取话题的 thread_id

### 时间筛选

- `start_time`: 查询起始时间，YYYY-MM-DD hh:mm:ss 格式
- `end_time`: 查询结束时间，YYYY-MM-DD hh:mm:ss 格式
- 注意：thread 容器类型暂不支持时间筛选

### 排序方式

- `ByCreateTimeAsc`: 按消息创建时间升序排列（最旧的消息在前）
- `ByCreateTimeDesc`: 按消息创建时间降序排列（最新的消息在前，默认）

## 输出说明

脚本会输出：
1. 消息获取结果（消息数量）
2. 每条消息的摘要（消息ID、发送者、类型、创建时间、内容）
3. 完整的 JSON 格式数据（方便程序解析）

## 注意事项

- 机器人需要先加入目标群聊才能获取消息
- 消息获取受飞书 API 频率限制影响
- 使用时间筛选可以减少返回的消息数量，提高性能
- 默认按降序排列，最新消息在前
- 时间为 YYYY-MM-DD hh:mm:ss 格式
