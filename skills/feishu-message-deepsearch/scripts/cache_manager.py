#!/usr/bin/env python3
"""
Feishu Chat History Cache Manager

管理飞书聊天记录的本地缓存，支持读取、写入、增量更新。
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


class CacheManager:
    """缓存管理器"""
    
    def __init__(self, cache_dir: str = "~/.openclaw/cache/feishu-chat"):
        self.cache_dir = Path(cache_dir).expanduser()
        self.cache_dir.mkdir(parents=True, exist_ok=True)
    
    def get_cache_path(self, date: str) -> Path:
        """获取指定日期的缓存文件路径"""
        return self.cache_dir / f"{date}.json"
    
    def exists(self, date: str) -> bool:
        """检查指定日期的缓存是否存在"""
        return self.get_cache_path(date).exists()
    
    def read(self, date: str) -> Optional[Dict[str, Any]]:
        """读取指定日期的缓存数据"""
        cache_path = self.get_cache_path(date)
        if not cache_path.exists():
            return None
        
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def write(self, date: str, data: Dict[str, Any]) -> None:
        """写入缓存数据"""
        cache_path = self.get_cache_path(date)
        
        # 添加元数据
        data['fetched_at'] = datetime.now().isoformat()
        
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def update(self, date: str, new_messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """增量更新缓存"""
        existing_data = self.read(date)
        
        if existing_data is None:
            # 创建新缓存
            return self._create_new_cache(date, new_messages)
        
        # 合并新消息
        existing_ids = {m['message_id'] for m in existing_data.get('all_messages', [])}
        new_unique = [m for m in new_messages if m['message_id'] not in existing_ids]
        
        if new_unique:
            existing_data['all_messages'].extend(new_unique)
            existing_data['statistics']['total_messages'] += len(new_unique)
            self.write(date, existing_data)
        
        return existing_data
    
    def _create_new_cache(self, date: str, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        """创建新的缓存数据结构"""
        # 按会话分组
        chats = {}
        for msg in messages:
            chat_id = msg.get('chat_id')
            if chat_id not in chats:
                chats[chat_id] = {
                    'chat_id': chat_id,
                    'chat_type': msg.get('chat_type'),
                    'chat_name': msg.get('chat_name', ''),
                    'messages': []
                }
            chats[chat_id]['messages'].append(msg)
        
        # 统计
        user_messages = [m for m in messages if m.get('sender', {}).get('id') == messages[0].get('user_open_id')]
        
        data = {
            'date': date,
            'user_open_id': messages[0].get('user_open_id') if messages else '',
            'statistics': {
                'total_chats': len(chats),
                'total_messages': len(messages),
                'user_messages': len(user_messages),
                'time_range': self._get_time_range(messages)
            },
            'chats': list(chats.values()),
            'all_messages': messages
        }
        
        self.write(date, data)
        return data
    
    def _get_time_range(self, messages: List[Dict[str, Any]]) -> Dict[str, str]:
        """获取消息时间范围"""
        if not messages:
            return {'start': '', 'end': ''}
        
        times = [m.get('create_time', '') for m in messages]
        times = [t for t in times if t]
        
        if not times:
            return {'start': '', 'end': ''}
        
        times.sort()
        
        return {
            'start': times[0][11:16] if len(times[0]) > 16 else '',
            'end': times[-1][11:16] if len(times[-1]) > 16 else ''
        }


def format_messages_for_cache(
    date: str,
    user_open_id: str,
    search_results: List[Dict[str, Any]],
    chat_messages: Dict[str, List[Dict[str, Any]]]
) -> Dict[str, Any]:
    """
    格式化消息数据用于缓存
    
    Args:
        date: 日期字符串 YYYY-MM-DD
        user_open_id: 用户 open_id
        search_results: 搜索结果列表
        chat_messages: 会话消息映射 {chat_id: [messages]}
    
    Returns:
        格式化后的缓存数据
    """
    # 统计
    total_chats = len(chat_messages)
    total_messages = sum(len(msgs) for msgs in chat_messages.values())
    
    # 构建会话列表
    chats = []
    for chat_id, messages in chat_messages.items():
        # 获取会话信息
        chat_info = {
            'chat_id': chat_id,
            'chat_type': messages[0].get('chat_type', 'unknown') if messages else 'unknown',
            'chat_name': messages[0].get('chat_name', '') if messages else '',
            'chat_partner': messages[0].get('chat_partner') if messages else None,
            'message_count': len(messages),
            'messages': messages
        }
        chats.append(chat_info)
    
    # 时间范围
    all_times = []
    for messages in chat_messages.values():
        for msg in messages:
            create_time = msg.get('create_time', '')
            if create_time:
                all_times.append(create_time)
    
    all_times.sort()
    time_range = {
        'start': all_times[0][11:16] if all_times else '',
        'end': all_times[-1][11:16] if all_times else ''
    }
    
    return {
        'date': date,
        'user_open_id': user_open_id,
        'statistics': {
            'total_chats': total_chats,
            'total_messages': total_messages,
            'user_messages': len(search_results),
            'time_range': time_range
        },
        'chats': chats
    }


if __name__ == '__main__':
    # 测试
    manager = CacheManager()
    print(f"Cache directory: {manager.cache_dir}")
