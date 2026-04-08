---
name: browser-history-search
description: 搜索本地电脑的浏览器历史记录，支持 Chrome/Tabbit 等 Chromium 内核浏览器。当用户要求"查看浏览器历史"、"搜索访问记录"、"我昨天访问过哪些网站"、"查看 Chrome 历史"或类似需求时使用此 Skill。
---

# 浏览器历史记录搜索

## 功能说明

通过读取本地浏览器 SQLite 数据库，获取用户的浏览历史记录，支持按时间范围、关键词搜索。

### 支持的浏览器

| 浏览器 | 数据库路径 | 时间戳格式 |
|--------|-----------|-----------|
| Chrome | `~/Library/Application Support/Google/Chrome/Default/History` | Windows FILETIME（微秒） |
| Tabbit | `~/Library/Application Support/Tabbit/Default/History` | Windows FILETIME（微秒） |

## 使用方式

```bash
# 获取最近 7 天的所有浏览器历史
bun run skills/browser-history-search/scripts/fetch.ts --days=7

# 获取指定日期的历史记录（如 2026-04-07）
bun run skills/browser-history-search/scripts/fetch.ts --date=2026-04-07

# 搜索特定关键词（如 "github"）
bun run skills/browser-history-search/scripts/fetch.ts --search=github

# 指定浏览器（chrome/tabbit/all）
bun run skills/browser-history-search/scripts/fetch.ts --browser=chrome --days=7

# 限制返回数量
bun run skills/browser-history-search/scripts/fetch.ts --days=7 --limit=50
```

### 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--days` | 最近 N 天的历史记录（与 --date 互斥） | 1 |
| `--date` | 指定日期，格式 YYYY-MM-DD（与 --days 互斥） | - |
| `--search` | 搜索关键词（URL 或标题） | - |
| `--browser` | 指定浏览器：`chrome`/`tabbit`/`all` | `all` |
| `--limit` | 返回记录数量限制 | 1000 |


## 输出格式

### 格式化输出示例

```
2026-04-08 11:23:48  tabbit  百度一下，你就知道  https://www.baidu.com/
2026-04-08 11:23:45  tabbit  新标签页  https://web.tabbitbrowser.com/newtab
2026-04-08 11:00:56  tabbit  手账记录 - iWork 平台  https://iwork.dewu-inc.com/timenote/...
```

## 注意事项

1. **浏览器运行锁定**：Chrome/Tabbit 运行时数据库被锁定，脚本会自动复制到临时文件再查询
2. **权限提示**：首次访问 `~/Library` 可能需要 macOS 授权
3. **隐私保护**：所有查询在本地执行，不会上传任何数据
4. **时间范围**：默认查询最近 1 天，过长范围会产生大量数据

## 脚本说明

- `scripts/fetch.ts` - 主脚本，支持多浏览器、时间过滤、关键词搜索
