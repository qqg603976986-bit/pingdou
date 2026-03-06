# -*- coding: utf-8 -*-
"""通用图像处理模块 — 归一化、缩放到网格、平滑。"""

import numpy as np
from PIL import Image

from .core import (
    ResizeMode,
    DEFAULT_NORMALIZE_LONG_EDGE,
    _get_cv2_module,
)


def normalize_image(
    img: Image.Image,
    max_long_edge: int = DEFAULT_NORMALIZE_LONG_EDGE,
) -> Image.Image:
    """将图片长边缩放到 *max_long_edge*（等比例），保证后续处理与输入分辨率无关。"""
    w, h = img.size
    long_edge = max(w, h)
    if long_edge == max_long_edge:
        return img
    scale = max_long_edge / long_edge
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    return img.resize((new_w, new_h), Image.Resampling.LANCZOS)


def resize_to_grid(
    img: Image.Image, rows: int, cols: int, resize_mode: ResizeMode
) -> Image.Image:
    """将图片处理到目标网格尺寸。"""
    target_ratio = cols / rows
    src_w, src_h = img.size
    src_ratio = src_w / src_h

    if resize_mode == "stretch":
        return img.resize((cols, rows), Image.Resampling.LANCZOS)

    if resize_mode == "fit":
        # 居中裁剪以保持构图并填满目标比例
        if src_ratio > target_ratio:
            new_w = int(round(src_h * target_ratio))
            left = (src_w - new_w) // 2
            box = (left, 0, left + new_w, src_h)
        else:
            new_h = int(round(src_w / target_ratio))
            top = (src_h - new_h) // 2
            box = (0, top, src_w, top + new_h)
        return img.crop(box).resize((cols, rows), Image.Resampling.LANCZOS)

    if resize_mode == "pad":
        # 保持完整内容，空白填充
        scale = min(cols / src_w, rows / src_h)
        new_w = max(1, int(round(src_w * scale)))
        new_h = max(1, int(round(src_h * scale)))
        resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (cols, rows), (255, 255, 255))
        left = (cols - new_w) // 2
        top = (rows - new_h) // 2
        canvas.paste(resized, (left, top))
        return canvas

    raise ValueError(f"不支持的 resize_mode: {resize_mode}")
