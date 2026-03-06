from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
import os
import sys
import tempfile
import logging
import traceback

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ensure src module is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from src.api import (
    ConvertRequest,
    PipelineOptions,
    RenderOptions,
    generate_svg_in_memory,
    ParameterValidationError,
    DependencyMissingError,
)

app = FastAPI(title="Pingdou API", description="API for Pingdou Pixel Art Generator")

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://10.0.0.39:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "message": "Pingdou API is running",
    }


def _format_stats_payload(color_stats, table_data):
    total_beads = sum(color_stats.values())
    color_table = [
        {
            "code": row[0],
            "name": row[1],
            "count": int(row[2]),
            "percentage": float(row[3]),
            "rgb": row[4],
            "hex": row[5],
        }
        for row in table_data
    ]
    return {
        "total_beads": total_beads,
        "unique_colors": len(color_stats),
        "color_table": color_table,
    }



@app.post("/api/generate")
async def generate_pattern(
    file: UploadFile = File(...),
    # Grid options
    size_mode: str = Form("rows"),
    size_value: int = Form(40),
    # Pipeline options
    quantization_method: str = Form("lab"),
    dithering: bool = Form(False),
    resize_mode: str = Form("fit"),
    max_colors: int = Form(0),
    merge_threshold: float = Form(0),
    pixel_style: bool = Form(False),
    grayscale: bool = Form(False),
    # Render options
    show_grid: bool = Form(False),
    show_labels: bool = Form(True),
    show_color_codes: bool = Form(True)
):
    temp_path = None
    try:
        # Create a temporary file to save the uploaded image
        suffix = os.path.splitext(file.filename)[1] if file.filename else ".png"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            temp_path = tmp_file.name

        # Parse grid size
        rows, cols = None, None
        if size_mode == "rows":
            rows = size_value
        else:
            cols = size_value

        # Parse max colors
        mc = max_colors if max_colors > 0 else None

        # Create request object
        request = ConvertRequest(
            image_path=temp_path,
            rows=rows,
            cols=cols,
            pipeline=PipelineOptions(
                quantization_method=quantization_method,
                dithering=dithering,
                resize_mode=resize_mode,
                max_colors=mc,
                merge_threshold=merge_threshold,
                grayscale=grayscale,
            ),
            render=RenderOptions(
                cell_size=None,
                show_grid=show_grid,
                show_labels=show_labels,
                show_color_codes=show_color_codes,
                round_beads=pixel_style,
            ),
        )

        # Generate SVG pattern in memory
        svg_str, color_stats, table_data = generate_svg_in_memory(request)

        formatted_stats = _format_stats_payload(color_stats, table_data)

        return JSONResponse(content={
            "status": "success",
            "svg": svg_str,
            "stats": formatted_stats
        })

    except ParameterValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DependencyMissingError as e:
        raise HTTPException(status_code=500, detail=f"Missing dependency: {str(e)}")
    except Exception as e:
        logger.error("generate_pattern failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temporary file
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception:
                pass

# 提供一个接口，接受 SVG 内容并返回 PDF 文件，供用户下载。后续可以增加参数支持调整 PDF 质量或尺寸。
@app.post("/api/export/pdf")
async def export_pdf(request: Request):
    """Convert SVG content to PDF for download."""
    try:
        svg_bytes = await request.body()
        if not svg_bytes:
            raise HTTPException(status_code=400, detail="No SVG content provided")

        # Try cairosvg first, fall back to reportlab
        try:
            import cairosvg
            pdf_bytes = cairosvg.svg2pdf(bytestring=svg_bytes)
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=pingdou.pdf"},
            )
        except ImportError:
            pass

        # Fallback: render SVG → PNG → PDF via Pillow
        try:
            import cairosvg as _cs
            png_bytes = _cs.svg2png(bytestring=svg_bytes, dpi=150)
        except ImportError:
            # Last resort: use the built-in SVG-to-PNG via Pillow + svglib
            try:
                from svglib.svglib import svg2rlg
                from reportlab.graphics import renderPDF
                from io import BytesIO

                drawing = svg2rlg(BytesIO(svg_bytes))
                if drawing is None:
                    raise ValueError("Could not parse SVG")
                buf = BytesIO()
                renderPDF.drawToFile(drawing, buf, fmt="PDF")
                buf.seek(0)
                return Response(
                    content=buf.read(),
                    media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=pingdou.pdf"},
                )
            except ImportError:
                raise HTTPException(
                    status_code=501,
                    detail="PDF export requires 'cairosvg' or 'svglib+reportlab'. Install one: pip install cairosvg  OR  pip install svglib reportlab"
                )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF export failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)