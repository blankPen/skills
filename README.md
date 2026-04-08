# Skills 仓库

存放 OpenCode 自定义技能的代码仓库。

## 目录结构

```
skills/
└── <skill-name>/
    ├── SKILL.md          # 必需：技能定义文件
    ├── scripts/           # 可选：可执行脚本
    ├── references/        # 可选：参考资料
    └── assets/            # 可选：静态资源
```

## 可用技能

| 技能名称 | 描述 | 触发场景 |
|---------|------|---------|
| `browser-history-search` | 搜索本地浏览器历史记录，支持 Chrome/Tabbit | "查看浏览器历史"、"搜索访问记录"、"我昨天访问过哪些网站" |
| `feishu-message-deepsearch` | 获取飞书用户当天的完整聊天记录并进行汇总分析 | "查看今天的聊天记录"、"分析我今天做了什么" |
| `feishu-docs-deepsearch` | 深度搜索飞书文档，支持按编辑时间或打开时间排序 | "查看我最近编辑的文档"、"查找某时间段内打开过的文档" |
| `feishu-room-search` | 飞书会议室查询工具，搜索会议室、查询可用性 | "有哪些空闲会议室"、"几点有什么会议室可用" |
| `feishu-schedule-invite` | 飞书智能日程邀约，自动分析参与人忙闲、会议室可用性 | "创建日程"、"发送日程邀约"、"约会议" |
| `git-commits-search` | 获取指定时间的 Git 提交记录 | "Git 提交"、"代码提交"、"commit 记录" |
| `codereview-progress-analyzer` | 分析 CodeReview 进度，跟踪前后端团队完成状态 | "分析 CR 进度"、"查看 CodeReview 情况"、"CR 报告" |

## Skill 格式

每个 skill 必须包含 `SKILL.md`，包含：

```yaml
---
name: <skill-name>
description: <描述：当什么情况触发此技能>
---

# 指令内容
```

### SKILL.md 结构规范

1. **YAML Frontmatter**（必需）
   - `name`: 技能名称（英文，kebab-case）
   - `description`: 触发描述（中文，说明何时使用此技能）

2. **Markdown 正文**（必需）
   - 技能详细说明
   - 使用方式/工作流程
   - API 参数说明（如有）
   - 代码示例
   - 注意事项

## 添加新 Skill

1. 在 `skills/` 下创建 skill 目录
2. 创建 `SKILL.md` 文件
3. 根据需要添加 `scripts/`、`references/`、`assets/` 目录

详细规范请参考 [skill-creator](https://github.com/your-org/skill-creator)。

## 脚本说明

### TypeScript 脚本

```bash
# git-commits-search
bun run skills/git-commits-search/scripts/fetch.ts --date=2024-01-15

# browser-history-search
bun run skills/browser-history-search/scripts/fetch.ts --days=7 --search=github
```

### Python 脚本

```bash
# feishu-message-deepsearch
python scripts/analyzer.py
python scripts/cache_manager.py
```

## 规范说明

- **代码注释**：使用中文
- **提交信息**：使用中文
- **文档**：使用中文
- **命名**：
  - 目录/文件名：kebab-case（如 `feishu-message-deepsearch`）
  - 变量/函数：camelCase（如 `getRepos`, `scanWorkspaceForGitRepos`）
