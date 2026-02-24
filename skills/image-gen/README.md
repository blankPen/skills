# Image Gen Skill

图像生成 Skill，支持文生图、图生图，具备自动检查和修正功能。

## 特性

- 文生图：根据文字描述生成图片
- 图生图：基于参考图片生成新图
- 自动检查：生成后自动检查是否符合要求
- 智能修正：发现问题自动重新生成或微调
- 经验沉淀：将成功的修正经验保存到 tips 目录

## 获取 API Key

访问 https://ismaque.org/register?aff=npk7 注册获取。

## 配置

1. 复制 `config/secrets.example.md` 为 `config/secrets.md`
2. 填入你的 API Key

## 目录结构

```
image-gen/
├── SKILL.md              # Skill 主定义文件
├── README.md             # 说明文档
├── config/
│   └── secrets.example.md # API Key 配置模板
└── tips/
    ├── image-upload.md    # 图片上传方法
    ├── chinese-text.md    # 中文文字处理技巧
    ├── style-guide.md     # 风格指南
    └── troubleshooting.md # 问题排查
```

## 使用示例

```
用户：画一只穿西装的猫
用户：做一张封面，写上"2024年度总结"
用户：这张图里的文字写错了，帮我改成xxx
```
