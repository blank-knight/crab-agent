#!/usr/bin/env python3
"""整本 PDF → 带页标记纯文本，供后续 page_map/目录正则/关键词 grep 流程使用。

用法: python3 extract_pdf_text.py <pdf路径> [输出.txt]
不指定输出则写 stdout；每页前插一行 @@@PAGE N@@@。
stderr 末行输出 [stats] 页数/字符数；pdfplumber 的 FontBBox 告警为良性，可忽略。
"""
import sys

import pdfplumber


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 1
    src = sys.argv[1]
    fh = open(sys.argv[2], "w", encoding="utf-8") if len(sys.argv) > 2 else sys.stdout
    n = chars = 0
    with pdfplumber.open(src) as pdf:
        n = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            chars += len(text)
            fh.write(f"@@@PAGE {i + 1}@@@\n{text}\n")
    if fh is not sys.stdout:
        fh.close()
    print(f"[stats] {src}: {n} pages, {chars} chars extracted", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
