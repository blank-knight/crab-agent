---
name: pptx-maker
description: PPT 演示文稿生成 - create and edit .pptx with python-pptx. Layouts, text frames, bullet lists, tables, charts, images, master slides, speaker notes. Triggers include any mention of PPT, 幻灯片, 演示, 汇报, deck, slides, .pptx or requests to produce presentations.
version: 1.0.0
license: MIT
---

# PPTX Maker — PPT 演示文稿生成

用 python-pptx 从零生成或修改 .pptx 演示文稿。

## 核心对象链

```
Presentation()  →  prs.slide_layouts[n]（版式）
                →  slide = prs.slides.add_slide(layout)
                →  slide.shapes（文本框/图/表）
                →  prs.save(path)
```

## 版式速查（默认模板）
| 索引 | 版式 | 用途 |
|---|---|---|
| 0 | Title Slide | 封面 |
| 1 | Title and Content | 常规内容页 |
| 5 | Title Only | 自由排版（自加文本框） |
| 6 | Blank | 纯画布 |

## 生成配方

### 标准汇报页（标题+要点列表+备注）
```python
from pptx import Presentation
from pptx.util import Cm, Pt

prs = Presentation()
prs.slide_width, prs.slide_height = Cm(33.87), Cm(19.05)   # 16:9

# 封面
s = prs.slides.add_slide(prs.slide_layouts[0])
s.shapes.title.text = "AI 产品发布会"
s.placeholders[1].text = "2026 Q4 · 奇计科技"

# 要点页
s2 = prs.slides.add_slide(prs.slide_layouts[1])
s2.shapes.title.text = "三大核心优势"
tf = s2.placeholders[1].text_frame
tf.text = "开箱即用，零配置"                                  # 第一个要点
tf.add_paragraph().text = "多端同步"                          # 后续要点
tf.add_paragraph().text = "按量计费不浪费"
s2.notes_slide.notes_text_frame.text = "这一页强调易用性，停顿2秒"  # 演讲备注
prs.save("demo.pptx")
```

### 自由文本框（精确定位）
```python
from pptx.enum.text import PP_ALIGN
tb = s.shapes.add_textbox(Cm(2), Cm(8), Cm(20), Cm(5))
tf = tb.text_frame; tf.word_wrap = True
p = tf.paragraphs[0]; p.text = "重点结论"; p.font.size = Pt(40)
p.alignment = PP_ALIGN.CENTER
```

### 表格与图片
```python
tbl = s.shapes.add_table(4, 3, Cm(2), Cm(4), Cm(28), Cm(8)).table
tbl.cell(0,0).text = "指标"
s.shapes.add_picture("bar.png", Cm(4), Cm(6), width=Cm(24))
```

## 修改现有 PPT
```python
prs = Presentation("in.pptx")
for slide in prs.slides:
    for shape in slide.shapes:
        if shape.has_text_frame and "旧数据" in shape.text_frame.text:
            # 逐 run 替换保格式（同 docx 逻辑）
            for p in shape.text_frame.paragraphs:
                for r in p.runs:
                    r.text = r.text.replace("旧数据", "新数据")
```

## 注意事项
- **默认模板是 4:3**：宽屏先设 slide_width/height（见配方）
- **字体**：`font.name = "微软雅黑"` 只影响拉丁字符，中文需再设 `font._rPr` 的 ea 属性，或接受默认
- 图表用 `add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, ...)`，数据从 `chart_data` 对象喂
- 改动必须逐 run，整段赋值会丢字号/颜色
