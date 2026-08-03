#!/usr/bin/env python3
"""
拉取迭代排期数据，按二级部门分组统计，输出结构化 JSON。
用法: python3 gen_weekly.py --iteration-id 597 --output /tmp/weekly.json
"""
import argparse, json, subprocess, sys
from collections import defaultdict

TEAM_URL = "https://qa-teamwork-backend.shizhuang-inc.com/api/v1/iteration-schedule/list"
EXCLUDE_SPENT_TYPES = {5, 6, 8}  # 请假、值班、其他


def run(args, timeout=30):
    """执行命令，用 list 传参避免 shell 转义问题。"""
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        print(f"[ERROR] 命令失败: {' '.join(args)}\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    return result.stdout


def load_schedule(iteration_id):
    """用 ep-proxy 拉取迭代排期数据。"""
    token = run(["cli-auth", "token"]).strip()
    url = f"{TEAM_URL}?iterationId={iteration_id}&pageNum=1&pageSize=999&dejiliDepartments=研发四部"
    raw = run(["ep-proxy", "get", "--token", token, url])
    json_start = raw.index("{")
    data = json.loads(raw[json_start:])
    if data.get("code") != 200:
        print(f"[ERROR] API 返回错误: {data}", file=sys.stderr)
        sys.exit(1)
    return data["data"]["list"]


def load_user_dept_map():
    """用 rdc-open 拉取用户 → 二级部门映射。"""
    raw = run(["rdc-open", "user", "list", "--dejili-dept=研发四部"])
    data = json.loads(raw)
    dev_to_dept = {}
    for u in data["data"]["results"]:
        path = u.get("department_name_path", "")
        parts = path.split("/")
        sec_dept = parts[2] if len(parts) > 2 else "未知"
        dev_to_dept[u["id"]] = sec_dept
    return dev_to_dept


def compute(schedule_items, dev_to_dept):
    """按二级部门分组统计。"""
    dept_stats = defaultdict(lambda: {
        "cnt": 0, "before": 0.0, "after": 0.0,
        "fs_cnt": 0, "fs_before": 0.0, "fs_after": 0.0,
    })
    fullstack_details = []

    for item in schedule_items:
        st = item.get("spentType")
        if st in EXCLUDE_SPENT_TYPES:
            continue

        dev_id = item.get("developerId")
        sec_dept = dev_to_dept.get(dev_id, "未知")
        manual = item.get("manualSpentTime") or 0
        spent = item.get("spentTime", 0) or 0
        is_fs = "全栈" in (item.get("customTags", "") or "")

        dept_stats[sec_dept]["cnt"] += 1
        dept_stats[sec_dept]["before"] += manual
        dept_stats[sec_dept]["after"] += spent
        if is_fs:
            dept_stats[sec_dept]["fs_cnt"] += 1
            dept_stats[sec_dept]["fs_before"] += manual
            dept_stats[sec_dept]["fs_after"] += spent
            fullstack_details.append({
                "dept": sec_dept,
                "dev": item.get("developerName", ""),
                "title": item.get("requirementTitle", ""),
                "before": manual,
                "after": spent,
            })

    # 计算百分比
    departments = []
    total_cnt = total_before = total_after = total_fs = 0
    for name in ["客服平台", "无线平台", "汇金平台"]:
        s = dept_stats[name]
        saved = s["before"] - s["after"]
        eff_pct = round(saved / s["before"] * 100, 1) if s["before"] > 0 else 0
        fs_ratio = round(s["fs_cnt"] / s["cnt"] * 100, 1) if s["cnt"] > 0 else 0
        departments.append({
            "name": name,
            "cnt": s["cnt"],
            "before": round(s["before"], 2),
            "after": round(s["after"], 2),
            "saved": round(saved, 2),
            "eff_pct": eff_pct,
            "fs_cnt": s["fs_cnt"],
            "fs_ratio": fs_ratio,
            "fs_before": round(s["fs_before"], 2),
            "fs_after": round(s["fs_after"], 2),
        })
        total_cnt += s["cnt"]
        total_before += s["before"]
        total_after += s["after"]
        total_fs += s["fs_cnt"]

    total_saved = total_before - total_after
    total_eff = round(total_saved / total_before * 100, 1) if total_before > 0 else 0
    total_fs_ratio = round(total_fs / total_cnt * 100, 1) if total_cnt > 0 else 0

    return {
        "total": {
            "cnt": total_cnt,
            "before": round(total_before, 2),
            "after": round(total_after, 2),
            "saved": round(total_saved, 2),
            "eff_pct": total_eff,
            "fs_cnt": total_fs,
            "fs_ratio": total_fs_ratio,
        },
        "departments": departments,
        "fullstack_details": fullstack_details,
    }


def main():
    parser = argparse.ArgumentParser(description="迭代排期统计")
    parser.add_argument("--iteration-id", type=int, required=True, help="迭代 ID，如 597")
    parser.add_argument("--output", required=True, help="输出 JSON 文件路径")
    args = parser.parse_args()

    print(f"[1/3] 拉取迭代 {args.iteration_id} 排期数据...")
    schedule = load_schedule(args.iteration_id)
    print(f"  获取到 {len(schedule)} 条记录")

    print("[2/3] 拉取人员部门信息...")
    dev_to_dept = load_user_dept_map()
    print(f"  获取到 {len(dev_to_dept)} 人")

    print("[3/3] 计算统计结果...")
    result = compute(schedule, dev_to_dept)
    result["iteration_id"] = args.iteration_id

    with open(args.output, "w") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"  结果已输出到 {args.output}")
    print(f"  总计: {result['total']['cnt']} 条需求, "
          f"提效前 {result['total']['before']} → 提效后 {result['total']['after']}, "
          f"AI节省 {result['total']['saved']} ({result['total']['eff_pct']}%), "
          f"全栈需求 {result['total']['fs_cnt']} 条 ({result['total']['fs_ratio']}%)")


if __name__ == "__main__":
    main()