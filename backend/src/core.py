# -*- coding: utf-8 -*-
"""核心共享模块 — 日志、类型别名、调色板缓存、惰性加载器。"""

import os
import importlib
import logging
from typing import List, Literal, Optional, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# 日志配置：同时输出到控制台和文件
# ---------------------------------------------------------------------------
_LOG_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # 项目根目录
logger = logging.getLogger("pingdou")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _fmt = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    # 文件日志 — 只读文件系统（如 Vercel）下自动跳过
    _log_path = os.path.join(_LOG_DIR, "pingdou.log")
    try:
        _fh = logging.FileHandler(_log_path, encoding="utf-8")
        _fh.setFormatter(_fmt)
        logger.addHandler(_fh)
    except OSError:
        pass
    _sh = logging.StreamHandler()
    _sh.setFormatter(_fmt)
    logger.addHandler(_sh)

# ---------------------------------------------------------------------------
# 类型别名
# ---------------------------------------------------------------------------
PaletteMethod = Literal["lab", "rgb"]
ResizeMode = Literal["fit", "stretch", "pad"]

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------
# 输入图片归一化目标：长边缩放到此像素值，保证 cell_size 计算与输入分辨率无关
DEFAULT_NORMALIZE_LONG_EDGE = 1500

# ---------------------------------------------------------------------------
# 导入调色板
# ---------------------------------------------------------------------------
from .palette import PERLER_BEADS_PALETTE

# ---------------------------------------------------------------------------
# 惰性模块缓存
# ---------------------------------------------------------------------------
_CV2_MODULE = None


def _get_cv2_module():
    """惰性加载 OpenCV。"""
    global _CV2_MODULE
    if _CV2_MODULE is None:
        try:
            _CV2_MODULE = importlib.import_module("cv2")
        except ImportError as exc:
            raise ImportError(
                "缺少 OpenCV 依赖，请先安装: pip install opencv-python"
            ) from exc
    return _CV2_MODULE


# ---------------------------------------------------------------------------
# 调色板缓存
# ---------------------------------------------------------------------------
def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """将 RGB(0-255) 转为 Lab（通过 OpenCV）。"""
    cv2_module = _get_cv2_module()

    arr = np.asarray(rgb, dtype=np.float32)
    if arr.shape[-1] != 3:
        raise ValueError("rgb_to_lab 输入最后一维必须为 3（RGB）")

    arr01 = np.clip(arr, 0, 255) / 255.0

    if arr01.ndim == 1:
        return cv2_module.cvtColor(
            arr01.reshape(1, 1, 3), cv2_module.COLOR_RGB2LAB,
        ).reshape(3)

    if arr01.ndim == 2:
        return cv2_module.cvtColor(
            arr01.reshape(-1, 1, 3), cv2_module.COLOR_RGB2LAB,
        ).reshape(-1, 3)

    return cv2_module.cvtColor(arr01, cv2_module.COLOR_RGB2LAB)


def _build_palette_cache() -> Tuple[List[str], List[str], np.ndarray, np.ndarray]:
    """构建调色板缓存数组。"""
    codes: List[str] = []
    names: List[str] = []
    rgbs: List[Tuple[int, int, int]] = []
    for code, (name, r, g, b) in PERLER_BEADS_PALETTE.items():
        codes.append(code)
        names.append(name)
        rgbs.append((r, g, b))
    palette_rgb = np.array(rgbs, dtype=np.float32)
    palette_lab = rgb_to_lab(palette_rgb)
    return codes, names, palette_rgb, palette_lab


PALETTE_CODES, PALETTE_NAMES, PALETTE_RGB, PALETTE_LAB = _build_palette_cache()
