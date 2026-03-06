# -*- coding: utf-8 -*-
"""SVG 矢量图纸渲染模块 — 生成拼豆网格 SVG。"""

from typing import Optional
from xml.sax.saxutils import escape

import numpy as np


def _rgb_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02X}{g:02X}{b:02X}"


def _text_color(r: int, g: int, b: int) -> str:
    """根据背景亮度决定文字颜色（黑/白）。"""
    luminance = 0.299 * r + 0.587 * g + 0.114 * b
    return "#000" if luminance > 128 else "#FFF"


def render_svg(
    color_matrix: np.ndarray,
    cell_size: int = 20,
    show_grid: bool = True,
    show_labels: bool = True,
    round_beads: bool = False,
) -> str:
    """将颜色矩阵渲染为 SVG 字符串。

    色号标注始终包含在 SVG 中，通过 CSS class "color-label" 控制显隐，
    前端可通过添加/移除样式实时切换，无需重新请求后端。

    Parameters
    ----------
    color_matrix : np.ndarray
        形状 (rows, cols) 的 object 数组，每个元素为 (code, name, (r,g,b))。
    cell_size : int
        每个格子的像素大小（SVG 用户坐标单位）。
    show_grid : bool
        是否显示网格线。
    show_labels : bool
        是否显示行列标签。
    round_beads : bool
        True 时用圆形渲染珠子，False 时用方形。

    Returns
    -------
    str
        完整的 SVG XML 字符串。
    """
    rows, cols = color_matrix.shape
    label_margin = 32 if show_labels else 0
    grid_w = cols * cell_size
    grid_h = rows * cell_size
    svg_w = grid_w + label_margin * 2
    svg_h = grid_h + label_margin * 2

    # 根据 cell_size 自适应字号
    code_font_size = max(6, min(12, cell_size * 0.45))
    label_font_size = max(8, min(12, cell_size * 0.5))

    parts: list[str] = []

    # SVG 头部
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{svg_w}" height="{svg_h}" '
        f'viewBox="0 0 {svg_w} {svg_h}" '
        f'style="font-family:Consolas,Monaco,monospace">'
    )

    # 内嵌样式 — 色号默认显示，可通过前端切换 .hide-labels 类来隐藏
    parts.append(
        "<defs><style>"
        ".color-label{font-size:%.1fpx;text-anchor:middle;dominant-baseline:central;pointer-events:none}"
        ".axis-label{font-size:%.1fpx;fill:#333;text-anchor:middle;dominant-baseline:central}"
        ".grid-line{stroke:#888;stroke-width:0.5;shape-rendering:crispEdges}"
        ".hide-labels .color-label{display:none}"
        ".hide-grid .grid-line{display:none}"
        "</style></defs>" % (code_font_size, label_font_size)
    )

    # 白色背景
    parts.append(f'<rect width="{svg_w}" height="{svg_h}" fill="#FFF"/>')

    # 圆形珠子时，在网格区域画浅灰底色让珠子间隙可见
    if round_beads:
        parts.append(
            f'<rect x="{label_margin}" y="{label_margin}" '
            f'width="{grid_w}" height="{grid_h}" fill="#E8E8E8" rx="2"/>'
        )

    # 开始主分组（前端可在此元素上切换 class）
    parts.append(f'<g id="bead-grid">')

    # ── 色块 ──
    bead_radius = cell_size * 0.42 if round_beads else 0  # 圆形珠子半径，留小间隙

    for i in range(rows):
        for j in range(cols):
            code, _name, rgb = color_matrix[i, j]
            r, g, b = rgb
            x = j * cell_size + label_margin
            y = i * cell_size + label_margin
            hex_color = _rgb_hex(r, g, b)

            if round_beads:
                cx = x + cell_size / 2
                cy = y + cell_size / 2
                parts.append(
                    f'<circle cx="{cx}" cy="{cy}" r="{bead_radius:.1f}" fill="{hex_color}" data-hex="{hex_color}"/>'
                )
            else:
                parts.append(
                    f'<rect x="{x}" y="{y}" width="{cell_size}" height="{cell_size}" fill="{hex_color}" data-hex="{hex_color}"/>'
                )

            # 色号标注（始终包含，通过 CSS 控制显隐）
            tx = x + cell_size / 2
            ty = y + cell_size / 2
            tc = _text_color(r, g, b)
            escaped_code = escape(str(code))
            parts.append(
                f'<text class="color-label" x="{tx}" y="{ty}" fill="{tc}">{escaped_code}</text>'
            )

    # ── 网格线 ──
    if show_grid:
        # 水平线
        for i in range(rows + 1):
            y = i * cell_size + label_margin
            parts.append(
                f'<line class="grid-line" x1="{label_margin}" y1="{y}" '
                f'x2="{label_margin + grid_w}" y2="{y}"/>'
            )
        # 垂直线
        for j in range(cols + 1):
            x = j * cell_size + label_margin
            parts.append(
                f'<line class="grid-line" x1="{x}" y1="{label_margin}" '
                f'x2="{x}" y2="{label_margin + grid_h}"/>'
            )

    # ── 行列标签 ──
    if show_labels:
        for j in range(cols):
            x = j * cell_size + label_margin + cell_size / 2
            # 顶部列号
            parts.append(
                f'<text class="axis-label" x="{x}" y="{label_margin * 0.5}">{j + 1}</text>'
            )
        for i in range(rows):
            y = i * cell_size + label_margin + cell_size / 2
            # 左侧行号
            parts.append(
                f'<text class="axis-label" x="{label_margin * 0.5}" y="{y}">{i + 1}</text>'
            )

    parts.append("</g>")
    parts.append("</svg>")

    return "\n".join(parts)
