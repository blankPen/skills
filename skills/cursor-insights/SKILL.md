---
name: open-insights
description: 生成分析 Agent 会话的报告；当用户想要生成一份会话的分析报告时调用
---

# Open Insights

这个技能用于创建一份 Agent 会话分析的报告

## 处理流程

### 1. 内容读取
- 执行 `bun run ./scripts/scan.ts` 脚本进行 Cursor 会话的扫描
- 扫描结束后，查看用户主目录下的 `.agent-insights/conversations` 目录（通过 `os.homedir()` 获取主目录，Windows 上为 `%USERPROFILE%`，macOS/Linux 上为 `~`）中的所有文件夹，让用户选择要分析的项目
- 根据选择的目录，读取目录下的所有以 `.md` 为后缀的 Agent 对话内容

### 2. 摘要总结
```
请对 Agent 会话记录的这一部分进行摘要总结，重点关注：
1. 用户要求了什么
2. Claude 做了什么（使用了哪些工具、修改了哪些文件）
3. 遇到的摩擦或问题
4. 最终结果

保持简洁，3-5 句话。保留具体细节，如文件名、错误信息和用户反馈。

会话记录片段：
```

### 3. 特征提取
```
分析这段 Agent 会话并提取结构化特征。

重要指导原则：

1. **goal_categories**：仅统计用户明确要求的内容。
   - 不要统计 Claude 自主进行的代码库探索
   - 不要统计 Claude 自行决定要做的工作
   - 仅当用户说"你能...吗"、"请..."、"我需要..."、"我们来..."时才统计

2. **user_satisfaction_counts**：仅基于用户的明确反馈。
   - "太棒了！"、"很好！"、"完美！" → happy（满意）
   - "谢谢"、"看起来不错"、"可以用了" → satisfied（满足）
   - "好的，现在让我们..."（继续而不抱怨）→ likely_satisfied（可能满意）
   - "不对"、"再试一次" → dissatisfied（不满）
   - "这坏了"、"我放弃了" → frustrated（沮丧）

3. **friction_counts**：具体说明出了什么问题。
   - misunderstood_request：Claude 理解有误
   - wrong_approach：目标正确，但解决方案方法错误
   - buggy_code：代码无法正常工作
   - user_rejected_action：用户拒绝/停止了某个工具调用
   - excessive_changes：过度设计或修改过多

4. 如果会话非常短或只是热身，使用 warmup_minimal 作为目标类别

会话内容：
<会话记录插入此处>

仅返回符合以下 schema 的有效 JSON 对象：
{
  "underlying_goal": "用户根本上想要实现的目标",
  "goal_categories": {"类别名": 数量, ...},
  "outcome": "fully_achieved | mostly_achieved | 
              partially_achieved | not_achieved | 
              unclear_from_transcript",
  "user_satisfaction_counts": {"级别": 数量, ...},
  "claude_helpfulness": "unhelpful | slightly_helpful | moderately_helpful | very_helpful | essential",
  "session_type": "single_task | multi_task | iterative_refinement | exploration | quick_question",
  "friction_counts": {"摩擦类型": 数量, ...},
  "friction_detail": "一句话描述摩擦点，或为空",
  "primary_success": "none | fast_accurate_search | correct_code_edits | good_explanations | proactive_help | multi_file_changes | good_debugging",
  "brief_summary": "一句话：用户想要什么以及是否达成"
}
```

#### 目标类别
类别	| 描述
--- | ---
debug_investigate	| 调试/调查
implement_feature	| 实现功能
fix_bug	| 修复 Bug
write_script_tool	| 编写脚本/工具
refactor_code	| 重构代码
configure_system	| 配置系统
create_pr_commit	| 创建 PR/提交
analyze_data	| 分析数据
understand_codebase	| 理解代码库
write_tests	| 编写测试
write_docs	| 编写文档
deploy_infra	| 部署/基础设施
warmup_minimal	| 缓存预热（最小会话）

#### Claude 有用程度级别：
unhelpful → slightly_helpful → moderately_helpful → very_helpful → essential

#### 会话类型
类型	| 描述
--|--
single_task	| 单一聚焦任务
multi_task	| 一个会话中的多个任务
iterative_refinement	| 来回迭代优化
exploration	| 探索/理解代码库
quick_question	| 简短问答

#### 主要成功类别
类别	| 描述
-- | --
none	| 没有显著成功
fast_accurate_search	| 快速准确的代码搜索
correct_code_edits	| 准确的代码修改
good_explanations	| 清晰的解释
proactive_help	| 超出要求的主动帮助
multi_file_changes	| 成功协调多文件编辑
good_debugging	| 有效的调试




### 4. 内容分析
一旦收集到所有会话数据和特征之后，它们会被汇总并通过多个专业分析提示进行处理。

#### 传递给分析提示的数据

每个分析提示接收汇总后的统计数据：

```json
{
  "sessions": "<总会话数>",
  "analyzed": "<已分析的会话数>",
  "date_range": { "start": "...", "end": "..." },
  "messages": "<总消息数>",
  "hours": "<总时长（小时）>",
  "commits": "<git 提交数>",
  "top_tools": ["使用量前8的工具"],
  "top_goals": ["前8个目标类别"],
  "outcomes": { "结果分布" },
  "satisfaction": { "满意度分布" },
  "friction": { "摩擦类型统计" },
  "success": { "成功类别统计" },
  "languages": { "语言使用统计" }
}
```

以及文本摘要：
- **会话摘要：** 最多 50 条简短摘要
- **摩擦详情：** 从特征中提取的最多 20 条摩擦详情
- **用户对 Claude 的指示：** 用户重复给 Claude 的最多 15 条指示

#### 4.1 项目领域分析

```
分析这份 Agent 使用数据，识别项目领域。

仅返回有效的 JSON 对象：

{
  "areas": [
    {
      "name": "领域名称",
      "session_count": N,
      "description": "2-3 句话，描述工作内容以及如何使用 Agent。"
    }
  ]
}

包含 4-5 个领域。跳过内部 CC 操作。
```

#### 4.2 交互风格分析

```
分析这份 Agent 使用数据，识别用户的交互风格。

仅返回有效的 JSON 对象：

{
  "style": "简要描述其风格（2-3 句话）",
  "strengths": ["2-3 件做得好的事"],
  "patterns": ["2-3 个值得注意的工作模式"]
}
```

#### 4.3 有效之处分析

```
分析这份 Agent 使用数据，识别哪些地方运作良好。

仅返回有效的 JSON 对象：

{
  "big_wins": [
    {
      "title": "简短标题（4-6 个字）",
      "description": "2-3 句话描述一项令人印象深刻的成就"
    }
  ]
}

包含 2-3 个重大成果。要具体，并引用实际会话。
```

#### 4.4 摩擦分析

```
分析这份 Agent 使用数据，识别摩擦规律。

仅返回有效的 JSON 对象：

{
  "friction_points": [
    {
      "category": "类别名称",
      "frequency": "rare | occasional | frequent",
      "description": "2-3 句话描述该规律"
    }
  ]
}

包含 2-3 个摩擦点。要诚实但有建设性。
```

#### 4.5 建议分析

```
分析这份 Agent 使用数据并生成建议。

仅返回有效的 JSON 对象：

{
  "features_to_try": [
    {
      "feature": "功能名称",
      "benefit": "有什么帮助",
      "example": "来自其使用记录的具体示例"
    }
  ],
  "usage_patterns": [
    {
      "pattern": "模式名称",
      "benefit": "为什么有帮助",
      "example": "如何应用"
    }
  ]
}

各包含 2-3 条。要针对其实际使用模式给出具体建议。
```

#### 4.6 未来展望分析

```
分析这份 Agent 使用数据，识别未来机会。

仅返回有效的 JSON 对象：

{
  "intro": "关于 AI 辅助开发演进的 1 句话",
  "opportunities": [
    {
      "title": "简短标题（4-8 个字）",
      "whats_possible": "2-3 句话，关于自主工作流的宏大愿景",
      "how_to_try": "1-2 句话，提及相关工具",
      "copyable_prompt": "可直接使用的详细提示词"
    }
  ]
}

包含 3 个机会。大胆想象——自主工作流、并行代理、对照测试迭代。
```

#### 4.7 趣味结尾（难忘瞬间）

```
分析这份 Agent 使用数据，找出一个难忘的瞬间。

仅返回有效的 JSON 对象：

{
  "headline": "来自记录的令人难忘的定性瞬间——不是统计数字。要有人情味、有趣或出人意料。",
  "detail": "关于这件事发生的时间/地点的简要背景"
}

从会话摘要中找出真正有趣或令人惊喜的内容。
```

---

### 5.生成概览

最后一次 LLM 调用会生成一个将所有内容串联起来的执行摘要。此提示接收所有先前生成的洞察作为上下文。

#### 总览提示词

```
你正在为 Agent 用户的使用洞察报告撰写"一览概要"摘要。
目标是帮助他们了解自己的使用情况，以及如何随着模型改进更好地使用 Claude。

使用以下 4 部分结构：

1. **哪些有效** - 用户与 Claude 交互的独特风格是什么，
   他们做了哪些有影响力的事情？可以包含一两个细节，
   但保持高层次概述，因为这些内容可能已不在用户的记忆中。
   不要空洞或过度吹捧。也不要聚焦于他们使用的工具调用。

2. **哪些在阻碍你** - 分为（a）Claude 的问题（误解、
   错误方法、Bug）和（b）用户侧的摩擦（提供的上下文不足、
   环境问题——理想情况下应比单个项目更通用）。
   要诚实但有建设性。

3. **可尝试的快速改进** - 他们可以从下方示例中尝试的具体
   Agent 功能，或者如果你认为某个工作流技巧确实有价值
   也可以提及。（避免像"让 Claude 在采取行动前先确认"或
   "先写出更多上下文"这类吸引力较低的建议。）

4. **为更强大模型准备的宏大工作流** - 随着未来 3-6 个月
   内模型能力大幅提升，他们应该准备什么？哪些现在看似不可能
   的工作流将成为可能？从下方适当章节中汲取灵感。

每个部分保持 2-3 句不太长的话。不要让用户不知所措。
不要提及会话数据中的具体数字统计或特定类别名称。使用辅导语气。

仅返回有效的 JSON 对象：

{
  "whats_working": "（参考上方说明）",
  "whats_hindering": "（参考上方说明）",
  "quick_wins": "（参考上方说明）",
  "ambitious_workflows": "（参考上方说明）"
}

会话数据：
<汇总统计 JSON>

## 项目领域（用户工作内容）
<project_areas 结果>

## 重大成果（令人印象深刻的成就）
<what_works 结果>

## 摩擦类别（哪些地方出了问题）
<friction_analysis 结果>

## 可尝试的功能
<suggestions.features_to_try 结果>

## 待采纳的使用模式
<suggestions.usage_patterns 结果>

## 未来展望（为更强大模型准备的宏大工作流）
<on_the_horizon 结果>
```

---

### 6.生成报告

所有收集到的数据和 LLM 生成的洞察都会渲染为一份可交互的 HTML 报告。HTML 模板参考 `./temp/report_temp.html`

最终报告输出到用户主目录下的 `.agent-insights/reports/agent-insights-report-YYYY-MM-DD.html`（主目录通过 `os.homedir()` 获取，Windows 上为 `%USERPROFILE%`，macOS/Linux 上为 `~`）

### 统计仪表盘：
- 总会话数、消息数、时长、Token 数
- Git 提交和推送数

### 报告章节：
1. **一览概要** - 执行摘要
2. **项目领域** - 你在做什么
3. **交互风格** - 你如何与 Claude 协作
4. **有效之处** - 你的重大成果
5. **摩擦点** - 哪些地方出了问题
6. **建议** - 可尝试的功能和可采纳的模式
7. **未来展望** - 未来的机会
8. **趣味结尾** - 一个难忘的瞬间

---
