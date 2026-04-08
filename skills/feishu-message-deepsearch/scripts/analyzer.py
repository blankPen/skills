#!/usr/bin/env python3
"""
Feishu Chat History Analyzer

分析飞书聊天记录，生成汇总报告。
"""

import re
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple


class ChatAnalyzer:
    """聊天记录分析器"""
    
    def __init__(self, cache_data: Dict[str, Any]):
        self.data = cache_data
        self.date = cache_data.get('date', '')
        self.chats = cache_data.get('chats', [])
        self.statistics = cache_data.get('statistics', {})
    
    def analyze(self) -> Dict[str, Any]:
        """执行完整分析"""
        return {
            'statistics': self._analyze_statistics(),
            'categories': self._categorize_chats(),
            'timeline': self._build_timeline(),
            'highlights': self._extract_highlights()
        }
    
    def _analyze_statistics(self) -> Dict[str, Any]:
        """分析统计数据"""
        stats = self.statistics.copy()
        
        # 添加会话类型分布
        type_dist = defaultdict(int)
        for chat in self.chats:
            chat_type = chat.get('chat_type', 'unknown')
            type_dist[chat_type] += 1
        
        stats['chat_type_distribution'] = dict(type_dist)
        
        # 消息活跃时段
        hourly_dist = defaultdict(int)
        for chat in self.chats:
            for msg in chat.get('messages', []):
                create_time = msg.get('create_time', '')
                if create_time and len(create_time) > 16:
                    hour = create_time[11:13]
                    hourly_dist[hour] += 1
        
        stats['hourly_distribution'] = dict(sorted(hourly_dist.items()))
        
        return stats
    
    def _categorize_chats(self) -> Dict[str, List[Dict[str, Any]]]:
        """会话分类"""
        categories = {
            'work': [],      # 工作相关
            'technical': [], # 技术学习
            'daily': [],     # 日常沟通
            'other': []      # 其他
        }
        
        for chat in self.chats:
            category = self._classify_chat(chat)
            categories[category].append({
                'chat_id': chat.get('chat_id'),
                'chat_name': chat.get('chat_name', ''),
                'chat_type': chat.get('chat_type'),
                'message_count': chat.get('message_count', 0),
                'summary': self._summarize_chat(chat)
            })
        
        return categories
    
    def _classify_chat(self, chat: Dict[str, Any]) -> str:
        """分类单个会话"""
        chat_name = chat.get('chat_name', '').lower()
        messages = chat.get('messages', [])
        
        # 合并消息内容用于分析
        content = ' '.join([
            msg.get('content', '') 
            for msg in messages 
            if isinstance(msg.get('content'), str)
        ]).lower()
        
        # 工作相关关键词
        work_keywords = [
            '绩效', 'okr', '排期', '需求', '评审', '会议', '项目',
            '老板', '汇报', '计划', '进度', '截止', '上线', '迭代',
            '测试', '开发', 'bug', '上线', '发布', '部署'
        ]
        
        # 技术学习关键词
        tech_keywords = [
            '代码', 'api', '框架', '开源', 'github', '技术', '分享',
            '学习', 'ai', '算法', '架构', '设计', '实现', '优化',
            '性能', '文档', '接口', '组件', '服务', '部署'
        ]
        
        # 检查关键词
        work_score = sum(1 for kw in work_keywords if kw in content)
        tech_score = sum(1 for kw in tech_keywords if kw in content)
        
        if work_score > tech_score and work_score > 0:
            return 'work'
        elif tech_score > 0:
            return 'technical'
        elif chat.get('chat_type') == 'p2p':
            return 'daily'
        else:
            return 'other'
    
    def _summarize_chat(self, chat: Dict[str, Any]) -> str:
        """生成会话摘要"""
        messages = chat.get('messages', [])
        if not messages:
            return '无消息'
        
        # 提取关键消息（用户发送的长文本）
        key_messages = []
        for msg in messages:
            content = msg.get('content', '')
            sender = msg.get('sender', {})
            
            # 用户发送的长消息（可能是重要内容）
            if isinstance(content, str) and len(content) > 50:
                # 简化内容
                summary = content[:100] + '...' if len(content) > 100 else content
                key_messages.append(summary)
        
        return key_messages[0] if key_messages else f"共{len(messages)}条消息"
    
    def _build_timeline(self) -> List[Dict[str, Any]]:
        """构建时间线"""
        events = []
        
        for chat in self.chats:
            messages = chat.get('messages', [])
            if not messages:
                continue
            
            # 获取会话时间范围
            times = [m.get('create_time', '') for m in messages]
            times = [t for t in times if t]
            
            if times:
                times.sort()
                start_time = times[0][11:16] if len(times[0]) > 16 else ''
                end_time = times[-1][11:16] if len(times[-1]) > 16 else ''
                
                events.append({
                    'time_range': f"{start_time}-{end_time}",
                    'chat_name': chat.get('chat_name', ''),
                    'message_count': len(messages),
                    'summary': self._summarize_chat(chat)
                })
        
        # 按开始时间排序
        events.sort(key=lambda x: x['time_range'])
        
        return events
    
    def _extract_highlights(self) -> List[str]:
        """提取重点事项"""
        highlights = []
        
        for chat in self.chats:
            messages = chat.get('messages', [])
            
            for msg in messages:
                content = msg.get('content', '')
                if not isinstance(content, str):
                    continue
                
                # 提取决策、待办、关键信息
                # 决策：包含"决定"、"确定"、"确认"等
                if any(kw in content for kw in ['决定', '确定', '确认', '同意', '通过']):
                    highlights.append(f"决策：{content[:80]}...")
                
                # 待办：包含"需要"、"待"、"跟进"等
                if any(kw in content for kw in ['需要', '待办', '跟进', '处理', '完成']):
                    highlights.append(f"待办：{content[:80]}...")
        
        # 去重并限制数量
        return list(dict.fromkeys(highlights))[:10]
    
    def generate_report(self) -> str:
        """生成 Markdown 格式的分析报告"""
        analysis = self.analyze()
        stats = analysis['statistics']
        categories = analysis['categories']
        timeline = analysis['timeline']
        highlights = analysis['highlights']
        
        report = []
        
        # 标题
        report.append(f"# 📋 {self.date} 聊天记录分析\n")
        
        # 统计数据
        report.append("## 📊 统计数据\n")
        report.append("| 指标 | 数值 |")
        report.append("|------|------|")
        report.append(f"| 总会话数 | {stats.get('total_chats', 0)} 个 |")
        report.append(f"| 总消息数 | {stats.get('total_messages', 0)} 条 |")
        report.append(f"| 你发送的消息 | {stats.get('user_messages', 0)} 条 |")
        
        time_range = stats.get('time_range', {})
        if time_range.get('start'):
            report.append(f"| 时间跨度 | {time_range.get('start', '')} - {time_range.get('end', '')} |")
        
        report.append("")
        
        # 会话分类
        report.append("## 📋 会话分类\n")
        
        for category, chats in categories.items():
            if not chats:
                continue
            
            category_names = {
                'work': '工作相关',
                'technical': '技术学习',
                'daily': '日常沟通',
                'other': '其他'
            }
            
            report.append(f"### {category_names.get(category, category)}（{len(chats)} 个）\n")
            
            for chat in chats:
                report.append(f"- **{chat['chat_name']}**：{chat['summary']}")
            
            report.append("")
        
        # 时间线
        report.append("## ⏰ 时间线\n")
        report.append("```")
        for event in timeline:
            report.append(f"{event['time_range']}  {event['chat_name']}")
        report.append("```\n")
        
        # 重点事项
        if highlights:
            report.append("## 🎯 今日重点\n")
            for i, h in enumerate(highlights, 1):
                report.append(f"{i}. {h}")
            report.append("")
        
        return '\n'.join(report)


def analyze_and_report(cache_data: Dict[str, Any]) -> str:
    """分析缓存数据并生成报告"""
    analyzer = ChatAnalyzer(cache_data)
    return analyzer.generate_report()


if __name__ == '__main__':
    # 测试
    test_data = {
        'date': '2024-01-01',
        'statistics': {
            'total_chats': 5,
            'total_messages': 100,
            'user_messages': 50,
            'time_range': {'start': '09:30', 'end': '18:00'}
        },
        'chats': [
            {
                'chat_id': 'oc_test',
                'chat_type': 'p2p',
                'chat_name': '测试用户',
                'messages': [
                    {'content': '这是一个测试消息，关于绩效评估的内容', 'create_time': '2024-01-01T10:00:00+08:00'}
                ]
            }
        ]
    }
    
    print(analyze_and_report(test_data))
