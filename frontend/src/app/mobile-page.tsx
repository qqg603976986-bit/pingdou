"use client";

/*
 ══════════════════════════════════════════════════════════════
  PopBeads 移动端页面组件
  ──────────────────────────────────────────────────────────────
  单栏垂直滚动布局，针对 < 768px 屏幕优化。
  结构 (从上到下):
    ┌──────────────────────┐
    │  品牌 Logo 栏 (sticky)│
    ├──────────────────────┤
    │  上传图片区域          │
    ├──────────────────────┤
    │  参数调整 (折叠手风琴)  │
    ├──────────────────────┤
    │  画布静态预览          │
    ├──────────────────────┤
    │  颜色统计 (折叠)       │
    ├──────────────────────┤
    │  导出按钮组            │
    ├──────────────────────┤
    │  生成按钮 (sticky 底部)│
    └──────────────────────┘
 ══════════════════════════════════════════════════════════════
*/

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
    Upload,
    Image as ImageIcon,
    Download,
    Settings,
    Loader2,
    Palette,
    Tag,
    ChevronDown,
    ChevronUp,
    XCircle,
} from "lucide-react";
import axios from "axios";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

import { API_BASE, POPBEADS_LOGO_PATH, POPBEADS_LOGO_VIEWBOX } from "@/lib/constants";

/* ── 二选一切换按钮组（复用桌面端同款） ── */
function ToggleGroup({
    value,
    onChange,
    options,
}: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
}) {
    const activeIndex = options.findIndex((o) => o.value === value);

    return (
        <div className="relative flex w-full bg-neutral-100 p-1 rounded-full overflow-hidden isolate">
            <div
                className="absolute left-1 top-1 bottom-1 bg-neutral-900 rounded-full shadow-sm transition-transform duration-300 ease-in-out z-0"
                style={{
                    width: `calc((100% - 8px) / ${options.length})`,
                    transform: `translateX(calc(${activeIndex * 100}%))`,
                }}
            />
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    className={`flex-1 relative z-10 text-[12px] py-2 px-3 rounded-full transition-colors duration-300 tracking-wide font-medium
            ${value === opt.value
                            ? "text-white"
                            : "text-neutral-500 hover:text-neutral-700"
                        }`}
                    onClick={() => onChange(opt.value)}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

/* ── 折叠面板组件 ── */
function Accordion({
    title,
    icon,
    defaultOpen = false,
    children,
}: {
    title: string;
    icon?: React.ReactNode;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-neutral-100">
            <button
                type="button"
                className="flex items-center justify-between w-full px-4 py-3.5 text-left active:bg-neutral-50 transition-colors"
                onClick={() => setOpen(!open)}
            >
                <div className="flex items-center gap-2 text-[14px] font-medium text-black font-pingfang">
                    {icon}
                    {title}
                </div>
                {open ? (
                    <ChevronUp className="w-4 h-4 text-neutral-400" />
                ) : (
                    <ChevronDown className="w-4 h-4 text-neutral-400" />
                )}
            </button>
            <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                    }`}
            >
                <div className="px-4 pb-4 space-y-4">{children}</div>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════
   移动端主页面组件
   ══════════════════════════════════════════════════════════════ */
export default function MobileGeneratorPage() {
    /* ── 核心状态 ── */
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [svgContent, setSvgContent] = useState<string | null>(null);
    const [stats, setStats] = useState<any>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [showColorCodes, setShowColorCodes] = useState(true);
    const [highlightHex, setHighlightHex] = useState<string | null>(null);
    const [grayscaleMode, setGrayscaleMode] = useState(false);

    /* ── 生成参数 ── */
    const [sizeMode, setSizeMode] = useState("height");
    const [sizeValue, setSizeValue] = useState([64]);
    const [quantization, setQuantization] = useState("lab");
    const [dithering, setDithering] = useState("none");
    const [pixelStyle, setPixelStyle] = useState("square");
    const [maxColors, setMaxColors] = useState("0");
    const [mergeThreshold, setMergeThreshold] = useState([0]);

    /* ── 导出菜单 & 统计展开 ── */
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showStats, setShowStats] = useState(false);

    // Close export menu on outside click
    useEffect(() => {
        const handler = () => setShowExportMenu(false);
        if (showExportMenu) document.addEventListener("click", handler);
        return () => document.removeEventListener("click", handler);
    }, [showExportMenu]);

    /* ── 文件上传 ── */
    const onDrop = useCallback((acceptedFiles: File[]) => {
        const selectedFile = acceptedFiles[0];
        if (selectedFile) {
            setFile(selectedFile);
            setPreview(URL.createObjectURL(selectedFile));
            setSvgContent(null);
            setStats(null);
            setHighlightHex(null);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
        maxFiles: 1,
    });

    /* ── 生成 API 调用 ── */
    const handleGenerate = async () => {
        if (!file) return;
        setIsGenerating(true);
        setSvgContent(null);
        setStats(null);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("size_mode", sizeMode === "height" ? "rows" : "cols");
        formData.append("size_value", sizeValue[0].toString());
        formData.append("quantization_method", quantization);
        formData.append(
            "dithering",
            (dithering === "floyd_steinberg").toString()
        );
        formData.append("resize_mode", "fit");
        formData.append("max_colors", maxColors);
        formData.append("merge_threshold", mergeThreshold[0].toString());
        formData.append("pixel_style", (pixelStyle !== "square").toString());
        formData.append("grayscale", grayscaleMode.toString());

        try {
            const response = await axios.post(
                `${API_BASE}/api/generate`,
                formData,
                { headers: { "Content-Type": "multipart/form-data" } }
            );
            setSvgContent(response.data.svg);
            setStats(response.data.stats);
            setShowStats(true);
        } catch (error: any) {
            const detail = error?.response?.data?.detail || error?.message;
            alert(
                detail
                    ? `生成失败：${detail}`
                    : "生成图纸失败，请确保后端服务已启动。"
            );
        } finally {
            setIsGenerating(false);
        }
    };

    /* ── 导出辅助 ── */
    const downloadBlob = (blob: Blob, ext: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `pingdou_${Date.now()}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const exportSVG = () => {
        if (!svgContent) return;
        downloadBlob(
            new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" }),
            "svg"
        );
    };

    const exportBitmap = async (format: "png" | "jpg") => {
        if (!svgContent) return;
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgContent, "image/svg+xml");
        const svgEl = doc.querySelector("svg");
        if (!svgEl) return;
        const w = parseInt(svgEl.getAttribute("width") || "800");
        const h = parseInt(svgEl.getAttribute("height") || "600");
        const dpr = 2;
        const canvas = document.createElement("canvas");
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.scale(dpr, dpr);
        if (format === "jpg") {
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, w, h);
        }
        const img = new Image();
        const blob = new Blob([svgContent], {
            type: "image/svg+xml;charset=utf-8",
        });
        const blobUrl = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
            img.onload = () => {
                ctx.drawImage(img, 0, 0, w, h);
                resolve();
            };
            img.onerror = reject;
            img.src = blobUrl;
        });
        URL.revokeObjectURL(blobUrl);
        const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
        const quality = format === "jpg" ? 0.95 : undefined;
        canvas.toBlob((b) => {
            if (b) downloadBlob(b, format);
        }, mimeType, quality);
    };

    const exportPDF = async () => {
        if (!svgContent) return;
        try {
            const response = await axios.post(
                `${API_BASE}/api/export/pdf`,
                svgContent,
                {
                    headers: { "Content-Type": "image/svg+xml" },
                    responseType: "blob",
                }
            );
            downloadBlob(response.data, "pdf");
        } catch {
            const printWin = window.open("", "_blank");
            if (printWin) {
                printWin.document.write(
                    `<!DOCTYPE html><html><head><title>拼豆图纸</title></head><body style="margin:0">${svgContent}</body></html>`
                );
                printWin.document.close();
                printWin.print();
            }
        }
    };

    /* ── Compute highlighted SVG (same logic as desktop) ── */
    const displaySvg = useMemo(() => {
        if (!svgContent) return '';

        let svg = svgContent;

        // Apply hide-labels class based on state (matches global CSS logic)
        if (!showColorCodes) {
            svg = svg.replace('<svg ', '<svg class="hide-labels" ');
        }

        if (highlightHex) {
            // Inject highlight-active class on the grid group
            svg = svg.replace(
                '<g id="bead-grid">',
                '<g id="bead-grid" class="highlight-active">'
            );

            // Add hl-match class to matching rects/circles whose data-hex matches
            const escaped = highlightHex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            svg = svg.replace(
                new RegExp('(<(?:rect|circle) )([^>]*data-hex="' + escaped + '"[^>]*/>)', 'g'),
                '$1class="hl-match" $2'
            );

            // Add hl-match to text labels immediately following a matched element
            svg = svg.replace(
                new RegExp('(class="hl-match" [^/]*/>\\n<text class=")(color-label")', 'g'),
                '$1hl-match $2'
            );
        }

        return svg;
    }, [svgContent, highlightHex, showColorCodes]);

    /* ══ 渲染 ══ */
    return (
        <div className="min-h-dvh flex flex-col bg-neutral-50 font-sans">
            {/* ── 顶部品牌栏 (sticky) ── */}
            <header className="sticky top-0 z-40 flex items-center justify-between px-4 h-12 bg-white border-b border-neutral-200/60">
                <svg
                    viewBox={POPBEADS_LOGO_VIEWBOX}
                    className="w-[120px] text-neutral-800"
                    shapeRendering="crispEdges"
                >
                    <path fill="currentColor" d={POPBEADS_LOGO_PATH} />
                </svg>
                <div className="flex items-center gap-2">
                    {stats && (
                        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-mono">
                        </div>
                    )}
                    <a href="https://github.com/qqg603976986-bit/pingdou.git" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-800 transition-colors p-1 active:scale-90">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                    </a>
                </div>
            </header>

            {/* ── 可滚动内容区 ── */}
            <div className="flex-1 overflow-y-auto pb-20">
                {/* ── 上传图片 ── */}
                <div className="px-4 pt-4 pb-2">
                    {!preview ? (
                        <div
                            {...getRootProps()}
                            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 active:scale-95
                ${isDragActive
                                    ? "border-neutral-400 bg-neutral-100"
                                    : "border-neutral-200 bg-white"
                                }`}
                        >
                            <input {...getInputProps()} />
                            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400">
                                <Upload className="w-6 h-6" />
                            </div>
                            <p className="text-sm font-medium text-neutral-600">
                                点击上传图片
                            </p>
                            <p className="text-[11px] text-neutral-400 mt-1.5">
                                JPG / PNG / WEBP
                            </p>
                        </div>
                    ) : (
                        <div className="relative group rounded-2xl overflow-hidden border border-neutral-200 bg-white">
                            <img
                                src={preview}
                                alt="预览"
                                className="w-full aspect-video object-cover"
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setFile(null);
                                    setPreview(null);
                                    setSvgContent(null);
                                    setStats(null);
                                    setHighlightHex(null);
                                }}
                                className="absolute top-2 right-2 z-10 bg-black/40 rounded-full p-1 text-white/90 active:scale-90 transition-transform"
                                title="删除图片"
                            >
                                <XCircle className="w-5 h-5" />
                            </button>
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2">
                                <span className="text-white text-[11px] truncate block">
                                    {file?.name}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── 参数调整 (折叠手风琴) ── */}
                <div className="mt-2 bg-white border-t border-neutral-100">
                    <Accordion
                        title="参数调整"
                        icon={<Settings className="w-4 h-4" />}
                        defaultOpen={false}
                    >
                        {/* 网格尺寸 */}
                        <div className="space-y-2">
                            <div className="text-[13px] font-medium text-neutral-700 font-pingfang">
                                网格尺寸
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-relaxed -mt-1">
                                控制图纸的分辨率，数值越大细节越多
                            </p>
                            <ToggleGroup
                                value={sizeMode}
                                onChange={setSizeMode}
                                options={[
                                    { value: "height", label: "按高度（行）" },
                                    { value: "width", label: "按宽度（列）" },
                                ]}
                            />
                            <div className="flex items-center gap-3">
                                <Slider
                                    value={sizeValue}
                                    onValueChange={setSizeValue}
                                    max={256}
                                    min={16}
                                    step={1}
                                    className="flex-1"
                                />
                                <Input
                                    type="number"
                                    value={sizeValue[0]}
                                    onChange={(e) =>
                                        setSizeValue([parseInt(e.target.value) || 16])
                                    }
                                    min={16}
                                    max={512}
                                    className="h-9 text-sm w-16 flex-shrink-0 rounded-lg text-center"
                                />
                            </div>
                        </div>

                        <div className="h-px bg-neutral-100" />

                        {/* 配色数量 */}
                        <div className="space-y-2">
                            <div className="text-[13px] font-medium text-neutral-700 font-pingfang">
                                配色数量 <span className="text-[10px] text-neutral-400 font-normal ml-1 border border-neutral-200 px-1 py-0.5 rounded-md relative -top-[1px]">Mard 色号</span>
                            </div>                            <p className="text-[11px] text-neutral-400 leading-relaxed -mt-1">
                                根据你实际拥有的拼豆色板选择可用颜色数
                            </p>                            <Select value={maxColors} onValueChange={setMaxColors}>
                                <SelectTrigger className="h-9 text-sm rounded-lg">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="0">全部 221 色</SelectItem>
                                    <SelectItem value="120">120 色（大套装）</SelectItem>
                                    <SelectItem value="72">72 色（标准套装）</SelectItem>
                                    <SelectItem value="48">48 色（入门套装）</SelectItem>
                                    <SelectItem value="36">36 色（基础套装）</SelectItem>
                                    <SelectItem value="24">24 色（迷你套装）</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 合并相似色 */}
                        <div className="space-y-2 mt-1">
                            <div className="flex items-center justify-between">
                                <div className="text-[13px] font-medium text-neutral-700 font-pingfang">
                                    合并相似色
                                </div>
                                <span className="text-[12px] font-mono text-neutral-400 tabular-nums">
                                    {mergeThreshold[0] === 0 ? '关闭' : mergeThreshold[0]}
                                </span>
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-relaxed">
                                将色差接近的颜色合并，减少零星颜色种类
                            </p>
                            <Slider
                                value={mergeThreshold}
                                onValueChange={setMergeThreshold}
                                max={15}
                                min={0}
                                step={1}
                                className="w-full"
                            />
                        </div>

                        <div className="h-px bg-neutral-100" />

                        {/* 颜色匹配 */}
                        <div className="space-y-2">
                            <div className="text-[13px] font-medium text-neutral-700 font-pingfang">
                                颜色匹配
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-relaxed -mt-1">
                                Lab 模式按人眼感知匹配最近颜色，效果更自然<br />RGB 模式按数值直接匹配
                            </p>
                            <ToggleGroup
                                value={quantization}
                                onChange={setQuantization}
                                options={[
                                    { value: "lab", label: "Lab 感知匹配" },
                                    { value: "rgb", label: "RGB 直接匹配" },
                                ]}
                            />
                        </div>

                        <div className="h-px bg-neutral-100" />

                        {/* 抖动处理 */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between py-1">
                                <div className="text-[13px] font-medium text-neutral-700 font-pingfang">
                                    抖动处理
                                </div>
                                <Switch
                                    checked={dithering === "floyd_steinberg"}
                                    onCheckedChange={(v) =>
                                        setDithering(v ? "floyd_steinberg" : "none")
                                    }
                                />
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-relaxed -mt-1">
                                开启后颜色过渡更平滑，适合渐变多的图片<br />关闭则保持纯色填充
                            </p>
                        </div>

                        <div className="h-px bg-neutral-100" />

                        {/* 单色模式 */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between py-1">
                                <div className="text-[13px] font-medium text-neutral-700 font-pingfang">
                                    单色模式
                                </div>
                                <Switch
                                    checked={grayscaleMode}
                                    onCheckedChange={setGrayscaleMode}
                                />
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-relaxed -mt-1">
                                开启后图纸以灰度显示
                            </p>
                        </div>

                        <div className="h-px bg-neutral-100" />

                        {/* 珠子样式 */}
                        <div className="space-y-2">
                            <div className="text-[13px] font-medium text-neutral-700 font-pingfang">
                                珠子样式
                            </div>
                            <p className="text-[11px] text-neutral-400 leading-relaxed -mt-1">
                                方形适合查看像素效果，圆形更贴近实际拼豆成品
                            </p>
                            <ToggleGroup
                                value={pixelStyle}
                                onChange={setPixelStyle}
                                options={[
                                    { value: "square", label: "方形像素" },
                                    { value: "circle", label: "圆形拼豆" },
                                ]}
                            />
                        </div>
                    </Accordion>
                </div>

                {/* ── 画布静态预览 ── */}
                {isGenerating && (
                    <div className="mx-4 mt-4 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center py-16">
                        <div className="flex flex-col items-center gap-3 text-neutral-500">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <p className="text-sm font-medium tracking-wide">
                                正在生成像素画...
                            </p>
                        </div>
                    </div>
                )}

                {svgContent && !isGenerating && (
                    <div className="mx-4 mt-4 rounded-2xl bg-white border border-neutral-200 overflow-hidden relative">
                        <div className="absolute top-2 right-2 z-20 flex flex-col gap-2 items-end">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-neutral-200 rounded-full px-2.5 py-1.5 text-[11px] text-neutral-600 shadow-sm active:scale-90 transition-transform duration-200"
                                    onClick={() => setShowColorCodes(!showColorCodes)}
                                >
                                    <Tag className="w-3.5 h-3.5" />
                                    {showColorCodes ? "隐藏色号" : "显示色号"}
                                </button>

                                <div className="relative">
                                    <button
                                        type="button"
                                        className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-neutral-200 rounded-full px-2.5 py-1.5 text-[11px] text-neutral-600 shadow-sm active:scale-90 transition-transform duration-200"
                                        onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); }}
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        导出图纸
                                    </button>

                                    {showExportMenu && (
                                        <div className="absolute top-full right-0 mt-2 bg-white/95 backdrop-blur-md border border-neutral-200 rounded-xl shadow-lg flex flex-col w-[104px] overflow-hidden z-50 transition-all duration-200" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="px-3 py-2.5 text-xs text-left text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 flex items-center gap-2 border-b border-neutral-100"
                                                onClick={() => { exportSVG(); setShowExportMenu(false); }}>
                                                SVG 矢量图
                                            </button>
                                            <button
                                                className="px-3 py-2.5 text-xs text-left text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 flex items-center gap-2 border-b border-neutral-100"
                                                onClick={() => { exportBitmap("png"); setShowExportMenu(false); }}>
                                                PNG 位图
                                            </button>
                                            <button
                                                className="px-3 py-2.5 text-xs text-left text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 flex items-center gap-2 border-b border-neutral-100"
                                                onClick={() => { exportBitmap("jpg"); setShowExportMenu(false); }}>
                                                JPG 位图
                                            </button>
                                            <button
                                                className="px-3 py-2.5 text-xs text-left text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 flex items-center gap-2"
                                                onClick={() => { exportPDF(); setShowExportMenu(false); }}>
                                                PDF 文档
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {highlightHex && (
                                <button
                                    type="button"
                                    className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-neutral-200 rounded-full px-2.5 py-1 text-[11px] text-neutral-600 shadow-sm active:scale-90 transition-transform duration-200"
                                    onClick={() => setHighlightHex(null)}
                                >
                                    <span className="w-2.5 h-2.5 rounded-full border border-black/10" style={{ backgroundColor: highlightHex }} />
                                    取消高亮
                                </button>
                            )}
                        </div>
                        <div
                            className="w-full overflow-x-auto"
                            dangerouslySetInnerHTML={{
                                __html: displaySvg.replace(
                                    /(<svg[^>]*?)\bwidth="[\d.]+"([^>]*?)\bheight="[\d.]+"/,
                                    '$1width="100%"$2height="auto"'
                                ),
                            }}
                        />
                    </div>
                )}

                {/* ── 颜色统计 (折叠面板) ── */}
                {stats && (
                    <div className="mt-4 bg-white border-t border-neutral-100">
                        <Accordion
                            title="颜色统计"
                            icon={<Palette className="w-4 h-4" />}
                            defaultOpen={false}
                        >
                            {/* 总数概览 */}
                            <div className="flex gap-3 mb-3 text-[12px] text-neutral-500">
                                <span className="bg-neutral-100 px-3 py-1.5 rounded-full">
                                    总珠数 <strong className="text-neutral-700">{stats.total_beads}</strong>
                                </span>
                                <span className="bg-neutral-100 px-3 py-1.5 rounded-full">
                                    颜色 <strong className="text-neutral-700">{stats.unique_colors}</strong>
                                </span>
                            </div>
                            <div className="space-y-1.5">
                                {stats.color_table?.map((c: any, i: number) => (
                                    <div
                                        key={i}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-200 text-xs active:scale-90
                      ${highlightHex === c.hex
                                                ? "bg-neutral-100 ring-1 ring-neutral-300"
                                                : "hover:bg-neutral-50"
                                            }
                      ${highlightHex && highlightHex !== c.hex
                                                ? "opacity-30"
                                                : "opacity-100"
                                            }`}
                                        onClick={() =>
                                            setHighlightHex((prev) =>
                                                prev === c.hex ? null : c.hex
                                            )
                                        }
                                    >
                                        <div
                                            className="w-8 h-8 rounded-lg border border-black/5 flex-shrink-0"
                                            style={{ backgroundColor: c.hex }}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono font-semibold text-neutral-700">
                                                    {c.code}
                                                </span>
                                                <span className="text-neutral-400">×{c.count}</span>
                                            </div>
                                            <div className="flex items-center justify-between mt-0.5">
                                                <span className="text-[10px] text-neutral-400 truncate">
                                                    {c.name}
                                                </span>
                                                <span className="text-[10px] text-neutral-400">
                                                    {c.percentage}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Accordion>
                    </div>
                )}
            </div>

            {/* ── 底部固定生成按钮 ── */}
            <div className="sticky bottom-0 z-40 px-4 py-3 bg-white/90 backdrop-blur-md border-t border-neutral-200/60">
                <Button
                    className="w-full bg-neutral-900 hover:bg-neutral-800 text-white h-12 font-medium rounded-xl text-[15px] tracking-wide active:scale-95 active:bg-neutral-950 transition-all duration-200"
                    onClick={handleGenerate}
                    disabled={!file || isGenerating}
                >
                    {isGenerating ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            处理中...
                        </>
                    ) : (
                        <>生成拼豆图纸</>
                    )}
                </Button>
            </div>

            {/* ── 全局样式 ── */}
            <style jsx global>{`
        .hide-labels .color-label {
          display: none !important;
        }
        .highlight-active rect[data-hex],
        .highlight-active circle[data-hex] {
          opacity: 0.12;
        }
        .highlight-active rect[data-hex].hl-match,
        .highlight-active circle[data-hex].hl-match {
          opacity: 1;
        }
        .highlight-active .color-label {
          opacity: 0.1;
        }
        .highlight-active .color-label.hl-match {
          opacity: 1;
        }
      `}</style>
        </div>
    );
}
