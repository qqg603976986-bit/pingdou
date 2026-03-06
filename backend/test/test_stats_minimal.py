from pathlib import Path

from src.stats import build_stats_table, save_color_statistics


def test_build_stats_table_sorted_and_fields():
    color_stats = {"A2": 2, "A1": 5}

    table = build_stats_table(color_stats)

    assert len(table) == 2
    assert table[0][0] == "A1"  # 按数量降序
    assert table[0][2] == "5"
    assert table[1][0] == "A2"

    # 行结构: [色号, 名称, 数量, 占比, RGB, HEX]
    assert len(table[0]) == 6
    assert table[0][4].startswith("(")
    assert table[0][5].startswith("#")


def test_save_color_statistics_creates_csv(tmp_path: Path):
    output = tmp_path / "stats.csv"
    color_stats = {"A1": 3, "A2": 1}

    save_color_statistics(color_stats, str(output))

    assert output.exists()
    text = output.read_text(encoding="utf-8-sig")
    assert "色号" in text
    assert "A1" in text
