from pathlib import Path

import pytest
from PIL import Image

import src.api as api_module
from src.api import (
    ConvertRequest,
    PipelineOptions,
    RenderOptions,
    generate_in_memory,
    convert_image_to_bead_pattern,
    ParameterValidationError,
    DependencyMissingError,
    ProcessingRuntimeError,
)


def _make_demo_image(path: Path, size=(12, 8)) -> Path:
    img = Image.new("RGB", size)
    pixels = img.load()
    assert pixels is not None
    for y in range(size[1]):
        for x in range(size[0]):
            if x < size[0] // 2:
                pixels[x, y] = (255, 0, 0)
            else:
                pixels[x, y] = (0, 0, 255)
    img.save(path, format="PNG")
    return path


def test_generate_in_memory_raises_parameter_error_when_rows_cols_both_none(tmp_path: Path):
    image_path = _make_demo_image(tmp_path / "both_none.png")
    request = ConvertRequest(
        image_path=str(image_path),
        rows=None,
        cols=None,
        pipeline=PipelineOptions(),
        render=RenderOptions(),
    )

    with pytest.raises(ParameterValidationError, match="rows 和 cols 必须二选一"):
        generate_in_memory(request)


def test_generate_in_memory_raises_parameter_error_when_grid_too_large(tmp_path: Path):
    image_path = _make_demo_image(tmp_path / "too_large.png")
    request = ConvertRequest(
        image_path=str(image_path),
        rows=None,
        cols=501,
        pipeline=PipelineOptions(),
        render=RenderOptions(),
    )

    with pytest.raises(ParameterValidationError, match="网格尺寸过大"):
        generate_in_memory(request)


def test_generate_in_memory_raises_dependency_missing_error(monkeypatch, tmp_path: Path):
    image_path = _make_demo_image(tmp_path / "missing_dep.png")
    request = ConvertRequest(
        image_path=str(image_path),
        rows=8,
        cols=None,
        pipeline=PipelineOptions(),
        render=RenderOptions(),
    )

    def _raise_import_error(_img, bg_mode, bg_color):
        raise ImportError("缺少 rembg 依赖")

    monkeypatch.setattr(api_module, "process_background", _raise_import_error)

    with pytest.raises(DependencyMissingError, match="缺少 rembg 依赖"):
        generate_in_memory(request)


def test_generate_in_memory_raises_runtime_error(monkeypatch, tmp_path: Path):
    image_path = _make_demo_image(tmp_path / "runtime_error.png")
    request = ConvertRequest(
        image_path=str(image_path),
        rows=8,
        cols=None,
        pipeline=PipelineOptions(),
        render=RenderOptions(),
    )

    def _raise_runtime_error(*args, **kwargs):
        raise RuntimeError("渲染失败")

    monkeypatch.setattr(api_module, "draw_bead_pattern", _raise_runtime_error)

    with pytest.raises(ProcessingRuntimeError, match="渲染失败"):
        generate_in_memory(request)


def test_convert_file_flow_raises_runtime_error(monkeypatch, tmp_path: Path):
    image_path = _make_demo_image(tmp_path / "runtime_file.png")
    output_dir = tmp_path / "out"
    request = ConvertRequest(
        image_path=str(image_path),
        rows=None,
        cols=10,
        output_dir=str(output_dir),
        pipeline=PipelineOptions(),
        render=RenderOptions(show_color_codes=False),
    )

    def _raise_runtime_error(*args, **kwargs):
        raise RuntimeError("保存图纸失败")

    monkeypatch.setattr(api_module, "draw_bead_pattern", _raise_runtime_error)

    with pytest.raises(ProcessingRuntimeError, match="保存图纸失败"):
        convert_image_to_bead_pattern(request)
