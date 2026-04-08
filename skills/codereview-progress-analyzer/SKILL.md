---
name: codereview-progress-analyzer
description: Analyze CodeReview progress for specified iterations. Use this skill when users request "分析 CR 进度", "查看 CodeReview 情况", "CR 报告", or need to track CodeReview completion status across frontend/backend teams.
---

# CodeReview 进度分析

分析指定迭代的 CodeReview 进度，帮助了解 CR 完成情况和发现的问题。

## 数据源

### 前端表格
- URL: https://poizon.feishu.cn/wiki/DJ4yw4xPKi7TcHkS8NfcHkHJnWb?table=tbl8hYGoxXF9g4vQ&view=vewrSPwnyo
- 筛选条件：`无需 CR 为空` AND `前端迭代估时 > 0` AND `职能 = 前端`

### 后端表格
- URL: https://poizon.feishu.cn/wiki/DJ4yw4xPKi7TcHkS8NfcHkHJnWb?table=tbl0D0EEdAzZ8nP1&view=vewzgMVsZl
- 筛选条件：`无需 CR 为空` AND `后端迭代估时 > 0` AND `职能 = 后端`

## 分析流程

### Step 1: 确认分析范围

询问用户以下信息（如果未提供）：
1. **迭代名称** - 例如：Sprint 2024-W12、迭代2.5.0
2. **职能范围** - 前端 / 后端 / 全部（默认）

### Step 2: 获取表格数据

使用 WebFetch 工具获取飞书表格内容，根据筛选条件过滤数据：
- 排除"无需 CR"字段不为空的记录
- 排除迭代估时为 0 或空的记录
- 按职能筛选（前端/后端）

### Step 3: 判断 CR 状态

遍历记录，根据以下规则判断 CR 状态：

| 条件 | 状态 |
|------|------|
| Review 人 和 CR 链接 都不为空 | **已 CR** |
| Review 人 或 CR 链接 为空 | **未 CR** |

### Step 4: 识别特殊情况

检查"问题记录"和"备注"字段，识别可能不需要 CR 的记录：
- 包含关键词：不需要 CR、无需 CodeReview、此需求不需要 CR
- 统计此类记录并提示用户确认是否标记为 [无需CR]

### Step 5: 问题汇总

从"问题记录"字段提取并归类：
- 主要问题类型（如：代码规范、性能问题、安全问题、逻辑错误）
- 出现频率统计

### Step 6: 生成分析报告

## 分析报告模板

```markdown
# CodeReview 进度分析报告

## 概览
- 迭代：{迭代名称}
- 分析时间：{时间}
- 前端 CR 进度：{已完成}/{总数} ({完成率}%)
- 后端 CR 进度：{已完成}/{总数} ({完成率}%)

## 前端 CR 详情

### 按业务域分组

| 业务域 | 已 CR | 未 CR | 完成率 |
|--------|-------|-------|--------|
| {域名} | {数量} | {数量} | {百分比} |

### 未 CR 明细

| 需求 | 业务域 | 研发 | 问题记录/备注 |
|------|--------|------|---------------|
| {需求名} | {域名} | {研发} | {内容} |

## 后端 CR 详情

（格式同前端）

## 待确认事项

以下记录可能不需要 CR，请确认是否标记为 [无需CR]：
- {需求名} - {原因}

## 问题汇总

本次 CR 中发现的主要问题：
1. {问题类型1}：{数量}次
2. {问题类型2}：{数量}次

## 建议

{根据分析给出的建议}
```

## 用户交互示例

### 示例 1：分析指定迭代
```
用户: 帮我分析下 Sprint 2024-W12 的 CR 进度
助手: 正在分析 Sprint 2024-W12 的 CodeReview 进度...
      [生成分析报告]
```

### 示例 2：分析特定职能
```
用户: 查看下前端的 CR 情况，迭代2.5.0
助手: 正在分析迭代2.5.0 前端的 CodeReview 进度...
      [生成分析报告]
```

### 示例 3：发现待确认记录
```
助手: 以下记录可能不需要 CR，是否需要通知相关人员标记？
      - 需求A：备注中提到"纯配置变更，无需CR"
      - 需求B：问题记录中说明"只是文案修改"
```

## 注意事项

- 飞书表格需要登录权限，确保有访问权限
- 数据量大时可能需要分批处理
- 保护敏感信息，不在报告中暴露代码细节
- 问题汇总时注意归类，避免列出过多细节问题
