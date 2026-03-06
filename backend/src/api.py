# -*- coding: utf-8 -*-
"""API / 编排层 — 对外暴露的高阶接口。

外部调用方（app.py、run.py CLI）应只导入此模块。
"""

import os
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
from PIL import Image

from .core import (
    PaletteMethod,
    ResizeMode,
    DEFAULT_NORMALIZE_LONG_EDGE,
    PALETTE_CODES,
    PALETTE_NAMES,
    PALETTE_RGB,
    logger,
)
from .color import (
    quantize_without_dither,
    quantize_with_floyd_steinberg,
)
from .palette_reduction import select_palette_subset
from .color_merge import merge_similar_colors
from .image_processing import normalize_image, resize_to_grid
from .render import draw_bead_pattern
from .render_svg import render_svg
from .stats import build_stats_table, save_color_statistics


# ------------------------------------------------------------------
# 异常分层
# ------------------------------------------------------------------


class PingdouError(Exception):
    """项目基础异常类型。"""


class ParameterValidationError(PingdouError):
    """参数错误 / 输入不合法。"""


class DependencyMissingError(PingdouError):
    """缺少可选依赖（如 opencv）。"""


class ProcessingRuntimeError(PingdouError):
    """运行时处理失败（非参数类错误）。"""


# ------------------------------------------------------------------
# 参数对象
# ------------------------------------------------------------------


@dataclass(frozen=True)
class PipelineOptions:
    """转换流程参数（量化、缩放、背景、增强等）。"""

    quantization_method: PaletteMethod = "lab"
    dithering: bool = False
    resize_mode: ResizeMode = "fit"
    max_colors: Optional[int] = None
    merge_threshold: float = 0.0
    grayscale: bool = False


@dataclass(frozen=True)
class RenderOptions:
    """图纸渲染参数。"""

    cell_size: Optional[int] = None
    show_grid: bool = True
    show_labels: bool = True
    show_color_codes: bool = True
    round_beads: bool = False


@dataclass(frozen=True)
class ConvertRequest:
    """对外统一请求对象（文件版/内存版共用）。"""

    image_path: str
    rows: Optional[int] = None
    cols: Optional[int] = None
    output_dir: Optional[str] = None
    pipeline: PipelineOptions = field(default_factory=PipelineOptions)
    render: RenderOptions = field(default_factory=RenderOptions)


# ------------------------------------------------------------------
# 参数校验
# ------------------------------------------------------------------


def validate_params(request: ConvertRequest) -> None:
    """集中校验参数，所有入口共用。"""
    if not os.path.exists(request.image_path):
        raise ParameterValidationError(f"图片文件不存在: {request.image_path}")
    if request.pipeline.quantization_method not in ("lab", "rgb"):
        raise ParameterValidationError("quantization_method 仅支持 'lab' 或 'rgb'")
    if request.pipeline.resize_mode not in ("fit", "stretch", "pad"):
        raise ParameterValidationError("resize_mode 仅支持 'fit'、'stretch'、'pad'")
    if request.pipeline.max_colors is not None and request.pipeline.max_colors < 1:
        raise ParameterValidationError(
            f"max_colors 必须 ≥ 1，当前: {request.pipeline.max_colors}"
        )


# ------------------------------------------------------------------
# 网格 / 格子尺寸推算
# ------------------------------------------------------------------


def resolve_grid_size_by_aspect(
    image_path: str,
    rows: Optional[int],
    cols: Optional[int],
) -> Tuple[int, int]:
    """rows / cols 必须二选一，另一边按原图比例自动计算。"""
    if (rows is None and cols is None) or (rows is not None and cols is not None):
        raise ParameterValidationError("rows 和 cols 必须二选一：只能填写其中一个")

    try:
        with Image.open(image_path) as img:
            width, height = img.size
    except FileNotFoundError:
        raise ParameterValidationError(f"图片文件不存在: {image_path}")
    except Exception as exc:
        raise ParameterValidationError(f"无法读取图片尺寸: {exc}")

    if width <= 0 or height <= 0:
        raise ParameterValidationError(f"图片尺寸非法: {width}x{height}")

    if rows is not None:
        if rows <= 0:
            raise ParameterValidationError(f"rows 必须为正整数，当前: {rows}")
        return rows, max(1, round(rows * width / height))

    if cols is not None:
        if cols <= 0:
            raise ParameterValidationError(f"cols 必须为正整数，当前: {cols}")
        return max(1, round(cols * height / width)), cols

    raise ParameterValidationError("网格尺寸计算失败")


def resolve_cell_size(
    rows: int,
    cols: int,
    cell_size: Optional[int] = None,
    show_color_codes: bool = False,
    normalized_long_edge: int = DEFAULT_NORMALIZE_LONG_EDGE,
) -> int:
    """基于归一化分辨率自动计算图纸像素格大小。"""
    if cell_size is not None:
        if cell_size <= 0:
            raise ParameterValidationError(f"cell_size 必须为正整数，当前: {cell_size}")
        return cell_size

    if cols >= rows:
        norm_w = normalized_long_edge
        norm_h = int(round(normalized_long_edge * rows / cols))
    else:
        norm_h = normalized_long_edge
        norm_w = int(round(normalized_long_edge * cols / rows))

    px_per_bead = ((norm_w / cols) + (norm_h / rows)) / 2
    auto_cell_size = int(round(px_per_bead))
    min_size = 15 if show_color_codes else 8
    return max(min_size, min(40, auto_cell_size))


# ------------------------------------------------------------------
# 核心转换流程
# ------------------------------------------------------------------


def image_to_pixel_art(
    image_path: str,
    rows: int,
    cols: int,
    pipeline: PipelineOptions,
) -> Tuple[np.ndarray, Dict[str, int]]:
    """读取图片并量化到拼豆色卡，返回颜色矩阵与统计。"""
    try:
        with Image.open(image_path) as opened:
            image_format = opened.format
            img = opened.copy()
    except FileNotFoundError:
        raise ParameterValidationError(f"图片文件不存在: {image_path}")
    except Exception as exc:
        raise ParameterValidationError(f"无法打开图片文件: {exc}")

    if image_format not in ["JPEG", "PNG", "BMP", "JPG"]:
        raise ParameterValidationError(
            f"不支持的图片格式: {image_format}，仅支持 JPG/PNG/BMP 格式"
        )

    if img.mode != "RGB":
        img = img.convert("RGB")

    img = normalize_image(img)

    processed = resize_to_grid(
        img,
        rows=rows,
        cols=cols,
        resize_mode=pipeline.resize_mode,
    )
    pixels = np.array(processed, dtype=np.uint8)

    sub_indices = None
    if pipeline.max_colors is not None and 0 < pipeline.max_colors < len(PALETTE_CODES):
        sub_indices = select_palette_subset(
            pixels,
            pipeline.max_colors,
            pipeline.quantization_method,
        )

    if pipeline.dithering:
        idx_matrix = quantize_with_floyd_steinberg(
            pixels,
            method=pipeline.quantization_method,
            sub_indices=sub_indices,
        )
    else:
        idx_matrix = quantize_without_dither(
            pixels,
            method=pipeline.quantization_method,
            sub_indices=sub_indices,
        )

    # ── 后量化颜色合并 ──
    if pipeline.merge_threshold > 0:
        idx_matrix = merge_similar_colors(
            idx_matrix,
            threshold=pipeline.merge_threshold,
            method=pipeline.quantization_method,
        )

    result_matrix = np.empty((rows, cols), dtype=object)
    color_counter: Counter[str] = Counter()

    for i in range(rows):
        for j in range(cols):
            idx = int(idx_matrix[i, j])
            code = PALETTE_CODES[idx]
            name = PALETTE_NAMES[idx]
            rgb_arr = PALETTE_RGB[idx]
            r, g, b = int(rgb_arr[0]), int(rgb_arr[1]), int(rgb_arr[2])

            if pipeline.grayscale:
                # ITU-R BT.601 perceptual grayscale
                gray = int(round(0.299 * r + 0.587 * g + 0.114 * b))
                rgb: Tuple[int, int, int] = (gray, gray, gray)
            else:
                rgb: Tuple[int, int, int] = (r, g, b)

            result_matrix[i, j] = (code, name, rgb)
            color_counter[code] += 1

    return result_matrix, dict(color_counter)


# ------------------------------------------------------------------
# 对外高阶接口
# ------------------------------------------------------------------


def generate_in_memory(
    request: ConvertRequest,
) -> Tuple[Image.Image, Dict[str, int], List[List[str]]]:
    """图片转拼豆图纸（纯内存，不写磁盘）。返回位图版本。"""
    t0 = time.perf_counter()
    try:
        validate_params(request)

        rows, cols = resolve_grid_size_by_aspect(
            request.image_path,
            request.rows,
            request.cols,
        )
        if rows > 500 or cols > 500:
            raise ParameterValidationError(
                f"网格尺寸过大，最大支持 500x500，当前: {rows}x{cols}"
            )

        cell_size = resolve_cell_size(
            rows=rows,
            cols=cols,
            cell_size=request.render.cell_size,
            show_color_codes=request.render.show_color_codes,
        )

        color_matrix, color_stats = image_to_pixel_art(
            image_path=request.image_path,
            rows=rows,
            cols=cols,
            pipeline=request.pipeline,
        )

        canvas = draw_bead_pattern(
            color_matrix=color_matrix,
            output_path=None,
            cell_size=cell_size,
            show_grid=request.render.show_grid,
            show_labels=request.render.show_labels,
            show_color_codes=request.render.show_color_codes,
        )

        table = build_stats_table(color_stats)

        elapsed = time.perf_counter() - t0
        total_beads = sum(color_stats.values())
        logger.info(
            "内存生成完成 | 图片=%s | 网格=%dx%d | cell=%dpx | "
            "量化=%s | 抖动=%s | "
            "最大色数=%s | 圆形珠子=%s | "
            "总豆数=%d | 颜色数=%d | 耗时=%.2fs",
            os.path.basename(request.image_path),
            rows,
            cols,
            cell_size,
            request.pipeline.quantization_method,
            request.pipeline.dithering,
            request.pipeline.max_colors or "全部",
            request.render.round_beads,
            total_beads,
            len(color_stats),
            elapsed,
        )

        return canvas, color_stats, table
    except PingdouError:
        raise
    except ImportError as exc:
        raise DependencyMissingError(str(exc)) from exc
    except Exception as exc:
        raise ProcessingRuntimeError(str(exc)) from exc


def generate_svg_in_memory(
    request: ConvertRequest,
) -> Tuple[str, Dict[str, int], List[List[str]]]:
    """图片转拼豆图纸（SVG 矢量图，纯内存）。

    返回 (svg_string, color_stats, table_data)。
    SVG 中色号标注始终包含，前端通过 CSS 类切换显隐。
    """
    t0 = time.perf_counter()
    try:
        validate_params(request)

        rows, cols = resolve_grid_size_by_aspect(
            request.image_path,
            request.rows,
            request.cols,
        )
        if rows > 500 or cols > 500:
            raise ParameterValidationError(
                f"网格尺寸过大，最大支持 500x500，当前: {rows}x{cols}"
            )

        cell_size = resolve_cell_size(
            rows=rows,
            cols=cols,
            cell_size=request.render.cell_size,
            show_color_codes=request.render.show_color_codes,
        )

        color_matrix, color_stats = image_to_pixel_art(
            image_path=request.image_path,
            rows=rows,
            cols=cols,
            pipeline=request.pipeline,
        )

        svg_str = render_svg(
            color_matrix=color_matrix,
            cell_size=cell_size,
            show_grid=request.render.show_grid,
            show_labels=request.render.show_labels,
            round_beads=request.render.round_beads,
        )

        table = build_stats_table(color_stats, grayscale=request.pipeline.grayscale)

        elapsed = time.perf_counter() - t0
        total_beads = sum(color_stats.values())
        logger.info(
            "SVG 生成完成 | 图片=%s | 网格=%dx%d | cell=%dpx | "
            "量化=%s | 抖动=%s | 灰度=%s | "
            "最大色数=%s | 圆形珠子=%s | "
            "总豆数=%d | 颜色数=%d | 耗时=%.2fs",
            os.path.basename(request.image_path),
            rows,
            cols,
            cell_size,
            request.pipeline.quantization_method,
            request.pipeline.dithering,
            request.pipeline.grayscale,
            request.pipeline.max_colors or "全部",
            request.render.round_beads,
            total_beads,
            len(color_stats),
            elapsed,
        )

        return svg_str, color_stats, table
    except PingdouError:
        raise
    except ImportError as exc:
        raise DependencyMissingError(str(exc)) from exc
    except Exception as exc:
        raise ProcessingRuntimeError(str(exc)) from exc


def convert_image_to_bead_pattern(request: ConvertRequest) -> Tuple[str, str]:
    """图片转拼豆图纸主流程（写文件版）。返回 (图纸文件路径, 统计文件路径)。"""
    t0 = time.perf_counter()
    try:
        validate_params(request)

        rows, cols = resolve_grid_size_by_aspect(
            request.image_path,
            request.rows,
            request.cols,
        )
        if rows > 500 or cols > 500:
            raise ParameterValidationError(
                f"网格尺寸过大，最大支持 500x500，当前: {rows}x{cols}"
            )

        cell_size = resolve_cell_size(
            rows=rows,
            cols=cols,
            cell_size=request.render.cell_size,
            show_color_codes=request.render.show_color_codes,
        )

        output_dir = request.output_dir
        if output_dir is None:
            output_dir = os.path.dirname(os.path.abspath(request.image_path))
        os.makedirs(output_dir, exist_ok=True)

        base_name = os.path.splitext(os.path.basename(request.image_path))[0]
        pattern_output_path = os.path.join(output_dir, f"{base_name}_bead_pattern.png")
        stats_output_path = os.path.join(output_dir, f"{base_name}_color_stats.csv")

        color_matrix, color_stats = image_to_pixel_art(
            image_path=request.image_path,
            rows=rows,
            cols=cols,
            pipeline=request.pipeline,
        )

        draw_bead_pattern(
            color_matrix=color_matrix,
            output_path=pattern_output_path,
            cell_size=cell_size,
            show_grid=request.render.show_grid,
            show_labels=request.render.show_labels,
            show_color_codes=request.render.show_color_codes,
        )
        save_color_statistics(color_stats=color_stats, output_path=stats_output_path)

        elapsed = time.perf_counter() - t0
        total_beads = sum(color_stats.values())
        logger.info(
            "文件生成完成 | 图片=%s | 网格=%dx%d | cell=%dpx | "
            "量化=%s | 抖动=%s | "
            "最大色数=%s | 圆形珠子=%s | "
            "总豆数=%d | 颜色数=%d | 耗时=%.2fs | "
            "图纸=%s | 统计=%s",
            os.path.basename(request.image_path),
            rows,
            cols,
            cell_size,
            request.pipeline.quantization_method,
            request.pipeline.dithering,
            request.pipeline.max_colors or "全部",
            request.render.round_beads,
            total_beads,
            len(color_stats),
            elapsed,
            pattern_output_path,
            stats_output_path,
        )

        return pattern_output_path, stats_output_path
    except PingdouError:
        raise
    except ImportError as exc:
        raise DependencyMissingError(str(exc)) from exc
    except Exception as exc:
        raise ProcessingRuntimeError(str(exc)) from exc
