---
name: feishu-room-search
description: 飞书会议室查询工具。用于搜索会议室、查询特定时间段的可用会议室。**当用户问"有哪些空闲会议室"、"几点有什么会议室可用"、"某地有什么会议室"时使用此 Skill**。
---

# 飞书会议室查询

## 使用场景

| 场景 | 示例 |
|------|------|
| 查询特定时间可用会议室 | "4点有哪些可用的会议室" |
| 查询特定地点会议室 | "上海职场有哪些会议室" |
| 查询特定地点+时间可用会议室 | "上海职场4点有哪些可用的会议室" |
| 按容量筛选 | "能容纳20人的会议室" |

---

## 前置条件

### 1. 飞书应用凭证

存储在 MEMORY.md 中：

```markdown
## 飞书应用凭证
- **App ID:** `cli_xxx`
- **App Secret:** `xxx`
```

### 2. 必需权限

| 权限 | 说明 |
|------|------|
| `vc:room:readonly` | 获取会议室列表 |
| `calendar:room:readonly` | 查询会议室忙闲状态 |

---

## 核心功能

### 1. 获取会议室列表

**接口**: `GET https://open.feishu.cn/open-apis/vc/v1/rooms`

**调用示例**:
```bash
curl -X GET "https://open.feishu.cn/open-apis/vc/v1/rooms?page_size=100" \
  -H "Authorization: Bearer $TOKEN"
```

**返回字段**:
```json
{
  "rooms": [{
    "room_id": "omm_xxx",
    "name": "Pioneer(视频会议)",
    "capacity": 10,
    "path": ["omb_root", "omb_china", "omb_shanghai"],
    "room_status": { "status": true },
    "device": [{ "name": "TV" }]
  }]
}
```

---

### 2. 查询会议室忙闲状态

**接口**: `GET https://open.feishu.cn/open-apis/meeting_room/freebusy/batch_get`

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| room_ids | array\<string\> | 是 | 会议室ID数组，最多20个 |
| time_min | string | 是 | 起始时间（RFC3339，需URL编码）|
| time_max | string | 是 | 结束时间（RFC3339，需URL编码）|

**调用示例**:
```bash
# 获取 token
TOKEN=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
  -H "Content-Type: application/json" \
  -d '{"app_id":"cli_xxx","app_secret":"xxx"}' | jq -r '.tenant_access_token')

# 查询忙闲
curl -X GET "https://open.feishu.cn/open-apis/meeting_room/freebusy/batch_get?room_ids=omm_xxx&time_min=2026-04-03T16%3A00%3A00%2B08%3A00&time_max=2026-04-03T17%3A00%3A00%2B08%3A00" \
  -H "Authorization: Bearer $TOKEN"
```

**返回示例**:
```json
{
  "code": 0,
  "data": {
    "free_busy": {
      "omm_xxx": [],           // ✅ 空数组 = 空闲
      "omm_yyy": [{ ... }]     // ❌ 有数据 = 已被预订
    }
  }
}
```

---

## 查询流程

### 场景 1：查询特定时间可用会议室

**用户**: "4点有哪些可用的会议室"

**流程**:
```
1. 从 MEMORY.md 获取用户职场会议室列表（如长沙42F）
2. 确定时间：今天 16:00-17:00
3. 调用 freebusy 接口查询所有会议室忙闲
4. 筛选空闲会议室
5. 输出结果
```

**输出示例**:
```
📅 今天 16:00-17:00 可用会议室：

✅ Pioneer(视频会议) - 10人
✅ 效率(视频会议) - 9人
✅ 星火燎原(视频会议) - 14人

❌ 已被预订：
- 成长(视频会议) - 被卓洛预订
```

---

### 场景 2：查询特定地点可用会议室

**用户**: "上海职场4点有哪些可用的会议室"

**流程**:
```
1. 从 MEMORY.md 获取上海职场会议室列表
   - 如果没有缓存，先调用 vc/v1/rooms 获取
   - 通过 path 筛选上海职场的会议室
2. 确定时间：今天 16:00-17:00
3. 调用 freebusy 接口查询忙闲
4. 输出结果
```

**输出示例**:
```
📅 上海职场 今天 16:00-17:00 可用会议室：

✅ A101(视频会议) - 8人
✅ B202(视频会议) - 12人

❌ 已被预订：
- C303(视频会议) - 被张三预订
```

---

### 场景 3：只查会议室列表（不查忙闲）

**用户**: "上海职场有哪些会议室"

**流程**:
```
1. 获取会议室列表
2. 按地点筛选
3. 输出会议室列表（不判断忙闲）
```

**输出示例**:
```
🏢 上海职场会议室列表：

| 名称 | 容量 | 设备 |
|------|------|------|
| A101(视频会议) | 8人 | TV, 视频设备 |
| B202(视频会议) | 12人 | TV, 视频设备 |
| C303(视频会议) | 6人 | TV |
```

---

## 判断逻辑

### 忙闲判断

```javascript
// 空数组或undefined表示空闲
function isRoomFree(freeBusyData, roomId) {
    const events = freeBusyData.free_busy[roomId];
    return !events || events.length === 0;
}
```

### 启用状态判断

```javascript
// 只检查 status 字段
function isRoomEnabled(room) {
    return room.room_status?.status === true;
}
```

---

## 缓存优化

建议将会议室列表缓存到 MEMORY.md：

```markdown
## 长沙会议室（42F）

| 名称 | 容量 | Room ID |
|------|------|---------|
| Pioneer(视频会议) | 10人 | `omm_xxx` |
| 星火燎原(视频会议) | 14人 | `omm_yyy` |

**长沙层级 ID**: `omb_xxx`
```

---

## 注意事项

1. **批量查询限制**: `room_ids` 最多20个，超过需分批查询

2. **时间格式**: RFC3339，URL编码
   - `2026-04-03T16:00:00+08:00` → `2026-04-03T16%3A00%3A00%2B08%3A00`

3. **会议室状态 vs 忙闲状态**：
   - `room_status.status` = 会议室是否启用
   - `freebusy` = 特定时间是否被预订

4. **层级路径**: 会议室的 `path` 字段包含完整层级ID，用于地点筛选
