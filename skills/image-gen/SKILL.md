---

## name: image-gen
description: 使用 npx image-gen 命令生成图片。支持文字生图、图生图、批量生成等多种模式。

# Image Gen

使用 npx image-gen 命令生成图片。

## 功能

- 文字生图：根据提示词生成图片
- 图生图：使用参考图片生成相似风格的新图片
- 批量生成：一次生成多张图片
- 自定义尺寸和模型

## 使用方法

### 基本命令

```bash
npx image-gen "你的图片描述"
```

### 常用参数


| 参数          | 简写  | 说明            | 默认值                        |
| ----------- | --- | ------------- | -------------------------- |
| --model     | -m  | 模型名称          | doubao-seedream-4-5-251128 |
| --size      | -s  | 图片尺寸          | 2K                         |
| --count     | -c  | 生成数量          | 1                          |
| --image     | -i  | 参考图片 URL（图生图） | -                          |
| --watermark | -w  | 添加水印          | false                      |
| --output    | -o  | 输出目录          | ./output                   |
| --format    | -f  | 输出格式          | json                       |
| --verbose   | -v  | 详细输出          | false                      |


### 示例

**文字生图：**

```bash
npx image-gen "一只可爱的橙色小猫坐在窗台上"
```

**指定尺寸：**

```bash
npx image-gen "赛博朋克城市" --size 1024x1024
```

**批量生成 4 张：**

```bash
npx image-gen "日落海滩" --count 4
```

**图生图：**

```bash
npx image-gen "变成水彩画风格" --image https://example.com/photo.jpg
```

**指定输出目录：**

```bash
npx image-gen "宇航员" --output ~/Pictures/ai-art
```

**保存到 workspace：**

```bash
npx image-gen "星空" --output ~/.openclaw/workspace/tmp
```

## 注意事项

- API Key 已在环境变量中配置（需要 source ~/.zshrc）
- 默认输出格式为 json，包含图片 URL 等信息
- 生成完成后图片会自动保存到指定目录

