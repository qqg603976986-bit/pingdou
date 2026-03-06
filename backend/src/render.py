# -*- coding: utf-8 -*-
"""图纸绘制模块 — 绘制拼豆网格图纸。"""

from typing import Optional

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def generate_grid_index(row: int, col: int) -> str:
    """生成网格坐标（如 A1, B3, AA10）。"""
    col_letters = ""
    col_num = col
    while col_num >= 0:
        col_letters = chr(ord("A") + (col_num % 26)) + col_letters
        col_num = col_num // 26 - 1
    return f"{col_letters}{row + 1}"


def draw_bead_pattern(
    color_matrix: np.ndarray,
    output_path: Optional[str] = None,
    cell_size: int = 20,
    show_grid: bool = True,
    show_labels: bool = True,
    show_color_codes: bool = True,
) -> Image.Image:
    """根据颜色矩阵绘制拼豆图纸。

    返回 PIL Image 对象。若 output_path 不为 None 则同时保存 PNG。
    """
    rows, cols = color_matrix.shape
    label_margin = 40 if show_labels else 20
    canvas_width = cols * cell_size + label_margin * 2
    canvas_height = rows * cell_size + label_margin * 2

    canvas = Image.new("RGB", (canvas_width, canvas_height), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    try:
        font_small = ImageFont.truetype("arial.ttf", 8)
        font_label = ImageFont.truetype("arial.ttf", 10)
    except Exception:
        try:
            font_small = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 8
            )
            font_label = ImageFont.truetype(
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 10
            )
        except Exception:
            font_small = ImageFont.load_default()
            font_label = ImageFont.load_default()

    for i in range(rows):
        for j in range(cols):
            code, _name, rgb = color_matrix[i, j]
            x1 = j * cell_size + label_margin
            y1 = i * cell_size + label_margin
            x2 = x1 + cell_size
            y2 = y1 + cell_size

            draw.rectangle(
                [x1, y1, x2, y2],
                fill=rgb,
                outline=(128, 128, 128) if show_grid else rgb,
            )

            if show_color_codes and cell_size >= 15:
                bbox = draw.textbbox((0, 0), code, font=font_small)
                text_width = bbox[2] - bbox[0]
                text_height = bbox[3] - bbox[1]
                text_x = x1 + (cell_size - text_width) // 2
                text_y = y1 + (cell_size - text_height) // 2
                luminance = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
                text_color = (0, 0, 0) if luminance > 128 else (255, 255, 255)
                draw.text(
                    (text_x, text_y), code, fill=text_color, font=font_small,
                )

    if show_labels:
        for j in range(cols):
            label = str(j + 1)
            x = j * cell_size + label_margin + cell_size // 2
            y = label_margin - 15
            bbox = draw.textbbox((0, 0), label, font=font_label)
            text_width = bbox[2] - bbox[0]
            draw.text(
                (x - text_width // 2, y), label, fill=(0, 0, 0), font=font_label,
            )

        for i in range(rows):
            label = str(i + 1)
            y = i * cell_size + label_margin + cell_size // 2
            x = label_margin - 25
            bbox = draw.textbbox((0, 0), label, font=font_label)
            text_height = bbox[3] - bbox[1]
            draw.text(
                (x, y - text_height // 2), label, fill=(0, 0, 0), font=font_label,
            )

    if output_path is not None:
        canvas.save(output_path, "PNG")
        print(f"拼豆图纸已保存至: {output_path}")

    return canvas
