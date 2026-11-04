---
name: xlsx-master
description: Deep Excel/xlsx operations for end users - create, read, edit and analyze spreadsheets with openpyxl and pandas. Formulas, styles, charts, pivot-like aggregation, multi-sheet workbooks, batch processing of report files, CSV/xlsx conversion. Use when the user mentions Excel, spreadsheet, 表格, 报表, xlsx, csv, 工作簿 or needs structured tabular data work.
version: 1.0.0
license: MIT
---

# XLSX Master — Excel 深度操作

用 Python（openpyxl + pandas）对 Excel 做一切：从零建表到加工现有报表。

## 何时使用
- 新建/编辑 .xlsx 或 .csv（多 sheet、公式、样式、图表）
- 数据清洗、筛选、合并、去重、透视汇总
- 批量处理报表文件（合并 12 个月报表成一个总表等）
- 从日志/JSON/数据库导出格式化报表

## 环境准备

```python
# qiji 客户端内置 Python，缺包时先装
import subprocess, sys
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'openpyxl', 'pandas', 'xlrd'])
```

## 常用操作速查

### 1. 读取

```python
import pandas as pd

# 读全部 sheet
sheets = pd.read_excel('report.xlsx', sheet_name=None, header=0)

# 指定区域（跳过说明行）
df = pd.read_excel('report.xlsx', sheet_name='销售', skiprows=2, usecols='A:F')
```

### 2. 写出（带样式）

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = '汇总'

headers = ['月份', '销售额', '环比']
ws.append(headers)
for c in ws[1]:
    c.font = Font(bold=True, color='FFFFFF')
    c.fill = PatternFill('solid', start_color='4472C4')
    c.alignment = Alignment(horizontal='center')

rows = [('2026-01', 128000, ''), ('2026-02', 143500, 0.12)]
for r in rows: ws.append(r)

# 公式（环比列）
for i in range(3, 4):
    ws.cell(row=i, column=3).value = f'=IF(B{i-1}=0,"",(B{i}-B{i-1})/B{i-1})'
    ws.cell(row=i, column=3).number_format = '0.0%'

# 自适应列宽
for col in range(1, 4):
    maxlen = max(len(str(ws.cell(row=r, column=col).value or '')) for r in range(1, ws.max_row+1))
    ws.column_dimensions[get_column_letter(col)].width = min(maxlen * 1.8 + 2, 40)

wb.save('汇总表.xlsx')
```

### 3. 数据加工（pandas）

```python
# 多文件合并
import glob
dfs = [pd.read_excel(f).assign(来源=f.stem) for f in glob.glob('data/*.xlsx')]
total = pd.concat(dfs, ignore_index=True)

# 透视汇总（等价数据透视表）
pv = total.pivot_table(index='地区', columns='月份', values='销售额',
                       aggfunc='sum', margins=True, margins_name='总计')

# 条件标记
total['等级'] = total['销售额'].apply(lambda x: 'A' if x >= 100000 else 'B')

pv.to_excel('透视汇总.xlsx')
```

### 4. 图表

```python
from openpyxl.chart import BarChart, Reference

chart = BarChart()
chart.title = '月度销售额'
chart.add_data(Reference(ws, min_col=2, min_row=1, max_row=ws.max_row), titles_from_data=True)
chart.set_categories(Reference(ws, min_col=1, min_row=2, max_row=ws.max_row))
ws.add_chart(chart, 'E2')
wb.save('汇总表.xlsx')
```

### 5. 大文件 / 扭救损坏文件

```python
# 大文件流式读（省内存）
for chunk in pd.read_excel('big.xlsx', chunksize=10000):
    process(chunk)

# xlsx 损坏打不开时: 尝试 xlrd 旧格式或 zipfile 直取 xml
import zipfile
with zipfile.ZipFile('broken.xlsx') as z:
    print(z.namelist())  # 手工检查 xl/worksheets/*.xml
```

## 注意事项
- 保存前关闭 Excel 中打开的同名文件（否则 PermissionError）
- 日期列读出来常是 Timestamp，展示前 `dt.strftime('%Y-%m-%d')`
- 中文乱码导 CSV 用 `encoding='utf-8-sig'`（Excel 才认 BOM）
- 改公式后 openpyxl 不计算值——需要值就同时写数值
