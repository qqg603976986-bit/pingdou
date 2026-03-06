# -*- coding: utf-8 -*-
# pyright: reportPrivateUsage=false, reportAny=false
"""像素风格化模块：基于 Canny 边缘 + HLS 自适应深色描边。"""

import colorsys
from typing import Protocol, cast

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from .core import _get_cv2_module


class _Cv2Like(Protocol):
    """OpenCV 最小接口协议（用于静态类型检查）。"""

    COLOR_RGB2GRAY: int

    def cvtColor(self, src: NDArray[np.uint8], code: int) -> NDArray[np.uint8]: ...

    def GaussianBlur(
        self, src: NDArray[np.uint8], ksize: tuple[int, int], sigmaX: float
    ) -> NDArray[np.uint8]: ...

    def Canny(
        self, image: NDArray[np.uint8], threshold1: int, threshold2: int
    ) -> NDArray[np.uint8]: ...

    def dilate(
        self, src: NDArray[np.uint8], kernel: NDArray[np.uint8], iterations: int = 1
    ) -> NDArray[np.uint8]: ...


def apply_pixel_style(img: Image.Image) -> Image.Image:
    """应用像素风格化描边效果并返回新图像。

    处理流程：
    1) PIL Image -> NumPy RGB；
    2) 灰度 + 5x5 GaussianBlur 降噪；
    3) Canny 边缘检测并做 3x3 膨胀；
    4) 仅在边缘像素上执行 HLS 调整（压低亮度、略增饱和度）；
    5) 非边缘像素保持不变。

    Args:
        img: 输入图像（任意模式均可，内部会转为 RGB）。

    Returns:
        处理后的 RGB 模式 PIL Image。
    """
    # 内部常量：按需求固定，不暴露给外部接口。
    _CANNY_LOW = 50
    _CANNY_HIGH = 150
    _BLUR_KSIZE = (5, 5)
    _DILATE_KERNEL_SIZE = (3, 3)
    _LIGHTNESS_SCALE = 0.4
    _SATURATION_SCALE = 1.3

    cv2_mod = cast(_Cv2Like, cast(object, _get_cv2_module()))

    rgb_img = img.convert("RGB")
    src: NDArray[np.uint8] = np.array(rgb_img, dtype=np.uint8)

    gray: NDArray[np.uint8] = cv2_mod.cvtColor(src, cv2_mod.COLOR_RGB2GRAY)
    gray_blurred: NDArray[np.uint8] = cv2_mod.GaussianBlur(gray, _BLUR_KSIZE, 0)
    edges: NDArray[np.uint8] = cv2_mod.Canny(gray_blurred, _CANNY_LOW, _CANNY_HIGH)

    kernel: NDArray[np.uint8] = np.ones(_DILATE_KERNEL_SIZE, dtype=np.uint8)
    edge_mask: NDArray[np.bool_] = cv2_mod.dilate(edges, kernel, iterations=1) > 0

    result: NDArray[np.uint8] = src.copy()
    height, width = result.shape[:2]
    for y in range(height):
        for x in range(width):
            if not bool(edge_mask[y, x]):
                continue
            r = int(result[y, x, 0])
            g = int(result[y, x, 1])
            b = int(result[y, x, 2])
            h, l, s = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
            l = max(0.0, min(1.0, l * _LIGHTNESS_SCALE))
            s = min(1.0, s * _SATURATION_SCALE)
            nr, ng, nb = colorsys.hls_to_rgb(h, l, s)
            result[y, x] = (
                int(round(nr * 255.0)),
                int(round(ng * 255.0)),
                int(round(nb * 255.0)),
            )

    return Image.fromarray(result, mode="RGB")


def pixelate_image(image: Image.Image, pixel_size: int = 8) -> Image.Image:
    """将图片进行像素化处理（下采样 + NEAREST 上采样）。

    Args:
        image: 输入图像。
        pixel_size: 像素块大小，默认 8。

    Returns:
        像素化后的 PIL Image。
    """
    if pixel_size < 1:
        pixel_size = 1
    small_img = image.resize(
        (image.width // pixel_size, image.height // pixel_size),
        Image.Resampling.LANCZOS,
    )
    return small_img.resize(
        (image.width, image.height),
        Image.Resampling.NEAREST,
    )
