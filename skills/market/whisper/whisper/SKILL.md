---
name: whisper
description: 语音转文字（Whisper 本地模型）- 语音识别、录音/播客/视频转录、会议纪要、音频翻译成英文。支持 99 种语言，六个模型档位 tiny→large。提到 语音转文字, 转录, 听写, 会议记录, 字幕, whisper, asr 或需要处理音频文件时使用。
version: 1.1.0
license: MIT
dependencies: [openai-whisper]
---

# Whisper — 语音转文字（本地模型）

OpenAI 开源的多语言语音识别模型，本地跑（无需 API key）。

## 什么时候用

- 录音/播客/视频 → 文字稿
- 会议纪要自动整理
- 音频翻译成英文
- 生成字幕（带时间轴）
- 多语言音频、带噪声音频

**不要用 Whisper 的场景**（提示用户换方案）：
- 要说话人分离 → AssemblyAI / Deepgram
- 实时流式识别 → Deepgram

## 快速上手

### 安装

```bash
# Python 3.8-3.11
pip install -U openai-whisper
# 需要 ffmpeg（Windows 下 app 已带；缺了先装）
```

### 基本转录

```python
import whisper

model = whisper.load_model("base")           # 档位见下表
result = model.transcribe("audio.mp3")

print(result["text"])                        # 全文
for seg in result["segments"]:               # 带时间轴
    print(f"[{seg['start']:.1f}s-{seg['end']:.1f}s] {seg['text']}")
```

## 模型档位

| 模型 | 参数量 | 仅英文 | 多语言 | 速度 | 显存 |
|------|--------|--------|--------|------|------|
| tiny | 39M | ✓ | ✓ | ~32x | ~1 GB |
| base | 74M | ✓ | ✓ | ~16x | ~1 GB |
| small | 244M | ✓ | ✓ | ~6x | ~2 GB |
| medium | 769M | ✓ | ✓ | ~2x | ~5 GB |
| large | 1550M | ✗ | ✓ | 1x | ~10 GB |
| turbo | 809M | ✗ | ✓ | ~8x | ~6 GB |

选型：**中文语音日常用 `small` 起步**（base 中文错字多）；要快用 `turbo`；机器弱用 `base`。CPU 也能跑，慢而已。

## 常用参数

```python
result = model.transcribe(
    "audio.mp3",
    language="zh",            # 指定语言（跳过语言检测，更快更准）
    task="transcribe",        # transcribe=转原文 / translate=译成英文
    initial_prompt="以下是普通话会议录音。",  # 引导中文输出用简体
    fp16=False,               # CPU 上必须关
)
```

⚠️ 中文常见坑：不指定 `language="zh"` 时可能被识别成粤语/繁体；加 `initial_prompt` 用简体中文引导输出简体。

## 长音频处理

Whisper 默认按 30 秒窗口切片，长音频自动处理。超大文件（>1h）建议：

```python
# 分段转录再拼接（多进程示例略）；或先用 ffmpeg 切成 30min 段
# ffmpeg -i long.mp3 -f segment -segment_time 1800 -c copy part_%03d.mp3
```

## 输出格式速查

- `result["text"]` — 全文
- `result["segments"]` — `[{start, end, text}]` 时间轴段落
- `result["language"]` — 检测到的语言
- 转 SRT 字幕：把 segments 的秒数转 `HH:MM:SS,mmm` 格式即可

## 交付规范

- 转录结果存成 .txt/.srt 交付，给绝对路径
- 报告使用的模型档位 + 音频时长 + 耗时
- 中文结果抽听 2-3 处核对（模型幻觉在静音段常见）
