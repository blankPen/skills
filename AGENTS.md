# AGENTS.md

本仓库为 OpenCode 自定义技能仓库，包含飞书集成、Git 操作等工具技能。

## 项目结构

```
/Users/admin/du/skills/
├── skills/                    # 技能目录
│   ├── <skill-name>/
│   │   ├── SKILL.md          # 技能定义文件（必需）
│   │   ├── scripts/          # 可执行脚本（可选）
│   │   ├── references/       # 参考资料（可选）
│   │   └── assets/           # 静态资源（可选）
│   ├── codereview-progress-analyzer/
│   ├── feishu-docs-deepsearch/
│   ├── feishu-message-deepsearch/
│   ├── feishu-room-search/
│   ├── feishu-schedule-invite/
│   └── git-commits-search/
└── README.md
```

---

## 构建/测试/运行命令

**注意**：本仓库为技能定义仓库，无构建系统、无测试、无 lint 命令。

### 技能脚本执行

```bash
# TypeScript 脚本（使用 bun）
bun run skills/git-commits-search/scripts/fetch.ts --date=2024-01-15

# Python 脚本
python skills/feishu-message-deepsearch/scripts/analyzer.py
python skills/feishu-message-deepsearch/scripts/cache_manager.py
```

### 单一技能测试

无自动化测试。手动测试：
1. 修改脚本
2. 直接运行脚本验证输出

---

## 代码风格指南

### 通用规范

| 规范 | 要求 |
|-----|------|
| 注释语言 | 中文 |
| 提交信息 | 中文 |
| 文档 | 中文 |
| 缩进 | 2 空格 或 4 空格（保持一致）|

### TypeScript 规范

```typescript
// 1. 接口命名：PascalCase，前缀 I（可选）
interface GitCommit {
  hash: string;
  repo: string;
  author: string;
}

// 2. 变量/函数命名：camelCase
function getRepos(options: Options): string[] { }
const gitRepos: string[] = [];

// 3. 类型注解：始终使用类型注解，不使用 any
// ❌ bad: const data: any = response
// ✅ good: const data: Output = response

// 4. 错误处理：try-catch 并记录错误
try {
  const result = execSync(logCmd, { encoding: "utf-8", silent: true });
} catch (error) {
  // 忽略特定错误或记录
}

// 5. 严格模式
// 在 TS 文件开头声明 "use strict"
```

### Python 规范

```python
# 1. 命名：snake_case
def save_to_cache(data, file_path):
    pass

# 2. 类型注解：推荐使用
def analyze_messages(messages: list[Message]) -> Report:
    pass

# 3. 文档字符串：Google 风格
def fetch_data(user_id: str) -> dict:
    """获取用户数据。
    
    Args:
        user_id: 用户 open_id
        
    Returns:
        包含用户数据的字典
    """
    pass

# 4. 异常处理：具体异常类型
try:
    result = json.loads(data)
except json.JSONDecodeError as e:
    logger.error(f"JSON 解析失败: {e}")
```

### SKILL.md 格式规范

```yaml
---
name: skill-name              # 必需：技能名称（kebab-case）
description: 触发描述          # 必需：何时使用此技能（中文）
---

# 技能标题

## 功能说明

## 使用方式

## 注意事项
```

**文件结构**：
- YAML frontmatter 在文件顶部
- Markdown 正文使用中文标题和内容
- 代码块标注语言（bash, python, typescript, json, yaml）

### Markdown 格式规范

```markdown
# 一级标题：页面标题
## 二级标题：主要章节
### 三级标题：子章节

- 列表项使用 `-`
- 表格使用 `|` 分隔
- 代码块使用 ```包裹
```

---

## 命名约定

| 类型 | 约定 | 示例 |
|-----|------|------|
| 目录名 | kebab-case | `feishu-message-deepsearch` |
| 文件名 | kebab-case | `cache-manager.py` |
| 函数名 | camelCase / snake_case | `getRepos()`, `save_to_cache()` |
| 变量名 | camelCase / snake_case | `gitRepos`, `user_open_id` |
| 常量 | UPPER_SNAKE_CASE | `MAX_RETRIES`, `API_TIMEOUT` |
| 类名 | PascalCase | `GitCommitAnalyzer` |
| 接口名 | PascalCase / I前缀 | `Output`, `IOptions` |

---

## 错误处理规范

### TypeScript

```typescript
// 1. 使用 try-catch 捕获同步错误
try {
  const data = fs.readFileSync(path);
} catch (error) {
  // 吞掉可忽略的错误或记录
}

// 2. 不使用 any 类型
// ❌ bad: catch(error: any)
// ✅ good: catch(error: unknown) + 类型守卫

// 3. 区分错误类型
function handleError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
```

### Python

```python
# 1. 具体异常类型
try:
    result = json.loads(data)
except json.JSONDecodeError as e:
    logger.error(f"JSON 解析失败: {e}")
except Exception as e:
    logger.error(f"未知错误: {e}")

# 2. 不使用 bare except
# ❌ bad: except:
# ✅ good: except Exception:

# 3. 资源清理使用 with
with open(file_path, 'r') as f:
    content = f.read()
```

---

## Git 提交规范

```bash
# 格式
git commit -m "类型: 描述

# 类型
feat: 新功能
fix: 修复
docs: 文档
refactor: 重构
perf: 性能优化

# 示例
git commit -m "feat: 添加飞书文档深度搜索技能

- 支持按编辑时间排序
- 支持按打开时间排序
- 自动分页加载"
```

---

## 文件操作注意事项

1. **读取文件前**：先确认文件存在，使用 `fs.existsSync()` 检查
2. **写入文件**：确保父目录存在，使用 `fs.mkdirSync(..., { recursive: true })`
3. **路径处理**：使用 `path.join()` 拼接，避免硬编码分隔符
4. **JSON 操作**：使用 `JSON.stringify(data, null, 2)` 格式化输出

---

## 依赖管理

- **运行时依赖**：bun (TypeScript)、python3
- **无锁文件**：本仓库不管理包依赖
- **外部 API**：飞书开放平台 API、Git CLI
