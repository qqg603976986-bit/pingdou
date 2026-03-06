# -*- coding: utf-8 -*-
"""智能调色板缩减模块 — K-Means 聚类限定颜色种类数。"""

from collections import Counter
from typing import Optional

import numpy as np

from .core import (
    PaletteMethod,
    PALETTE_CODES,
    PALETTE_RGB,
    PALETTE_LAB,
    _get_cv2_module,
    rgb_to_lab,
    logger,
)


def select_palette_subset(
    pixels: np.ndarray,
    max_colors: int,
    method: PaletteMethod,
) -> np.ndarray:
    """用 K-Means 聚类从图像提取主色调，映射到拼豆色卡后返回调色板索引子集。

    策略：先用较多的 K-Means 簇覆盖色彩空间，然后按簇大小（占比）
    贪婪地选取不重复的拼豆颜色，直到达到 max_colors 上限。
    """
    cv2_mod = _get_cv2_module()
    flat = pixels.reshape(-1, 3).astype(np.float32)

    # 采样以加速 K-Means
    max_sample = 10000
    if flat.shape[0] > max_sample:
        rng = np.random.default_rng(42)
        sample_idx = rng.choice(flat.shape[0], max_sample, replace=False)
        sample = flat[sample_idx]
    else:
        sample = flat

    # 使用较多簇数，因为多个簇可能映射到同一拼豆色
    n_clusters = min(max_colors * 3, len(sample), 128)
    criteria = (
        cv2_mod.TERM_CRITERIA_EPS + cv2_mod.TERM_CRITERIA_MAX_ITER,
        30, 1.0,
    )
    _, labels, centers = cv2_mod.kmeans(
        sample, n_clusters, None, criteria, 10, cv2_mod.KMEANS_PP_CENTERS,
    )

    # 按簇大小排序，优先保留占比大的颜色
    label_counts = Counter(labels.flatten())
    sorted_center_ids = sorted(
        range(n_clusters),
        key=lambda i: label_counts.get(i, 0),
        reverse=True,
    )

    selected: set = set()
    for ci in sorted_center_ids:
        center = centers[ci]
        if method == "lab":
            center_lab = rgb_to_lab(center.reshape(1, 3))[0]
            diff = PALETTE_LAB - center_lab
        else:
            diff = PALETTE_RGB - center
        dist2 = np.sum(diff * diff, axis=1)
        idx = int(np.argmin(dist2))
        selected.add(idx)
        if len(selected) >= max_colors:
            break

    result = np.array(sorted(selected), dtype=np.int32)
    logger.info("调色板缩减: 全部 %d 色 → 选取 %d 色", len(PALETTE_CODES), len(result))
    return result
