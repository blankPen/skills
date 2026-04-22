# last30days 项目目录结构文档

## 项目概述

**last30days** 是一个 AI Agent 驱动的多源社交媒体研究引擎，能够跨 Reddit、X (Twitter)、YouTube、TikTok、Hacker News、Polymarket、GitHub 等平台进行并行搜索，按真实用户的互动数据（点赞、 upvotes、观看量等）对结果进行评分，最终合成一份结构化简报。

- **当前版本**: v3.0.5
- **最低 Python 版本**: 3.12
- **许可证**: MIT
- **官方仓库**: github.com/mvanhorn/last30days-skill

---

## 完整目录结构

```
last30days-skill/
├── SKILL.md                  # ⭐ 核心 Skill 定义文件（部署到 ~/.claude/skills/last30days/）
├── CLAUDE.md                  # Claude Code 开发规范
├── pyproject.toml             # Python 项目配置（依赖、测试配置）
│
├── scripts/                   # 🔵 核心脚本目录
│   ├── last30days.py         # ⭐ CLI 入口点
│   ├── build-skill.sh         # 构建 .skill 打包脚本
│   ├── sync.sh                # 部署同步脚本
│   ├── briefing.py            # 简报生成脚本
│   ├── store.py               # SQLite 数据存储脚本
│   ├── watchlist.py           # 关注列表脚本
│   │
│   └── lib/                   # ⭐ 核心库模块（50 个 Python 文件）
│       ├── __init__.py        # 包标记
│       │
│       ├── # 搜索数据源模块
│       ├── reddit.py          # Reddit 搜索
│       ├── reddit_public.py   # Reddit 公共 JSON API
│       ├── reddit_enrich.py   # Reddit 评论丰富化
│       ├── bird_x.py          # X/Twitter GraphQL 搜索
│       ├── xai_x.py           # xAI Responses API 集成
│       ├── youtube_yt.py      # YouTube 搜索 + 字幕提取
│       ├── bilibili_yt.py    # B站 搜索 + 字幕提取
│       ├── tiktok.py          # TikTok 搜索
│       ├── instagram.py       # Instagram Reels 搜索
│       ├── hackernews.py      # Hacker News 搜索
│       ├── polymarket.py       # Polymarket 预测市场搜索
│       ├── github.py          # GitHub 搜索
│       ├── bluesky.py         # Bluesky 搜索
│       ├── threads.py         # Threads 搜索
│       ├── pinterest.py       # Pinterest 搜索
│       ├── truthsocial.py     # Truth Social 搜索
│       ├── xiaohongshu_api.py # 小红书搜索
│       ├── perplexity.py      # Perplexity Sonar Web 搜索
│       │
│       ├── # 核心业务引擎模块
│       ├── pipeline.py        # ⭐ 搜索管道引擎（协调所有数据源）
│       ├── planner.py         # ⭐ 查询规划器
│       ├── fusion.py          # 多源结果融合与评分
│       ├── cluster.py         # 跨源内容聚类
│       ├── render.py          # markdown / JSON 输出生成
│       ├── normalize.py       # 数据格式标准化
│       ├── dedupe.py          # 近似重复检测
│       ├── rerank.py          # 结果重排序
│       ├── relevance.py        # LLM 相关性评分
│       ├── entity_extract.py  # 实体抽取
│       ├── resolve.py         # X handle、subreddit、GitHub 用户解析
│       │
│       ├── # 平台集成模块
│       ├── chrome_cookies.py   # Chrome cookie 提取
│       ├── safari_cookies.py  # Safari cookie 提取
│       ├── cookie_extract.py   # 通用 cookie 提取
│       ├── setup_wizard.py    # ⭐ 首次运行配置向导
│       ├── providers.py       # 多 API Provider 自动选择
│       │
│       ├── # 辅助工具模块
│       ├── env.py             # 环境变量配置加载
│       ├── http.py            # HTTP 客户端（重试逻辑）
│       ├── schema.py          # 数据类型定义与验证
│       ├── ui.py              # CLI 彩色输出、进度条
│       ├── log.py             # 日志工具
│       ├── dates.py           # 日期范围计算
│       ├── query.py           # 查询字符串处理
│       ├── signals.py         # Unix 信号处理（优雅退出）
│       ├── source_selector.py # 数据源选择器
│       ├── quality_nudge.py   # 质量提示生成
│       ├── snippet.py         # 代码片段工具
│       ├── grounding.py       # Web 搜索 grounding
│       ├── xquik.py           # X quick search 工具
│       │
│       └── vendor/            # 🔵 第三方库
│           └── bird-search/   # X 搜索客户端（MIT 许可证）
│               ├── bird-search.mjs
│               ├── lib/       # Twitter GraphQL 客户端实现
│               ├── package.json
│               └── LICENSE
│
└── commands/                  # CLI slash 命令定义
    └── last30days.md          # /last30days 命令注册
```

---

## scripts/lib/ 核心模块详解

### 搜索数据源模块

| 文件 | 平台/功能 | 说明 |
|------|----------|------|
| `reddit.py` | Reddit | 主搜索模块，支持关键词搜索、子板块发现、评论丰富化 |
| `reddit_public.py` | Reddit | 公共 JSON API 接口（无需 API key） |
| `reddit_enrich.py` | Reddit | 评论数据丰富化（upvotes、评论数等） |
| `bird_x.py` | X / Twitter | X 搜索客户端（GraphQL API） |
| `xai_x.py` | X / Twitter | xAI Responses API 集成 |
| `youtube_yt.py` | YouTube | YouTube 搜索 + 字幕提取（yt-dlp） |
| `bilibili_yt.py` | Bilibili | B站搜索 + 字幕提取 |
| `tiktok.py` | TikTok | TikTok 搜索（ScrapeCreators API） |
| `instagram.py` | Instagram | Instagram Reels 搜索（ScrapeCreators API） |
| `hackernews.py` | Hacker News | HN 搜索（Algolia API，免费） |
| `polymarket.py` | Polymarket | 预测市场搜索（Gamma API，免费） |
| `github.py` | GitHub | GitHub 搜索（PR、仓库、开发者资料） |
| `bluesky.py` | Bluesky | Bluesky AT Protocol 搜索 |
| `threads.py` | Threads | Threads 搜索（ScrapeCreators API） |
| `pinterest.py` | Pinterest | Pinterest 搜索（ScrapeCreators API） |
| `truthsocial.py` | Truth Social | Truth Social 搜索 |
| `xiaohongshu_api.py` | 小红书 | 小红书搜索 |
| `perplexity.py` | Perplexity | Perplexity Sonar Web 搜索（OpenRouter） |

### 核心业务引擎模块

| 文件 | 功能 | 说明 |
|------|------|------|
| `pipeline.py` | **管道引擎** | v3 核心搜索管道，协调所有数据源执行搜索 |
| `planner.py` | **查询规划器** | 生成优化的查询计划，决定搜索策略 |
| `fusion.py` | **结果融合** | 多源结果融合与评分计算 |
| `cluster.py` | **聚类引擎** | 跨源内容聚类，合并同一故事的多平台报道 |
| `render.py` | **渲染引擎** | 生成 markdown / JSON 输出 |
| `normalize.py` | **数据标准化** | 统一不同数据源的格式 |
| `dedupe.py` | **去重引擎** | 近似重复检测与去除 |
| `rerank.py` | **重排序** | 基于质量信号的结果重排序 |
| `relevance.py` | **相关性评分** | LLM 驱动的相关性判断 |
| `entity_extract.py` | **实体抽取** | 识别帖子中的人名、公司、产品等实体 |
| `resolve.py` | **实体解析** | 解析 X handle、subreddit、GitHub 用户等 |

### 平台集成模块

| 文件 | 功能 | 说明 |
|------|------|------|
| `chrome_cookies.py` | X 认证 | Chrome 浏览器 cookie 提取 |
| `safari_cookies.py` | X 认证 | Safari 浏览器 cookie 提取 |
| `cookie_extract.py` | Cookie 提取 | 通用浏览器 cookie 提取逻辑 |
| `setup_wizard.py` | **首次运行向导** | 引导用户完成初始配置（API key 设置等） |
| `providers.py` | API Provider | 多 Provider 自动选择与回退（OpenAI/xAI/Gemini） |

### 辅助工具模块

| 文件 | 功能 |
|------|------|
| `env.py` | 环境变量配置加载（API keys 等） |
| `http.py` | HTTP 客户端（带重试逻辑） |
| `schema.py` | 数据类型定义与验证 |
| `ui.py` | CLI 用户界面（彩色输出、进度条等） |
| `log.py` | 日志工具 |
| `dates.py` | 日期范围计算 |
| `query.py` | 查询字符串处理 |
| `signals.py` | Unix 信号处理（优雅退出） |
| `source_selector.py` | 数据源选择器 |
| `quality_nudge.py` | 质量提示生成 |
| `snippet.py` | 代码片段工具 |
| `grounding.py` | Web 搜索 grounding |
| `xquik.py` | X quick search 工具 |

### vendored 第三方模块

```
scripts/lib/vendor/bird-search/     # X 搜索客户端（MIT 许可证）
├── bird-search.mjs                 # 主入口文件
├── lib/                            # 核心库
│   ├── twitter-client-base.js
│   ├── twitter-client-search.js
│   ├── twitter-client-constants.js
│   ├── cookies.js
│   └── ...
├── package.json
└── LICENSE
```

---

## scripts/ 顶层脚本

| 脚本 | 用途 |
|------|------|
| `last30days.py` | **主入口**，CLI 工具，支持 `--emit=compact\|json\|md\|context\|path` |
| `briefing.py` | 生成研究简报 |
| `build-skill.sh` | 构建 `.skill` 打包文件用于发布 |
| `sync.sh` | 部署脚本（同步到 ~/.claude 等目录） |
| `store.py` | SQLite 数据存储操作 |
| `watchlist.py` | 关注列表管理 |

---

## 关键配置与规范

### Python 版本要求

```toml
# pyproject.toml
requires-python = ">=3.12"
```

### 依赖配置

```toml
dependencies = [
  "requests>=2.32,<3",
]

[dependency-groups]
dev = [
  "pytest>=9,<10",
  "pytest-cov>=7,<8",
]
```

---

## 数据流向架构（v3）

```
用户输入（topic）
       │
       ▼
┌─────────────────┐
│  Step 0: 预研究  │  ← web search 解析 X handles、subreddits、hashtags
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Step 0.75:     │  ← 生成查询计划 JSON（intent、subqueries、sources）
│  查询规划器      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         Pipeline（并行搜索管道）            │
│  ┌────────┐ ┌────────┐ ┌────────┐       │
│  │ Reddit │ │   X    │ │YouTube │  ...   │
│  └────┬───┘ └───┬────┘ └───┬────┘       │
│       │         │          │              │
│       └─────────┴──────────┘              │
│                  │                         │
│         ▼ 聚类引擎 ◀─────────────┐        │
│                  │                  │       │
│         ▼ 融合评分引擎 ◀──────────┤        │
│                  │                  │       │
│         ▼ 去重与重排序 ◀───────────┤        │
└──────────────┬──┴───────────────────┘        │
               │                              │
               ▼                              │
┌──────────────────────────────┐              │
│      Render（输出生成）        │              │
│  compact / json / md / context│              │
└──────────────────────────────┘              │
               │                              │
               ▼                              │
        存储至 ~/Documents/Last30Days/       │
```

---

## 主要 API Keys 与数据源

| 数据源 | 认证方式 | 费用 |
|--------|---------|------|
| Reddit（线程+评论） | 公共 JSON（无需认证） | 免费 |
| Hacker News | Algolia API | 免费 |
| Polymarket | Gamma API | 免费 |
| GitHub | gh CLI 或 API | 免费 |
| X / Twitter | Browser cookies (`FROM_BROWSER=auto`) 或 `XAI_API_KEY` | 免费/付费 |
| YouTube | yt-dlp（本地工具） | 免费 |
| TikTok | ScrapeCreators API | 10,000 次免费调用 |
| Instagram | ScrapeCreators API | 10,000 次免费调用 |
| Bluesky | App Password | 免费 |
| Perplexity Sonar | OpenRouter API | 按量付费 |
| Web 搜索 | Brave Search API | 2,000 次/月免费 |

---

## 部署与分发

### Skill 部署路径

- **Claude Code**: `~/.claude/skills/last30days/`
- **Codex**: `~/.agents/skills/last30days/`
- **OpenClaw**: `~/.hermes/skills/research/last30days/`

### 构建 .skill 文件

```bash
bash scripts/build-skill.sh
# 输出: dist/last30days.skill
```

### 同步脚本

```bash
bash scripts/sync.sh
# 部署到 ~/.claude, ~/.agents, ~/.codex
```

---

*文档版本: 2026-04-21 | 项目版本: v3.0.5*
