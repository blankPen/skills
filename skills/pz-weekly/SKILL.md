---
name: pz-weekly
description: "生成研发四部每周迭代排期周报。从 teamwork-backend 拉取指定迭代的排期数据，按二级部门（客服平台/无线平台/汇金平台）分组统计需求数、提效前后工时、全栈需求，生成飞书文档。触发词：「周报」「生成周报」「pz-weekly」「迭代排期统计」「排期周报」。"
argument-hint: 'pz-weekly 597'
allowed-tools: Bash, Read, Write
user-invocable: true
---

# 研发四部迭代排期周报

拉取指定迭代的排期工时数据，按二级部门分组统计，生成飞书文档周报。

## 使用方式

```
/pz-weekly <迭代ID>
```

示例：`/pz-weekly 597` — 统计迭代 597（5.97 版本）的排期数据。

## 执行步骤

### Step 1：运行统计脚本

```bash
python3 ~/.claude/skills/pz-weekly/scripts/gen_weekly.py --iteration-id {迭代ID} --output /tmp/pz_weekly.json
```

**依赖**：`ep-proxy`、`cli-auth token`、`rdc-open`

### Step 2：读取统计结果，生成飞书文档 XML

读取 `/tmp/pz_weekly.json`，按以下结构生成飞书文档 XML：

```xml
<title>研发四部 V5.97 迭代排期周报</title>

<h1>整体概览</h1>
<table>
  <thead><tr><th>二级部门</th><th>需求数</th><th>提效前(manual)</th><th>提效后(spent)</th><th>AI节省</th><th>提效%</th><th>全栈需求</th><th>全栈占比%</th></tr></thead>
  <tbody>
    <tr><td>客服平台</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td></tr>
    <tr><td>无线平台</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td></tr>
    <tr><td>汇金平台</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td></tr>
    <tr><td><b>合计</b></td><td><b>...</b></td><td><b>...</b></td><td><b>...</b></td><td><b>...</b></td><td><b>...</b></td><td><b>...</b></td><td><b>...</b></td></tr>
  </tbody>
</table>

<callout emoji="📊" background-color="light-blue" border-color="blue" text-color="dark">
  <p><b>整体提效 {eff_pct}%</b>，AI 节省 {saved} 天工时。全栈需求共 {fs_cnt} 条，占总量 {fs_ratio}%。</p>
</callout>

<h1>二级部门明细</h1>

# 对每个部门，生成小节：
<h2>客服平台</h2>
<callout emoji="📌" background-color="light-blue" border-color="blue" text-color="dark">
  <p>需求 {cnt} 条，提效 {eff_pct}%，全栈 {fs_cnt} 条（{fs_ratio}%）</p>
</callout>

<h2>无线平台</h2>
...

<h2>汇金平台</h2>
...

<h1>全栈需求明细</h1>
<table>
  <thead><tr><th>二级部门</th><th>开发人员</th><th>需求名称</th><th>提效前</th><th>提效后</th></tr></thead>
  <tbody>
    # 每行一条全栈需求
    <tr><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td></tr>
  </tbody>
</table>
```

### Step 3：创建飞书文档

```bash
lark-cli docs +create --content '@file:/tmp/pz_weekly_doc.xml'
```

取返回值中的 `data.document.url` 作为文档链接输出给用户。

## 统计口径

- **数据源**：`ep-proxy` → teamwork-backend `/api/v1/iteration-schedule/list`（`dejiliDepartments=研发四部`）
- **部门映射**：`rdc-open user list --dejili-dept=研发四部` → `department_name_path` 按 `/` 分割取 index `[2]`
- **过滤**：排除 `spentType` 为 5（请假）、6（值班）、8（其他）
- **提效前** = `manualSpentTime`（人工预估工时）
- **提效后** = `spentTime`（AI 提效后工时）
- **全栈需求** = `customTags` 包含 "全栈"
- **二级部门顺序**：客服平台、无线平台、汇金平台