---
title: "Pdf Toolkit — PDF 全能处理工具 - merge, split, rotate, watermark, encrypt, decrypt, extract text/tables/images, compress"
sidebar_label: "Pdf Toolkit"
description: "PDF 全能处理工具 - merge, split, rotate, watermark, encrypt, decrypt, extract text/tables/images, compress"
---

{/* This page is auto-generated from the skill's SKILL.md by website/scripts/generate-skill-docs.py. Edit the source SKILL.md, not this page. */}

# Pdf Toolkit

PDF 全能处理工具 - merge, split, rotate, watermark, encrypt, decrypt, extract text/tables/images, compress. Triggers include any mention of PDF, 合并, 拆分, 旋转, 水印, 加密, 提取, 压缩, or when the user works with .pdf files in any way. Also covers scanned PDF OCR hints and PDF generation from text/HTML/markdown.

## Skill metadata

| | |
|---|---|
| Source | Bundled (installed by default) |
| Path | `skills/market/pdf-toolkit` |
| Version | `1.0.0` |
| License | MIT |

## Reference: full SKILL.md

:::info
The following is the complete skill definition that Hermes loads when this skill is triggered. This is what the agent sees as instructions when the skill is active.
:::

# PDF Toolkit — PDF 全能处理

用 Python（pypdf + pdfplumber + reportlab）处理一切 PDF 任务。

## 工具选择表

| 任务 | 库与函数 |
|---|---|
| 合并多个 PDF | `pypdf.PdfWriter` + `append()` |
| 拆分/抽页 | `PdfWriter` + `add_page(pdf.pages[i])` |
| 旋转页面 | `page.rotate(90/180/270)` |
| 加密/设密码 | `writer.encrypt("pwd")` |
| 解密（已知密码） | `PdfReader(f, password="pwd")` |
| 提取文本（含表格） | `pdfplumber.open()` + `page.extract_text()` / `extract_tables()` |
| 提取图片 | `page.images`（pdfplumber） |
| 加水印（文字） | reportlab 生成水印层 + `page.merge_page(wm)` |
| 从文本生成 PDF | reportlab `canvas` 或 `SimpleDocTemplate` |
| 压缩 | `writer.compress_identical_objects()` 或重写降采样 |
| 页数/元数据 | `len(reader.pages)` / `reader.metadata` |

## 标准流程

1. **读**：`from pypdf import PdfReader, PdfWriter`，pdfplumber 用于内容提取
2. **改**：构造 PdfWriter，逐页 add/rotate/merge
3. **写**：`with open(out, "wb") as f: writer.write(f)`——始终输出到新文件，不覆盖原件

## 常用配方

### 合并
```python
from pypdf import PdfWriter
w = PdfWriter()
for p in in_files: w.append(p)
w.write("merged.pdf")
```

### 抽取第 2-5 页
```python
r = PdfReader("in.pdf"); w = PdfWriter()
for i in range(1, 5): w.add_page(r.pages[i])
w.write("part.pdf")
```

### 文字水印（每页斜 45°）
```python
from reportlab.pdfgen import canvas
from io import BytesIO
buf = BytesIO(); c = canvas.Canvas(buf)
c.setFont("Helvetica", 40); c.setFillColorRGB(0.9,0.9,0.9)
c.translate(300, 400); c.rotate(45); c.drawCentredString(0, 0, "CONFIDENTIAL")
c.save(); buf.seek(0)
wm = PdfReader(buf).pages[0]
for page in PdfReader("in.pdf").pages:
    page.merge_page(wm); w.add_page(page)
```

### 提取全部文本（含表格结构）
```python
import pdfplumber
with pdfplumber.open("in.pdf") as pdf:
    for i, page in enumerate(pdf.pages):
        print(f"== Page {i+1}")
        print(page.extract_text() or "")
        for t in page.extract_tables():
            for row in t: print(" | ".join(str(c) if c else "" for c in row))
```

## 注意事项
- **中文 PDF**：提取乱码先试 `pdfplumber`（优于纯 pypdf）；生成中文用 reportlab 需注册字体（`pdfmetrics.registerFont(TTFont('SimHei', 'C:/Windows/Fonts/simhei.ttf'))`）
- **加密 PDF**：先 `reader.is_encrypted` 判断；密码错误会抛 `PdfReadError`
- **扫描件**：纯图片 PDF 提不出文本，提示用户需 OCR（pytesseract + tesseract），不要空跑
- 大文件逐页处理，别一次性 load 全部 pages 到内存
- **安装（本机 WSL，2026-10-31 实测）**：裸 `pip install` 被 PEP 668 拒，默认 PyPI 源还会拖到超时。用 `pip install pdfplumber pypdf --break-system-packages -i https://pypi.tuna.tsinghua.edu.cn/simple --timeout 60`
- **stderr 刷屏 "Could not get FontBBox from font descriptor" 是良性告警**，不影响提取结果，忽略即可
- **坑：terminal 里 pip 装的包，execute_code 沙箱看不见**（独立环境，ModuleNotFoundError）。提取脚本写成 .py 文件，用 terminal `python3 xxx.py` 跑

## 大 PDF（100 页+）调研式消化，不通读

2026-10-31 消化 246 页案例集验证有效的流程：

1. **整本提取带页标记**：跑本技能 `scripts/extract_pdf_text.py <pdf> [out.txt]`，每页前插 `@@@PAGE N@@@` 行
2. **建 page_map**：`re.split(r"@@@PAGE (\d+)@@@", text)` → `{int页码: 内容}` 字典
3. **正则抓目录**：目录行形如 `NO.x 标题 页码` / `第x章 标题`；标题跨行会漏抓，换宽松正则补（如 `NO\.(\d+)\s+([^\n]+)` 再按关键词过滤去重）
4. **按页区间重组章节**：起始页排序后 `"".join(page_map[p] for p in range(s, e))`，整章文本到手
5. **抽样精读**：只读回答问题所需段落——Q&A 体例抽 Q4 效果/Q5 挑战，报告抽结论章
6. **关键词上下文 grep**：要什么字段正则什么字段，如 `[^\n。]{0,60}(?:万元|收费|成都|重庆)[^\n。]{0,60}`，带窗口抓取、去重、拼图
7. 结论写知识库文档，关键数字标页码便于回查
