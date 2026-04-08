---
name: feishu-docs-deepsearch
description: 深度搜索飞书文档，支持两种模式：(1) 查找指定时间范围内用户创建的文档，按编辑时间排序；(2) 查找指定时间范围内用户打开过的所有文档，按打开时间排序。自动处理分页，持续加载直到超出时间范围。当用户要求"查看我最近编辑的文档"、"查找某时间段内打开过的文档"、"搜索近期创建的文档"或类似需求时使用此 Skill。
---

# 飞书文档深度搜索

## 功能说明

此 Skill 提供两种文档搜索模式：

| 模式 | 说明 | 排序方式 | 创建者限制 |
|------|------|----------|-----------|
| **用户创建文档** | 搜索用户自己创建的文档 | 编辑时间降序 | 仅用户创建 |
| **用户打开文档** | 搜索用户打开过的所有文档 | 打开时间降序 | 不限制 |

**核心特性**：
- 自动分页加载，直到超出时间范围
- 支持自定义时间范围过滤
- 返回完整的文档列表和统计数据

## 工具说明

使用 `feishu_search_doc_wiki` 工具进行搜索。

### 关键参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | string | 搜索关键词（可为空字符串） |
| `filter.creator_ids` | array | 创建者 open_id 列表 |
| `filter.sort_type` | string | 排序方式：`EDIT_TIME` / `OPEN_TIME` |
| `filter.create_time` | object | 创建时间范围 |
| `filter.open_time` | object | 打开时间范围 |
| `page_size` | int | 每页数量（默认15，最大20） |
| `page_token` | string | 分页标记 |

## 工作流程

### 模式一：用户创建的文档（按编辑时间）

```
1. 获取用户 open_id
2. 设置筛选条件：creator_ids = [用户open_id], sort_type = EDIT_TIME
3. 循环分页加载
   - 调用搜索 API
   - 检查 update_time 是否在时间范围内
   - 保存符合条件的文档
   - 超出范围则停止
4. 汇总输出
```

### 模式二：用户打开的文档（按打开时间）

```
1. 获取用户 open_id（用于记录，不限制创建者）
2. 设置筛选条件：sort_type = OPEN_TIME
3. 循环分页加载
   - 调用搜索 API
   - 检查 last_open_time 是否在时间范围内
   - 保存符合条件的文档
   - 超出范围则停止
4. 汇总输出
```

## 分页处理逻辑

### 核心代码逻辑

```python
def search_docs_deeply(mode, user_open_id, time_range_start, time_range_end):
    """
    深度搜索文档，自动分页直到超出时间范围
    
    Args:
        mode: "created" 或 "opened"
        user_open_id: 用户 open_id
        time_range_start: 时间范围起始（ISO 8601 格式）
        time_range_end: 时间范围结束（ISO 8601 格式）
    """
    all_docs = []
    page_token = None
    
    # 设置筛选条件
    if mode == "created":
        filter_config = {
            "creator_ids": [user_open_id],
            "sort_type": "EDIT_TIME"
        }
        time_field = "update_time"
    else:  # opened
        filter_config = {
            "sort_type": "OPEN_TIME"
        }
        time_field = "last_open_time"
    
    while True:
        # 调用搜索 API
        result = feishu_search_doc_wiki(
            action="search",
            query="",
            filter=filter_config,
            page_size=20,
            page_token=page_token
        )
        
        # 处理结果
        for doc in result["results"]:
            doc_time = doc["result_meta"][time_field]
            
            # 检查时间范围
            if doc_time < time_range_start:
                # 超出时间范围（降序排列，后面的会更早）
                return all_docs
            
            if doc_time <= time_range_end:
                all_docs.append(doc)
        
        # 检查是否还有更多
        if not result.get("has_more"):
            break
        
        page_token = result.get("page_token")
        
        # 安全限制：防止无限循环
        if len(all_docs) > 1000:
            break
    
    return all_docs
```

### 分页终止条件

1. **时间范围超限**：文档时间早于时间范围起点（降序排列，后续会更早）
2. **无更多数据**：`has_more = false`
3. **安全上限**：已加载超过 1000 条记录

## 输出格式

### 文档列表

```markdown
## 📄 搜索结果

**搜索模式**: 用户创建 / 用户打开
**时间范围**: {start} ~ {end}
**文档总数**: X 个

| # | 文档名称 | 类型 | 创建者 | 最后编辑/打开时间 |
|---|---------|------|--------|------------------|
| 1 | xxx | 多维表格 | 阿振 | 2026-04-07 23:52 |
| 2 | xxx | 文档 | 居右 | 2026-04-07 18:05 |
| ... | ... | ... | ... | ... |
```

### 统计摘要

```markdown
## 📊 统计摘要

### 按类型分布
| 类型 | 数量 |
|------|------|
| 多维表格 | X |
| 文档 | X |
| 电子表格 | X |
| 其他 | X |

### 按创建者分布（仅"用户打开"模式）
| 创建者 | 数量 |
|--------|------|
| 阿振 | X |
| 居右 | X |
| ... | X |
```

## 使用示例

### 示例 1：查看最近一周编辑的文档

**用户请求**：「帮我查看最近一周我创建的、按编辑时间排序的文档」

**执行流程**：
1. 确定时间范围：`{今天-7天} ~ {今天}`
2. 模式：用户创建 + 编辑时间排序
3. 分页加载直到超出 7 天前
4. 返回文档列表

### 示例 2：查看某天打开过的所有文档

**用户请求**：「查看 4 月 5 日我打开过的所有文档」

**执行流程**：
1. 时间范围：`2026-04-05T00:00:00+08:00 ~ 2026-04-05T23:59:59+08:00`
2. 模式：用户打开 + 打开时间排序
3. 分页加载直到超出当天
4. 返回文档列表

## 注意事项

1. **时间格式**：使用 ISO 8601 格式，包含时区（如 `2026-04-07T00:00:00+08:00`）
2. **分页限制**：每次最多返回 20 条，需多次分页
3. **性能考虑**：设置安全上限（1000条），避免过多 API 调用
4. **排序规则**：
   - `EDIT_TIME` - 编辑时间降序（最新在前）
   - `OPEN_TIME` - 打开时间降序（最近打开在前）

## 相关 Skill

- `feishu-fetch-doc` - 获取文档内容
- `feishu-create-doc` - 创建新文档
- `feishu-update-doc` - 更新文档内容
