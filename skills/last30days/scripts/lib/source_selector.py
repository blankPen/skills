"""话题领域分类 + 渠道自动过滤。

根据话题领域自动过滤不合适的渠道，并结合用户偏好（全局排除/领域覆盖）。

优先级（由高到低）：
1. 用户显式 --search（完全绕过本模块）
2. 用户领域级偏好（domain_overrides）
3. 用户全局偏好（global_exclude / global_include）
4. 领域规则（DOMAIN_SOURCE_EXCLUSIONS）
5. planner 的权重排序（在过滤后的集合内）
"""

from __future__ import annotations

import re
from typing import Any

# 话题领域分类关键词（按匹配优先级排列）
_DOMAIN_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("finance", re.compile(
        r"黄金|股票|加密|外汇|期货|理财|走势|美联储|通胀|利率|债券|基金|etf|汇率|货币"
        r"|gold|bitcoin|btc|eth|crypto|forex|nasdaq|sp500|inflation|etf|hedge"
        r"|federal.reserve|interest.rate|bond|stock|equity|commodity|oil.price",
        re.I,
    )),
    ("tech", re.compile(
        r"ai|大模型|llm|代码|编程|开发|芯片|深度学习|机器学习|框架|开源|算法|部署"
        r"|gpt|claude|gemini|coding|python|javascript|docker|kubernetes|github"
        r"|react|vue|svelte|rust|golang|devops|ci.cd|api|sdk|database|cloud",
        re.I,
    )),
    ("entertainment", re.compile(
        r"电影|音乐|明星|综艺|动漫|游戏|艺人|演员|歌手|剧集|综艺|娱乐圈|粉丝"
        r"|movie|film|music|celebrity|anime|gaming|kpop|pop.star|album|concert"
        r"|netflix|disney|marvel|hbo|box.office|award|oscar|grammy",
        re.I,
    )),
    ("health_lifestyle", re.compile(
        r"健身|营养|减肥|护肤|心理|医疗|健康|瑜伽|冥想|睡眠|饮食|养生|美容"
        r"|fitness|nutrition|diet|skincare|mental.health|workout|wellness"
        r"|supplement|vitamin|therapy|anxiety|depression|meditation|yoga",
        re.I,
    )),
    ("politics_news", re.compile(
        r"选举|政策|地缘|战争|外交|政治|政府|制裁|国会|议会|总统|总理"
        r"|election|policy|war|sanctions|geopolitics|congress|parliament"
        r"|white.house|nato|un|united.nations|diplomacy|tariff|treaty",
        re.I,
    )),
    ("sports", re.compile(
        r"世界杯|奥运|nba|联赛|球队|足球|篮球|网球|赛事|冠军|体育|比赛"
        r"|world.cup|olympics|championship|tournament|playoff|super.bowl"
        r"|premier.league|la.liga|nfl|mlb|nhl|tennis|golf|formula.1|f1",
        re.I,
    )),
    ("food_travel", re.compile(
        r"美食|旅游|餐厅|咖啡|景点|食谱|厨房|烹饪|酒店|目的地|签证"
        r"|restaurant|recipe|travel|hotel|destination|cuisine|coffee|cafe"
        r"|airbnb|booking|trip|vacation|foodie|chef|cooking|baking",
        re.I,
    )),
    ("business", re.compile(
        r"创业|融资|产品|品牌|营收|商业|市场|营销|企业|管理|战略|投资|vc"
        r"|startup|funding|saas|marketing|revenue|growth|b2b|ceo|founder"
        r"|acquisition|merger|ipo|valuation|pitch|product.launch",
        re.I,
    )),
    ("science", re.compile(
        r"研究|论文|物理|气候|量子|基因|生物|化学|天文|科学|实验|发现"
        r"|research|paper|physics|climate|genome|biology|chemistry|astronomy"
        r"|neuroscience|quantum|crispr|space|nasa|study|journal|discovery",
        re.I,
    )),
]

# 领域 → 渠道排除规则
DOMAIN_SOURCE_EXCLUSIONS: dict[str, dict[str, set[str]]] = {
    "finance": {
        # 财经不看技术论坛和娱乐短视频
        # bilibili/youtube 的交易员分析、x/reddit 的社区讨论保留
        "exclude": {"hackernews", "github", "tiktok", "instagram"},
    },
    "tech": {
        # 技术话题不看娱乐/生活短视频
        "exclude": {"tiktok", "instagram", "xiaohongshu"},
    },
    "entertainment": {
        # 娱乐不看技术社区
        "exclude": {"hackernews", "github", "polymarket"},
    },
    "health_lifestyle": {
        # 健康/生活不看技术论坛和预测市场
        "exclude": {"hackernews", "github", "polymarket"},
    },
    "politics_news": {
        # 政治新闻不看代码仓库和娱乐短视频
        "exclude": {"github", "tiktok", "instagram"},
    },
    "sports": {
        # 体育不看技术社区
        "exclude": {"hackernews", "github"},
    },
    "food_travel": {
        # 美食旅游不看技术/预测
        "exclude": {"hackernews", "github", "polymarket"},
    },
    "business": {
        # 商业话题各主流渠道都有价值，仅排除纯娱乐短视频
        "exclude": {"tiktok", "instagram"},
    },
    "science": {
        # 科学不看娱乐短视频和预测市场
        "exclude": {"tiktok", "instagram", "polymarket"},
    },
    "general": {
        # 兜底：不排除任何渠道
        "exclude": set(),
    },
}

# 人类可读的领域名称（用于日志展示）
DOMAIN_DISPLAY_NAMES: dict[str, str] = {
    "finance": "财经",
    "tech": "科技",
    "entertainment": "娱乐",
    "health_lifestyle": "健康生活",
    "politics_news": "政治新闻",
    "sports": "体育",
    "food_travel": "美食旅行",
    "business": "商业",
    "science": "科学",
    "general": "通用",
}


def classify_domain(topic: str) -> str:
    """基于正则匹配判断话题领域，返回 9 类之一。

    按优先级顺序检测，返回第一个命中的领域。
    无匹配时返回 'general'。
    """
    text = topic.strip()
    for domain, pattern in _DOMAIN_PATTERNS:
        if pattern.search(text):
            return domain
    return "general"


def auto_select_sources(
    topic: str,
    available: list[str],
    user_prefs: dict[str, Any] | None = None,
) -> tuple[list[str], str]:
    """根据话题领域和用户偏好过滤渠道。

    Args:
        topic: 用户输入的话题
        available: 当前可用渠道列表
        user_prefs: 用户偏好（来自 source_preferences.json）

    Returns:
        (filtered_sources, domain) — filtered_sources 是过滤后的渠道列表，
        domain 是检测到的领域字符串（用于日志和展示）
    """
    domain = classify_domain(topic)
    exclusions: set[str] = DOMAIN_SOURCE_EXCLUSIONS[domain]["exclude"].copy()

    if user_prefs:
        # 应用用户全局排除
        exclusions |= set(user_prefs.get("global_exclude") or [])
        # 应用用户全局包含（从 exclusions 中移除）
        exclusions -= set(user_prefs.get("global_include") or [])
        # 应用领域级别覆盖
        domain_prefs = (user_prefs.get("domain_overrides") or {}).get(domain, {})
        exclusions |= set(domain_prefs.get("exclude") or [])
        exclusions -= set(domain_prefs.get("include") or [])

    filtered = [s for s in available if s not in exclusions]
    # 兜底：过滤后为空则返回全部（避免无源可用）
    return filtered or available, domain
