# -*- coding: utf-8 -*-
"""统计模块 — 颜色使用统计与导出。"""

import csv
import sys
import os
from typing import Dict, List

from .palette import PERLER_BEADS_PALETTE


def build_stats_table(color_stats: Dict[str, int], grayscale: bool = False) -> List[List[str]]:
    """将颜色统计转为内存表格（二维字符串列表），不写磁盘。

    每行: [色号, 颜色名称, 数量, 占比(%), RGB, 十六进制]
    """
    total_beads = sum(color_stats.values())
    sorted_stats = sorted(
        color_stats.items(), key=lambda item: item[1], reverse=True
    )
    table: List[List[str]] = []
    for code, count in sorted_stats:
        name, r, g, b = PERLER_BEADS_PALETTE[code]
        if grayscale:
            gray = int(round(0.299 * r + 0.587 * g + 0.114 * b))
            r, g, b = gray, gray, gray
        percentage = round((count / total_beads) * 100, 2)
        rgb_str = f"({r},{g},{b})"
        hex_color = f"#{r:02X}{g:02X}{b:02X}"
        table.append([code, name, str(count), str(percentage), rgb_str, hex_color])
    return table


def save_color_statistics(color_stats: Dict[str, int], output_path: str) -> None:
    """保存颜色使用统计为 CSV 文件。"""
    total_beads = sum(color_stats.values())
    sorted_stats = sorted(
        color_stats.items(), key=lambda item: item[1], reverse=True
    )

    with open(output_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["色号", "颜色名称", "数量", "占比(%)", "RGB", "十六进制"])
        for code, count in sorted_stats:
            name, r, g, b = PERLER_BEADS_PALETTE[code]
            percentage = round((count / total_beads) * 100, 2)
            rgb_str = f"({r},{g},{b})"
            hex_color = f"#{r:02X}{g:02X}{b:02X}"
            writer.writerow([code, name, count, percentage, rgb_str, hex_color])

    print(f"颜色统计已保存至: {output_path}")
