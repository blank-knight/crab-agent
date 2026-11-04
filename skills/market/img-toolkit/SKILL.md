---
name: img-toolkit
description: 图片批量处理工具 - format conversion (jpg/png/webp), compression, resize, crop, watermark, thumbnails, OCR文字识别兜底. Powered by Pillow + RapidOCR. Triggers include any mention of 图片处理, 转格式, 压缩图片, 缩放, 裁剪, 加水印, 批量, OCR, 识别图片文字, 看不清图片, format conversion, compress images, resize, watermark, extract text from images or working with multiple image files.
version: 1.0.0
license: MIT
---

# IMG Toolkit — 图片批量处理

用 Pillow（PIL）完成图片的格式转换、压缩、缩放、裁剪、加水印与批处理。

## 核心对象链

```
Image.open(path)  →  img.convert("RGB") / resize / crop / rotate
                  →  img.save(out, format=, quality=, optimize=)
```

## 常用配方

### 格式转换（含透明通道处理）
```python
from PIL import Image
img = Image.open("in.png")
img.convert("RGB").save("out.jpg", quality=90)      # PNG→JPG（去透明）
Image.open("in.jpg").save("out.webp", quality=85)   # →WebP（更小）
Image.open("in.jpg").save("out.png")                # →PNG
```

### 压缩到目标大小（如 <500KB，二分质量）
```python
import io
from PIL import Image

def compress_to(img, target_kb=500, fmt="JPEG"):
    lo, hi = 10, 95
    while lo < hi:
        mid = (lo + hi) // 2
        buf = io.BytesIO()
        img.save(buf, format=fmt, quality=mid)
        if buf.tell() <= target_kb * 1024: lo = mid + 1
        else: hi = mid
    return buf.getvalue()
```

### 批量缩放（最长边 1280，保持比例）
```python
from pathlib import Path
for f in Path(".").glob("*.jpg"):
    img = Image.open(f)
    img.thumbnail((1280, 1280))                     # 原地等比缩
    img.save(f.with_name(f"thumb_{f.name}"), quality=85)
```

### 文字水印（右下角半透明）
```python
from PIL import ImageDraw, ImageFont
img = Image.open("in.jpg").convert("RGBA")
wm = Image.new("RGBA", img.size, (0,0,0,0))
d = ImageDraw.Draw(wm)
font = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 36)
tw = d.textlength("@我的水印", font=font)
d.text((img.width - tw - 20, img.height - 56), "@我的水印",
       font=font, fill=(255,255,255,128))
out = Image.alpha_composite(img, wm).convert("RGB")
out.save("marked.jpg", quality=90)
```

### 居中裁剪成正方形（头像用）
```python
img = Image.open("in.jpg")
s = min(img.size)
img.crop(((img.width-s)//2, (img.height-s)//2,
          (img.width+s)//2, (img.height+s)//2)).save("square.jpg")
```

## 注意事项
- **CMYK JPEG**：网页显示会变色，先 `img.convert("RGB")`
- **WebP 动图**：`Image.open` 只取第一帧
- **大图批处理**：逐个 open→处理→close（或 with 块），别把几百张同时读进内存
- **exif 方向**：手机照片可能横竖颠倒，`ImageOps.exif_transpose(img)` 先纠正

## OCR 文字识别（RapidOCR 兜底）

需要读出图片里的文字（报告截图、报错照片、聊天记录图）而视觉分析不可用/看不清时，本地 OCR 兜底。

一次性环境（系统 python 没有，用 uv 独立 venv，装一次约 1 分钟）：

```bash
uv venv /tmp/ocr-env --python 3.11
uv pip install --python /tmp/ocr-env/bin/python rapidocr-onnxruntime
```

识别（截图先 2x LANCZOS 放大，精度显著提升；打印 Y 坐标便于还原表格行分组）：

```python
from rapidocr_onnxruntime import RapidOCR
from PIL import Image
engine = RapidOCR()
im = Image.open("in.jpg")
im.resize((im.width*2, im.height*2), Image.LANCZOS).save("/tmp/ocr_2x.jpg", quality=95)
result, _ = engine("/tmp/ocr_2x.jpg")
for box, text, score in result:
    print(round(box[0][1]), "|", text)   # Y坐标 | 文本
```

实战要点（2026-11-02 微信漏扫截图案）：
- 中文正文必乱码（"漏洞"→"漏润/港洞"），**ASCII 标识符（版本号/CVE号/URL/端口/CVSS分）基本可靠**——锚定标识符交叉验证，别指望通读正文
- 版本号/端口号会互相误读：`9.4.43.v20210629` 被读成 `9443.v20210629`、`8080/tcp` 被读成 `88/tcp`——含点号/含 v 的长数字串先按版本号格式校验，再与同图端口号字段交叉核对
- 表格截图按 Y 坐标聚类还原行；同版式行内容高度雷同，往往是同一问题按组件族 jar 重复报告的信号
- OCR 出的 CVE/版本号只是线索，去 NVD/GHSA/Maven Central 复核后才能写进结论
