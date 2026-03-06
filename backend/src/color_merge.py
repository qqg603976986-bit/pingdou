# -*- coding: utf-8 -*-
"""后量化颜色合并模块 — 将已量化结果中 ΔE 接近的颜色合并为占比更大的那个。

与 palette_reduction.py（量化前限定调色板）完全正交，两者可叠加使用。
"""

import numpy as np

from .core import (
    PaletteMethod,
    PALETTE_RGB,
    PALETTE_LAB,
    logger,
)


def merge_similar_colors(
    idx_matrix: np.ndarray,
    threshold: float,
    method: PaletteMethod = "lab",
) -> np.ndarray:
    """将 idx_matrix 中 ΔE < threshold 的相似颜色合并（少→多）。

    Parameters
    ----------
    idx_matrix : np.ndarray, shape (rows, cols), dtype int
        量化后的调色板索引矩阵。
    threshold : float
        Lab ΔE（或 RGB 欧氏距离）阈值，小于此值的颜色对会被合并。
    method : "lab" | "rgb"
        距离计算方式。

    Returns
    -------
    np.ndarray : 合并后的 idx_matrix（同形状）。
    """
    if threshold <= 0:
        return idx_matrix

    # ── 统计唯一索引及计数 ──
    unique_indices, inv, counts = np.unique(
        idx_matrix, return_inverse=True, return_counts=True
    )
    n = len(unique_indices)
    if n <= 1:
        return idx_matrix

    # ── 取对应的颜色坐标 ──
    if method == "lab":
        coords = PALETTE_LAB[unique_indices]  # (n, 3)
    else:
        coords = PALETTE_RGB[unique_indices]  # (n, 3)

    # ── 计算两两距离矩阵（欧氏距离）──
    # diff[i, j] = coords[i] - coords[j]
    diff = coords[:, np.newaxis, :] - coords[np.newaxis, :, :]  # (n, n, 3)
    dist_matrix = np.sqrt(np.sum(diff * diff, axis=2))           # (n, n)

    # ── 提取上三角所有颜色对，按距离升序 ──
    ii, jj = np.triu_indices(n, k=1)
    pair_dists = dist_matrix[ii, jj]
    order = np.argsort(pair_dists)

    # ── 构建重定向表：parent[local_idx] = local_idx (initially) ──
    parent = np.arange(n, dtype=np.int32)
    count_arr = counts.copy()

    def find_root(x: int) -> int:
        """路径压缩的 union-find root 查找。"""
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    merge_count = 0
    for k in order:
        d = pair_dists[k]
        if d >= threshold:
            break

        a, b = int(ii[k]), int(jj[k])
        ra, rb = find_root(a), find_root(b)
        if ra == rb:
            continue  # 已在同一组

        # 少的合并到多的
        if count_arr[ra] >= count_arr[rb]:
            parent[rb] = ra
            count_arr[ra] += count_arr[rb]
        else:
            parent[ra] = rb
            count_arr[rb] += count_arr[ra]
        merge_count += 1

    if merge_count == 0:
        return idx_matrix

    # ── 构建 local→global 的重映射 ──
    remap = np.empty(n, dtype=np.int32)
    for i in range(n):
        remap[i] = unique_indices[find_root(i)]

    # ── 批量替换 ──
    new_flat = remap[inv]
    result = new_flat.reshape(idx_matrix.shape)

    # ── 统计结果 ──
    colors_before = n
    colors_after = len(np.unique(result))
    logger.info(
        "颜色合并: 阈值 %.1f, %d 色 → %d 色 (合并 %d 对)",
        threshold, colors_before, colors_after, merge_count,
    )

    return result
