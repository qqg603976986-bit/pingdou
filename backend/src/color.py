# -*- coding: utf-8 -*-
"""颜色匹配与量化模块 — 最近色查找、批量匹配、抖动量化。"""

from typing import Optional, Tuple

import numpy as np

from .core import (
    PaletteMethod,
    PALETTE_CODES,
    PALETTE_NAMES,
    PALETTE_RGB,
    PALETTE_LAB,
    rgb_to_lab,
)


def find_closest_bead_color(
    pixel_rgb: Tuple[int, int, int],
    method: PaletteMethod = "lab",
) -> Tuple[str, str, Tuple[int, int, int]]:
    """查找与单个像素最接近的拼豆颜色。"""
    idx = find_nearest_index(np.array(pixel_rgb, dtype=np.float32), method)
    rgb_arr = PALETTE_RGB[idx]
    rgb: Tuple[int, int, int] = (int(rgb_arr[0]), int(rgb_arr[1]), int(rgb_arr[2]))
    return PALETTE_CODES[idx], PALETTE_NAMES[idx], rgb


def find_nearest_index(
    pixel_rgb: np.ndarray,
    method: PaletteMethod,
    sub_indices: Optional[np.ndarray] = None,
) -> int:
    """查找单个像素的最近色卡索引。sub_indices 限定可用的调色板子集。"""
    p_rgb = PALETTE_RGB[sub_indices] if sub_indices is not None else PALETTE_RGB
    if method == "rgb":
        diff = p_rgb - pixel_rgb
    else:
        p_lab = PALETTE_LAB[sub_indices] if sub_indices is not None else PALETTE_LAB
        lab = rgb_to_lab(pixel_rgb.reshape(1, 3))[0]
        diff = p_lab - lab
    dist2 = np.sum(diff * diff, axis=1)
    local_idx = int(np.argmin(dist2))
    if sub_indices is not None:
        return int(sub_indices[local_idx])
    return local_idx


def find_nearest_indices_batch(
    pixels_rgb: np.ndarray,
    method: PaletteMethod,
    chunk_size: int = 50000,
    sub_indices: Optional[np.ndarray] = None,
) -> np.ndarray:
    """批量寻找最近色号索引，返回 shape=(N,) 的 int 索引数组。"""
    p_rgb = PALETTE_RGB[sub_indices] if sub_indices is not None else PALETTE_RGB
    p_lab = PALETTE_LAB[sub_indices] if sub_indices is not None else PALETTE_LAB
    n = pixels_rgb.shape[0]
    result = np.empty(n, dtype=np.int32)

    for start in range(0, n, chunk_size):
        end = min(start + chunk_size, n)
        chunk = pixels_rgb[start:end]
        if method == "rgb":
            diff = chunk[:, None, :] - p_rgb[None, :, :]
        else:
            chunk_lab = rgb_to_lab(chunk)
            diff = chunk_lab[:, None, :] - p_lab[None, :, :]
        dist2 = np.sum(diff * diff, axis=2)
        local_indices = np.argmin(dist2, axis=1).astype(np.int32)
        if sub_indices is not None:
            result[start:end] = sub_indices[local_indices]
        else:
            result[start:end] = local_indices
    return result


def quantize_without_dither(
    pixels: np.ndarray,
    method: PaletteMethod,
    sub_indices: Optional[np.ndarray] = None,
) -> np.ndarray:
    """直接量化（无抖动）。"""
    h, w, _ = pixels.shape
    flat = pixels.reshape(-1, 3).astype(np.float32)
    indices = find_nearest_indices_batch(flat, method=method, sub_indices=sub_indices)
    return indices.reshape(h, w)


def quantize_with_floyd_steinberg(
    pixels: np.ndarray,
    method: PaletteMethod,
    sub_indices: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Floyd-Steinberg 抖动（在 RGB 空间扩散误差）。"""
    h, w, _ = pixels.shape
    work = pixels.astype(np.float32).copy()
    indices = np.empty((h, w), dtype=np.int32)

    for y in range(h):
        for x in range(w):
            old_pixel = np.clip(work[y, x], 0, 255)
            idx = find_nearest_index(old_pixel, method=method, sub_indices=sub_indices)
            new_pixel = PALETTE_RGB[idx]
            indices[y, x] = idx
            err = old_pixel - new_pixel
            work[y, x] = new_pixel

            if x + 1 < w:
                work[y, x + 1] += err * (7 / 16)
            if y + 1 < h:
                if x > 0:
                    work[y + 1, x - 1] += err * (3 / 16)
                work[y + 1, x] += err * (5 / 16)
                if x + 1 < w:
                    work[y + 1, x + 1] += err * (1 / 16)

    return indices
