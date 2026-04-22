"""Bilibili 搜索和字幕提取，基于 yt-dlp（bilisearch: 前缀）。

主后端使用 yt-dlp 的 bilisearch: 协议，零配置，自动处理 WBI 签名。
备选后端直接调用 Bilibili 公开 JSON API（无需登录）。

参考 youtube_yt.py 的结构实现相同接口。
"""

import json
import os
import re
import signal
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional

# 深度配置：每次搜索视频数量
DEPTH_CONFIG = {
    "quick": 5,
    "default": 10,
    "deep": 30,
}

from . import log
from .relevance import token_overlap_relevance as _compute_relevance


def _log(msg: str):
    log.source_log("Bilibili", msg, tty_only=False)


def is_ytdlp_installed() -> bool:
    """检查 yt-dlp 是否已安装。"""
    return shutil.which("yt-dlp") is not None


def _clean_vtt(vtt_text: str) -> str:
    """将 SRT/VTT 字幕格式转为纯文本（无时间戳），用于 AI 分析（节省 token）。

    去重相邻重复行，返回空格分隔的连续文本。
    """
    # 移除 VTT 头部
    text = re.sub(r'^WEBVTT.*?\n\n', '', vtt_text, flags=re.DOTALL)
    # 移除 HTML 标签
    text = re.sub(r'<[^>]+>', '', text)

    lines = text.strip().split('\n')
    result: list[str] = []
    seen: set[str] = set()

    for line in lines:
        line = line.strip()
        if not line:
            continue
        # 时间戳行：跳过
        if re.match(r'\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->', line):
            continue
        # 序号行（纯数字）：跳过
        if re.match(r'^\d+$', line):
            continue
        if line not in seen:
            seen.add(line)
            result.append(line)

    return ' '.join(result)


def _format_subtitle_with_timestamps(vtt_text: str) -> str:
    """将 SRT/VTT 字幕格式转为带时间戳的纯文本，用于保存到磁盘（便于人工阅读）。

    输出格式：
        [HH:MM:SS] 字幕内容
        [HH:MM:SS] 字幕内容
        ...
    """
    # 移除 VTT 头部
    text = re.sub(r'^WEBVTT.*?\n\n', '', vtt_text, flags=re.DOTALL)
    # 移除 HTML 标签
    text = re.sub(r'<[^>]+>', '', text)

    lines = text.strip().split('\n')
    result: list[str] = []
    current_time: str | None = None
    current_texts: list[str] = []
    seen: set[str] = set()

    def _flush() -> None:
        if current_time and current_texts:
            content = ' '.join(current_texts).strip()
            if content and content not in seen:
                seen.add(content)
                result.append(f'[{current_time}] {content}')

    for line in lines:
        line = line.strip()
        if not line:
            _flush()
            current_time = None
            current_texts = []
            continue
        # 时间戳行：00:00:05,000 --> 00:00:07,500（SRT）或 00:00:05.000 --> ...（VTT）
        ts_match = re.match(r'(\d{2}:\d{2}:\d{2})[,.](\d{3})\s*-->', line)
        if ts_match:
            _flush()
            current_time = ts_match.group(1)
            current_texts = []
            continue
        # 序号行（纯数字）
        if re.match(r'^\d+$', line):
            continue
        current_texts.append(line)

    _flush()
    return '\n'.join(result)


def extract_transcript_highlights(transcript: str, topic: str, limit: int = 15) -> list[str]:
    """从字幕中提取关键片段。

    过滤口头禅，按关键词相关性和数字/专有名词评分，返回 top highlights。
    """
    if not transcript:
        return []

    sentences = re.split(r'(?<=[。！？.!?])\s*', transcript)

    # 无标点字幕（自动字幕常见）：按约 20 词分段
    if len(sentences) <= 1 and len(transcript.split()) > 50:
        words = transcript.split()
        sentences = [' '.join(words[i:i+20]) for i in range(0, len(words), 20)]

    topic_words = [w.lower() for w in topic.lower().split() if len(w) > 1]

    candidates: list[tuple[int, str]] = []
    for sent in sentences:
        sent = sent.strip()
        words = sent.split()
        if len(words) < 5 or len(words) > 80:
            continue

        score = 0
        if re.search(r'\d', sent):
            score += 2
        if re.search(r'[A-Z\u4e00-\u9fff]', sent):
            score += 1
        sent_lower = sent.lower()
        if any(w in sent_lower for w in topic_words):
            score += 2

        candidates.append((score, sent))

    candidates.sort(key=lambda x: -x[0])
    return [sent for _, sent in candidates[:limit]]


def _extract_bvid(video: dict) -> str:
    """从 yt-dlp 输出或 API 响应中提取 BV 号。"""
    bvid = video.get("id") or video.get("bvid") or video.get("video_id") or ""
    # yt-dlp 有时返回带 BV 前缀，有时不带
    if bvid and not bvid.startswith("BV"):
        bvid = f"BV{bvid}"
    return bvid


def search_bilibili(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
) -> Dict[str, Any]:
    """通过 yt-dlp bilisearch: 搜索 Bilibili 视频。

    Args:
        topic: 搜索主题
        from_date: 起始日期 YYYY-MM-DD
        to_date: 结束日期 YYYY-MM-DD
        depth: 'quick' | 'default' | 'deep'

    Returns:
        含 'items' 列表的字典。
    """
    if not is_ytdlp_installed():
        return {"items": [], "error": "yt-dlp not installed"}

    count = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    _log(f"搜索 Bilibili '{topic}'（起始 {from_date}，数量={count}）")

    cmd = [
        "yt-dlp",
        "--ignore-config",
        "--no-cookies-from-browser",
        f"bilisearch{count}:{topic}",
        "--dump-json",
        "--no-warnings",
        "--no-download",
    ]

    preexec = os.setsid if hasattr(os, 'setsid') else None

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            preexec_fn=preexec,
        )
        try:
            stdout, stderr = proc.communicate(timeout=90)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except (ProcessLookupError, PermissionError, OSError):
                proc.kill()
            proc.wait(timeout=5)
            _log("Bilibili 搜索超时（90s）")
            return {"items": [], "error": "Search timed out"}
    except FileNotFoundError:
        return {"items": [], "error": "yt-dlp not found"}

    if not (stdout or "").strip():
        # 检查 stderr 中是否有 HTTP 错误（如 412 需要 cookie）
        if stderr and ("412" in stderr or "Precondition" in stderr or "403" in stderr):
            _log(f"yt-dlp 被 Bilibili 拦截（需要 cookie），将降级到 API")
        else:
            _log("Bilibili 搜索返回 0 结果")
        return {"items": []}

    items: list[dict] = []
    for line in stdout.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            video = json.loads(line)
        except json.JSONDecodeError:
            continue

        bvid = _extract_bvid(video)
        if not bvid:
            continue

        upload_date = video.get("upload_date", "")
        date_str = None
        if upload_date and len(upload_date) == 8:
            date_str = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:8]}"
        elif video.get("timestamp"):
            ts = video["timestamp"]
            try:
                import datetime
                date_str = datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
            except (ValueError, OSError):
                pass

        view_count = video.get("view_count") or 0
        like_count = video.get("like_count") or 0
        comment_count = video.get("comment_count") or 0
        danmaku_count = video.get("danmaku_count") or 0

        description = str(video.get("description") or "")[:500]
        title = video.get("title") or ""
        channel = video.get("uploader") or video.get("channel") or ""

        items.append({
            "video_id": bvid,
            "title": title,
            "url": f"https://www.bilibili.com/video/{bvid}",
            "channel_name": channel,
            "date": date_str,
            "engagement": {
                "views": view_count,
                "likes": like_count,
                "danmaku": danmaku_count,
                "comments": comment_count,
            },
            "duration": video.get("duration"),
            "relevance": _compute_relevance(topic, f"{title} {description}"),
            "why_relevant": f"Bilibili: {title[:60]}",
            "description": description,
        })

    # 软日期过滤：优先近期内容，不够则全部保留
    recent = [i for i in items if i["date"] and i["date"] >= from_date]
    if len(recent) >= 3:
        items = recent
        _log(f"找到 {len(items)} 个视频（在日期范围内）")
    else:
        _log(f"找到 {len(items)} 个视频（{len(recent)} 在范围内，保留全部）")

    # 按播放量降序排列
    items.sort(key=lambda x: x["engagement"]["views"], reverse=True)
    return {"items": items}


def search_bilibili_api(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
) -> Dict[str, Any]:
    """通过 Bilibili 公开 JSON API 搜索视频（yt-dlp 不可用时的降级方案）。

    无需登录，使用随机 buvid3 cookie + Referer header。

    Args:
        topic: 搜索主题
        from_date: 起始日期 YYYY-MM-DD
        to_date: 结束日期 YYYY-MM-DD
        depth: 'quick' | 'default' | 'deep'

    Returns:
        含 'items' 列表的字典。
    """
    count = DEPTH_CONFIG.get(depth, DEPTH_CONFIG["default"])
    _log(f"通过 Bilibili API 搜索 '{topic}'（数量={count}）")

    # 随机 buvid3 以绕过基本的反爬
    buvid3 = str(uuid.uuid4()).replace("-", "") + "infoc"

    params = urllib.parse.urlencode({
        "keyword": topic,
        "search_type": "video",
        "page": 1,
        "page_size": count,
    })
    url = f"https://api.bilibili.com/x/web-interface/search/type?{params}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com/",
        "Cookie": f"buvid3={buvid3}",
    }

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError) as exc:
        _log(f"Bilibili API 请求失败: {exc}")
        return {"items": [], "error": str(exc)}

    if data.get("code") != 0:
        _log(f"Bilibili API 错误码 {data.get('code')}: {data.get('message')}")
        return {"items": [], "error": data.get("message")}

    result_data = data.get("data") or {}
    raw_videos = result_data.get("result") or []

    items: list[dict] = []
    for video in raw_videos:
        bvid = video.get("bvid") or ""
        if not bvid:
            # 尝试从 arcurl 或 aid 构造
            aid = video.get("aid") or video.get("id")
            if aid:
                bvid = f"av{aid}"
            else:
                continue

        title = re.sub(r'<[^>]+>', '', video.get("title") or "").strip()
        description = re.sub(r'<[^>]+>', '', video.get("description") or "")[:500]
        author = video.get("author") or video.get("uploader") or ""

        # 日期：pubdate 是 Unix 时间戳
        pubdate = video.get("pubdate") or 0
        date_str = None
        if pubdate:
            try:
                import datetime
                date_str = datetime.datetime.utcfromtimestamp(pubdate).strftime("%Y-%m-%d")
            except (ValueError, OSError):
                pass

        play = int(video.get("play") or 0)
        like = int(video.get("like") or 0)
        danmaku = int(video.get("video_review") or 0)
        review = int(video.get("review") or 0)

        items.append({
            "video_id": bvid,
            "title": title,
            "url": f"https://www.bilibili.com/video/{bvid}",
            "channel_name": author,
            "date": date_str,
            "engagement": {
                "views": play,
                "likes": like,
                "danmaku": danmaku,
                "comments": review,
            },
            "duration": video.get("duration"),
            "relevance": _compute_relevance(topic, f"{title} {description}"),
            "why_relevant": f"Bilibili: {title[:60]}",
            "description": description,
        })

    # 软日期过滤
    recent = [i for i in items if i["date"] and i["date"] >= from_date]
    if len(recent) >= 3:
        items = recent
    items.sort(key=lambda x: x["engagement"]["views"], reverse=True)

    _log(f"Bilibili API 返回 {len(items)} 个视频")
    return {"items": items}


def _fetch_transcript_ytdlp(bvid: str, temp_dir: str) -> Optional[str]:
    """使用 yt-dlp 下载 Bilibili 视频字幕。

    优先 AI 生成字幕（中文内容常见）。

    Args:
        bvid: BV 号
        temp_dir: 临时目录

    Returns:
        VTT 格式字幕文本，或 None。
    """
    url = f"https://www.bilibili.com/video/{bvid}"
    cmd = [
        "yt-dlp",
        "--ignore-config",
        "--cookies-from-browser", "chrome",
        "--no-playlist",
        "--write-auto-subs",
        "--write-subs",
        "--sub-lang", "ai-zh,zh-Hans,zh,zh-CN,ai-en,en",
        "--sub-format", "srt/vtt/best",
        "--skip-download",
        "--no-warnings",
        "-o", f"{temp_dir}/%(id)s",
        url,
    ]

    preexec = os.setsid if hasattr(os, 'setsid') else None

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            preexec_fn=preexec,
        )
        try:
            proc.communicate(timeout=45)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except (ProcessLookupError, PermissionError, OSError):
                proc.kill()
            proc.wait(timeout=5)
            return None
    except FileNotFoundError:
        return None

    # 寻找下载的字幕文件
    tmp_path = Path(temp_dir)
    # 提取不带 BV 前缀的 ID（yt-dlp 输出可能有变化）
    bare_id = bvid.replace("BV", "") if bvid.startswith("BV") else bvid

    # 按优先级尝试不同的语言后缀（同时支持 srt 和 vtt）
    patterns = [
        f"{bvid}.ai-zh.srt",
        f"{bvid}.zh-Hans.srt",
        f"{bvid}.zh.srt",
        f"{bvid}.zh-CN.srt",
        f"{bvid}.ai-en.srt",
        f"{bvid}.en.srt",
        f"{bvid}.zh-Hans.vtt",
        f"{bvid}.zh.vtt",
        f"{bvid}.zh-CN.vtt",
        f"{bvid}.en.vtt",
        f"{bare_id}.ai-zh.srt",
        f"{bare_id}.zh-Hans.srt",
        f"{bare_id}.zh.srt",
        f"{bare_id}.zh-CN.srt",
        f"{bare_id}.ai-en.srt",
        f"{bare_id}.en.srt",
        f"{bare_id}.zh-Hans.vtt",
        f"{bare_id}.zh.vtt",
        f"{bare_id}.zh-CN.vtt",
        f"{bare_id}.en.vtt",
    ]
    for pat in patterns:
        p = tmp_path / pat
        if p.exists():
            try:
                return p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                return None

    # 通配符兜底：先 srt 再 vtt
    for glob_pat in ("*.srt", "*.vtt"):
        for p in tmp_path.glob(glob_pat):
            try:
                return p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                pass

    return None


def fetch_transcript(bvid: str, temp_dir: str) -> tuple[Optional[str], Optional[str]]:
    """获取 Bilibili 视频字幕，返回两种格式。

    Args:
        bvid: BV 号
        temp_dir: 临时目录

    Returns:
        (plain_text, formatted_text) 元组。
        plain_text: 纯文本（无时间戳），用于 AI 分析。
        formatted_text: 带时间戳格式，用于保存到磁盘。
        任意一个均可为 None（无字幕时返回 (None, None)）。
    """
    if not is_ytdlp_installed():
        return None, None

    raw_vtt = _fetch_transcript_ytdlp(bvid, temp_dir)
    if not raw_vtt:
        return None, None

    plain = _clean_vtt(raw_vtt)
    formatted = _format_subtitle_with_timestamps(raw_vtt)
    return (plain if plain else None), (formatted if formatted else None)


def fetch_transcripts_parallel(
    bvids: List[str],
    max_workers: int = 3,
) -> Dict[str, tuple[Optional[str], Optional[str]]]:
    """并行获取多个视频字幕。

    Args:
        bvids: BV 号列表
        max_workers: 最大并发数（Bilibili 限速较严，默认 3）

    Returns:
        {bvid: (plain_text, formatted_text)} 字典
    """
    if not bvids:
        return {}

    _log(f"并行获取 {len(bvids)} 个视频的字幕")

    results: dict[str, tuple[Optional[str], Optional[str]]] = {}
    with tempfile.TemporaryDirectory() as temp_dir:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(fetch_transcript, bvid, temp_dir): bvid
                for bvid in bvids
            }
            for future in as_completed(futures):
                bvid = futures[future]
                try:
                    results[bvid] = future.result()
                except Exception as exc:
                    _log(f"字幕获取错误 {bvid}: {type(exc).__name__}: {exc}")
                    results[bvid] = (None, None)

    got = sum(1 for v in results.values() if v[0])
    _log(f"成功获取 {got}/{len(bvids)} 个视频的字幕")
    return results


def search_and_transcribe(
    topic: str,
    from_date: str,
    to_date: str,
    depth: str = "default",
) -> Dict[str, Any]:
    """Bilibili 完整搜索流程：搜索视频 + 获取字幕。

    主后端：yt-dlp bilisearch:
    备选后端：Bilibili 公开 API

    Args:
        topic: 搜索主题
        from_date: 起始日期 YYYY-MM-DD
        to_date: 结束日期 YYYY-MM-DD
        depth: 'quick' | 'default' | 'deep'

    Returns:
        含 'items' 列表的字典，每个 item 包含 transcript_snippet 字段。
    """
    # 步骤 1：搜索视频
    result = {"items": []}
    if is_ytdlp_installed():
        result = search_bilibili(topic, from_date, to_date, depth)

    # yt-dlp 失败或无结果时，降级到 API
    if not result.get("items"):
        _log("yt-dlp 搜索无结果，降级到 Bilibili API")
        result = search_bilibili_api(topic, from_date, to_date, depth)

    items = result.get("items", [])
    if not items:
        return result

    # 步骤 2：并发获取所有视频字幕
    transcripts: dict[str, tuple[Optional[str], Optional[str]]] = {}
    if is_ytdlp_installed():
        candidate_ids = [item["video_id"] for item in items]
        _log(f"尝试获取 {len(candidate_ids)} 个视频的字幕")
        transcripts = fetch_transcripts_parallel(candidate_ids)
    else:
        _log("yt-dlp 未安装，跳过字幕获取")

    # 步骤 3：附加字幕和 highlights
    for item in items:
        bvid = item["video_id"]
        plain, formatted = transcripts.get(bvid, (None, None))
        item["transcript_snippet"] = plain or ""        # 纯文本，供 AI 分析
        item["transcript_formatted"] = formatted or ""  # 带时间戳，供磁盘保存
        item["transcript_highlights"] = extract_transcript_highlights(
            plain or "", topic,
        )

    return {"items": items}


def parse_bilibili_response(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """解析 Bilibili 搜索结果为标准化格式。

    Returns:
        标准化的 item 字典列表。
    """
    return result.get("items", [])
