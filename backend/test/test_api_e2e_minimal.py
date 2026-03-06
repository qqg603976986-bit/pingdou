from pathlib import Path

from PIL import Image

from src.api import (
    ConvertRequest,
    PipelineOptions,
    RenderOptions,
    generate_in_memory,
    convert_image_to_bead_pattern,
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


def test_generate_in_memory_end_to_end_small_image(tmp_path: Path):
    image_path = _make_demo_image(tmp_path / "demo.png")
    request = ConvertRequest(
        image_path=str(image_path),
        rows=8,
        cols=None,
        pipeline=PipelineOptions(
            quantization_method="lab",
            dithering=False,
            resize_mode="fit",
            smoothing=0.0,
            bg_mode="keep",
            bg_color=None,
            max_colors=4,
            upscale=False,
        ),
        render=RenderOptions(
            cell_size=12,
            show_grid=True,
            show_labels=True,
            show_color_codes=False,
        ),
    )

    canvas, color_stats, table = generate_in_memory(request)

    assert isinstance(canvas, Image.Image) 
    assert canvas.size[0] > 0 and canvas.size[1] > 0 # 

    assert isinstance(color_stats, dict)
    assert len(color_stats) >= 1
    assert sum(color_stats.values()) > 0

    assert isinstance(table, list)
    assert len(table) >= 1
    assert len(table[0]) == 6


def test_convert_image_to_bead_pattern_end_to_end_writes_files(tmp_path: Path):
    image_path = _make_demo_image(tmp_path / "demo_file.png")
    output_dir = tmp_path / "out"
    request = ConvertRequest(
        image_path=str(image_path),
        rows=None,
        cols=10,
        output_dir=str(output_dir),
        pipeline=PipelineOptions(
            quantization_method="lab",
            dithering=False,
            resize_mode="fit",
            smoothing=0.0,
            bg_mode="keep",
            bg_color=None,
            max_colors=4,
            upscale=False,
        ),
        render=RenderOptions(
            cell_size=10,
            show_grid=True,
            show_labels=True,
            show_color_codes=False,
        ),
    )

    pattern_path, stats_path = convert_image_to_bead_pattern(request)

    pattern_file = Path(pattern_path)
    stats_file = Path(stats_path)

    assert pattern_file.exists()
    assert pattern_file.suffix.lower() == ".png"

    assert stats_file.exists()
    assert stats_file.suffix.lower() == ".csv"

    csv_text = stats_file.read_text(encoding="utf-8-sig")
    assert "色号" in csv_text
