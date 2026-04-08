# work-summary-skill 学习记录

## 创建时间
2026-04-08

## 技能设计思路

### 触发场景
用户要求"总结今天的工作"、"生成工作日报"、"整理今日工作"时使用。

### 数据源聚合
该技能是一个聚合型技能，整合了四个现有技能的数据：
- feishu-message-deepsearch - 飞书聊天记录
- feishu-docs-deepsearch - 飞书文档
- browser-history-search - 浏览器历史
- git-commits-search - Git 提交

### 输出结构
1. 今日概览（统计指标）
2. 今日时间线（按时间顺序）
3. 今日重点事项（已完成/待跟进）
4. 技术产出（Git 提交）
5. 知识获取（浏览器访问）
6. 沟通记录（飞书会话）
7. 后续建议

### JSON 存档设计
- 按数据源分类存储原始数据
- 包含 summary 字段用于快速查询
- 路径：`~/.openclaw/cache/work-summary/{YYYY-MM-DD}.json`

## 参考格式
- feishu-message-deepsearch/SKILL.md - 消息分析报告格式
- feishu-docs-deepsearch/SKILL.md - 文档列表格式
- browser-history-search/SKILL.md - 命令行使用方式
- git-commits-search/SKILL.md - 提交记录格式
