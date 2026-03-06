from pathlib import Path

import pytest
from PIL import Image

from src.api import (
    ConvertRequest,
    PipelineOptions,
    validate_params,
    resolve_grid_size_by_aspect,
    resolve_cell_size,
    ParameterValidationError,
)
from src.image_processing import resize_to_grid


def _make_image(path: Path, size=(200, 100), color=(120, 60, 30)) -> Path:
    img = Image.new("RGB", size, color)
    img.save(path, format="PNG")
    return path


def test_validate_params_accepts_valid_input(tmp_path: Path):
    image_path = _make_image(tmp_path / "ok.png")
    request = ConvertRequest(
        image_path=str(image_path),
        rows=20,
        pipeline=PipelineOptions(
            quantization_method="lab",
            resize_mode="fit",
            smoothing=0.3,
            bg_mode="keep",
            bg_color=None,
            max_colors=16,
        ),
    )

    validate_params(request)


def test_validate_params_raises_for_missing_image(tmp_path: Path):
    missing = tmp_path / "missing.png"
    request = ConvertRequest(
        image_path=str(missing),
        rows=20,
        pipeline=PipelineOptions(),
    )

    with pytest.raises(ParameterValidationError):
        validate_params(request)


def test_validate_params_raises_for_invalid_bg_replace(tmp_path: Path):
    image_path = _make_image(tmp_path / "ok2.png")
    request = ConvertRequest(
        image_path=str(image_path),
        rows=20,
        pipeline=PipelineOptions(
            bg_mode="replace",
            bg_color=None,
        ),
    )

    with pytest.raises(ParameterValidationError, match="bg_mode='replace'"):
        validate_params(request)


def test_resolve_grid_size_by_aspect_rows(tmp_path: Path):
    image_path = _make_image(tmp_path / "grid_rows.png", size=(200, 100))

    rows, cols = resolve_grid_size_by_aspect(str(image_path), rows=50, cols=None)

    assert rows == 50
    assert cols == 100


def test_resolve_grid_size_by_aspect_cols(tmp_path: Path):
    image_path = _make_image(tmp_path / "grid_cols.png", size=(200, 100))

    rows, cols = resolve_grid_size_by_aspect(str(image_path), rows=None, cols=80)

    assert rows == 40
    assert cols == 80


def test_resolve_cell_size_auto_bounds():
    size_without_codes = resolve_cell_size(rows=300, cols=300, show_color_codes=False)
    size_with_codes = resolve_cell_size(rows=300, cols=300, show_color_codes=True)

    assert 8 <= size_without_codes <= 40
    assert 15 <= size_with_codes <= 40


def test_resize_to_grid_outputs_target_shape():
    src = Image.new("RGB", (200, 100), (0, 0, 0))

    out_stretch = resize_to_grid(src, rows=32, cols=48, resize_mode="stretch")
    out_fit = resize_to_grid(src, rows=32, cols=48, resize_mode="fit")
    out_pad = resize_to_grid(src, rows=32, cols=48, resize_mode="pad")

    assert out_stretch.size == (48, 32)
    assert out_fit.size == (48, 32)
    assert out_pad.size == (48, 32)
