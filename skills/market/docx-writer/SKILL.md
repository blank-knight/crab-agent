---
name: docx-writer
description: Word 文档生成与编辑 - create, read, edit .docx with python-docx. Headings, paragraphs, tables, images, styles, headers/footers, TOC, find-replace. Triggers include any mention of Word, 文档, 报告, 合同, 通知书, .docx or requests to produce professional formatted documents.
version: 1.0.0
license: MIT
---

# DOCX Writer — Word 文档生成与编辑

用 python-docx 完成 Word 文档的创建、读取、修改全流程。

## 核心对象链

```
Document()  →  doc.add_heading / add_paragraph / add_table / add_picture
             →  doc.sections[0] (页眉页脚页边距)
             →  doc.save(path)
```

## 生成配方

### 快速报告骨架
```python
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()
doc.add_heading("项目周报", level=0)                    # 大标题
doc.add_heading("一、本周进展", level=1)
p = doc.add_paragraph("完成了三件事：")
p.add_run("其中重点").bold = True                       # 行内加粗

# 表格（带表头样式）
t = doc.add_table(rows=1, cols=3); t.style = "Light Grid Accent 1"
for i, h in enumerate(["任务", "负责人", "状态"]):
    t.rows[0].cells[i].text = h
doc.add_picture("chart.png", width=Cm(14))              # 插图

doc.save("周报.docx")
```

### 中文字体统一（宋体正文+黑体标题）
```python
from docx.oxml.ns import qn
style = doc.styles["Normal"]
style.font.name = "Times New Roman"                      # 西文
style.element.rPr.rFonts.set(qn("w:eastAsia"), "宋体")    # 中文
```

### 页眉页脚+页码
```python
sec = doc.sections[0]
sec.header.paragraphs[0].text = "XX公司内部文档"
# 页码需域代码，见下方注意事项
```

## 读取与修改
```python
doc = Document("in.docx")
for p in doc.paragraphs:            # 仅正文（不含表格）
    if "旧公司名" in p.text:
        for r in p.runs:
            if "旧公司名" in r.text: r.text = r.text.replace("旧公司名", "新公司名")
for table in doc.tables:
    for row in table.rows:
        print(" | ".join(c.text for c in row.cells))
doc.save("out.docx")
```

## 零依赖读取（python-docx 装不上时的兜底，2026-11-02 实测）

docx 本质是 zip。系统 python3 无 docx 模块、venv 无 pip、unzip 也缺时，纯 stdlib 也能全文提取：

```python
import re, zipfile
xml = zipfile.ZipFile('doc.docx').read('word/document.xml').decode('utf-8')
for p in re.findall(r'<w:p[ >].*?</w:p>', xml, re.S):
    line = ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p)).strip()
    if line: print(line)
```

- `w:p`=段落，`w:t`=文本 run；表格单元格里的段落同样在 document.xml 中，会被顺带捕获（读内容/提取需求够用）
- 只读不改用这个最快；要改格式/样式仍需 python-docx（run 粒度）
- 已知坑：hermes venv 的 python 有 pip 残留但 `-m pip` 报 No module named pip —— 别折腾装包，直接走 stdlib 路线

## 注意事项
- **页码/目录（TOC）是域**：python-docx 不直接支持，需手动插 XML 域代码（`w:fldSimple` / `w:fldChar`）或让用户在 Word 里按 F9 更新——生成时放占位段落并提示
- **run 粒度**：改文字必须遍历 `p.runs`（Word 会把一句话拆成多个 run，直接替换 `p.text` 会丢格式）
- **插图定位**：`add_picture` 只能加在文末，插中间需操作 `paragraph._p.addnext()` 的 XML 层
- 单元格文本读取用 `cell.text`；合并单元格会重复出现，去重靠 `cell._tc` id
