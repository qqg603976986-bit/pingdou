"use client";

/*
 ══════════════════════════════════════════════════════════════
  拼豆工坊 — 主页面组件
  ──────────────────────────────────────────────────────────────
  页面布局 (三栏式):
    ┌────────────┬──────────────────┬───────────┐
    │ 左侧面板    │  中央画布区域      │ 右侧面板   │
    │ (w-72)     │  (flex-1)        │ (w-64)    │
    │            │                  │           │
    │ · Logo     │  · 缩放工具栏     │ · 颜色统计 │
    │ · 上传区域  │  · SVG 画布       │ · 珠子列表 │
    │ · 参数调整  │  · 加载/空状态    │           │
    │ · 生成按钮  │                  │           │
    └────────────┴──────────────────┴───────────┘

  样式体系:
    - 使用 TailwindCSS 原子化类
    - 颜色基于 neutral 灰色系 (neutral-50 ~ neutral-900)
    - 字号使用固定像素: text-[10px] / text-[11px] / text-[12px] / text-xs / text-sm
    - 圆角统一采用 rounded-lg / rounded-xl / rounded-2xl / rounded-full
    - 间距使用 Tailwind 默认比例: gap-1.5 / gap-2 / gap-3 / p-4 / p-5
    - 组件来自 shadcn/ui: Button, Slider, Select, Switch, Input, Label
 ══════════════════════════════════════════════════════════════
*/

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
/* ── 依赖导入 ─────────────────────────────────────────────── */
import { useDropzone } from 'react-dropzone';               // 拖拽上传
import {
  Upload, Image as ImageIcon, Download, Settings, Loader2, Sparkles,
  SlidersHorizontal, Palette, Scissors, Tag, ZoomIn, ZoomOut, Maximize,
  ChevronDown, XCircle,
} from 'lucide-react';                                      // 图标库
import axios from 'axios';

/* shadcn/ui 组件 — 样式在 components/ui/ 下可单独修改 */
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

import { useMediaQuery } from "@/lib/use-media-query";
import MobileGeneratorPage from "./mobile-page";
import { API_BASE, POPBEADS_LOGO_PATH, POPBEADS_LOGO_VIEWBOX } from "@/lib/constants";

/**
 * 二选一切换按钮组 — 用于「按高度/按宽度」「Lab/RGB」「方形/圆形」等二选一场景
 *
 * 🔧 样式可调:
 *   - 选中态: bg-neutral-900 text-white → 改背景色和文字色
 *   - 未选中态: bg-neutral-100 text-neutral-500 → 改背景灰度
 *   - 圆角: rounded-full → 可改为 rounded-lg
 *   - 文字大小: text-[11px] → 调整按钮文字大小
 *   - 内边距: py-2 px-3 → 调整按钮高度和宽度
 */
function ToggleGroup({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const activeIndex = options.findIndex((o) => o.value === value);

  return (
    <div className="relative flex w-full bg-neutral-100 p-1 rounded-full overflow-hidden isolate">
      {/* 动画滑块背景 */}
      <div
        className="absolute left-1 top-1 bottom-1 bg-neutral-900 rounded-full shadow-sm transition-transform duration-300 ease-in-out z-0"
        style={{
          width: `calc((100% - 8px) / ${options.length})`,
          transform: `translateX(calc(${activeIndex * 100}%))`
        }}
      />
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`flex-1 relative z-10 text-[11px] py-1.5 px-3 rounded-full transition-colors duration-300 tracking-wide font-medium
            ${value === opt.value
              ? 'text-white'
              : 'text-neutral-500 hover:text-neutral-700'}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── PopBeads Pixel Art Logo ──
// Logo path 已移至 @/lib/constants.ts 共享

/* ── 响应式路由入口：< 768px 显示移动端，≥ 768px 显示桌面端 ── */
export default function ResponsivePage() {
  const isDesktop = useMediaQuery('(min-width: 768px)', true);
  // SSR 默认渲染桌面端，客户端挂载后根据屏幕宽度动态切换
  return isDesktop ? <DesktopGeneratorPage /> : <MobileGeneratorPage />;
}

function DesktopGeneratorPage() {
  /* ── 核心状态 ──────────────────────────────────────────────── */
  const [file, setFile] = useState<File | null>(null);          // 用户上传的文件对象
  const [preview, setPreview] = useState<string | null>(null);  // 上传图片的本地预览 URL
  const [svgContent, setSvgContent] = useState<string | null>(null); // 后端返回的 SVG 字符串
  const [stats, setStats] = useState<any>(null);                // 后端返回的颜色统计数据
  const [isGenerating, setIsGenerating] = useState(false);      // 生成中loading状态
  const [showColorCodes, setShowColorCodes] = useState(true);   // 是否在 SVG 上显示色号标签
  const [highlightHex, setHighlightHex] = useState<string | null>(null); // 当前高亮的颜色 hex 值
  const [grayscaleMode, setGrayscaleMode] = useState(false);     // 单色（灰度）显示模式

  /* ── 画布缩放与平移 ────────────────────────────────────────── */
  // 使用 ref 做拖拽性能优化，仅在停止操作时同步到 state 触发渲染
  const [scale, setScale] = useState(1);                        // 当前缩放倍率
  const [translate, setTranslate] = useState({ x: 0, y: 0 });   // 当前平移偏移
  const isPanningRef = useRef(false);     // 是否正在拖拽
  const panStartRef = useRef({ x: 0, y: 0 });  // 拖拽起点
  const translateRef = useRef({ x: 0, y: 0 });  // 实时平移值(ref)
  const scaleRef = useRef(1);             // 实时缩放值(ref)
  const canvasRef = useRef<HTMLDivElement>(null);      // 画布容器 DOM
  const svgWrapperRef = useRef<HTMLDivElement>(null);   // SVG 包裹 DOM

  /* ── 生成器参数 ────────────────────────────────────────────── */
  const [sizeMode, setSizeMode] = useState('height');           // 'height' | 'width' — 按行还是按列
  const [sizeValue, setSizeValue] = useState([64]);             // 网格尺寸数值 (16~256)
  const [quantization, setQuantization] = useState('lab');      // 'lab' | 'rgb' — 颜色匹配算法
  const [dithering, setDithering] = useState('none');           // 'none' | 'floyd_steinberg' — 抖动处理
  const [resizeMode, setResizeMode] = useState('fit');          // 'fit' | 'stretch' | 'pad' — 图片缩放模式
  const [pixelStyle, setPixelStyle] = useState('square');       // 'square' | 'circle' — 珠子形状
  const [maxColors, setMaxColors] = useState('0');              // '0' = 全部 221 色，其他限制色数
  const [mergeThreshold, setMergeThreshold] = useState([0]);    // 合并相似色阈值 (0=不合并, 1~15)

  /* ── 导出菜单 ─────────────────────────────────────────────── */
  const [showExportMenu, setShowExportMenu] = useState(false);  // 导出下拉菜单是否展开

  /* ── 文件拖放回调 — 重置所有状态 ──────────────────────────── */
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      setFile(selectedFile);
      const objectUrl = URL.createObjectURL(selectedFile);
      setPreview(objectUrl);
      setSvgContent(null);
      setStats(null);
      setHighlightHex(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1
  });

  /* ── 生成拼豆图纸 — 调用 /api/generate 接口 ──────────────── */
  const handleGenerate = async () => {
    if (!file) return;
    setIsGenerating(true);
    setSvgContent(null);
    setStats(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('size_mode', sizeMode === 'height' ? 'rows' : 'cols');
    formData.append('size_value', sizeValue[0].toString());
    formData.append('quantization_method', quantization);
    formData.append('dithering', (dithering === 'floyd_steinberg').toString());
    formData.append('resize_mode', resizeMode);
    formData.append('max_colors', maxColors);
    formData.append('merge_threshold', mergeThreshold[0].toString());
    formData.append('pixel_style', (pixelStyle !== 'square').toString());
    formData.append('grayscale', grayscaleMode.toString());

    try {
      const response = await axios.post(`${API_BASE}/api/generate`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSvgContent(response.data.svg);
      setStats(response.data.stats);
      setScale(1);
      setTranslate({ x: 0, y: 0 });
      translateRef.current = { x: 0, y: 0 };
      scaleRef.current = 1;
      setHighlightHex(null);
    } catch (error: any) {
      console.error("Error generating pattern:", error);
      const detail = error?.response?.data?.detail || error?.message;
      alert(detail ? `生成图纸失败：${detail}` : "生成图纸失败，请确保后端服务已启动。");
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Zoom & Pan (direct DOM manipulation, bypass React re-render) ──
  const applyTransform = useCallback(() => {
    const el = svgWrapperRef.current;
    if (el) {
      // 仅用 translate 做平移，缩放通过修改 SVG 的 width/height 实现矢量级清晰
      el.style.transform = `translate(${translateRef.current.x}px, ${translateRef.current.y}px)`;
      const svg = el.querySelector('svg');
      if (svg) {
        const vb = svg.viewBox.baseVal;
        svg.setAttribute('width', String(vb.width * scaleRef.current));
        svg.setAttribute('height', String(vb.height * scaleRef.current));
      }
    }
  }, []);

  // Debounced state sync — batches rapid scroll/pan into a single re-render
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncStateFromRefs = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      setScale(scaleRef.current);
      setTranslate({ ...translateRef.current });
    }, 150);
  }, []);

  const zoomIn = () => {
    scaleRef.current = Math.min(scaleRef.current * 1.3, 10);
    applyTransform(); syncStateFromRefs();
  };
  const zoomOut = () => {
    scaleRef.current = Math.max(scaleRef.current / 1.3, 0.1);
    applyTransform(); syncStateFromRefs();
  };
  const resetView = () => {
    // 根据 SVG 原始尺寸与画布容器尺寸，按最长边适配缩放
    const canvas = canvasRef.current;
    const wrapper = svgWrapperRef.current;
    const svg = wrapper?.querySelector('svg');
    let fitScale = 1;
    if (canvas && svg) {
      const vb = svg.viewBox.baseVal;
      const svgW = vb.width || svg.clientWidth;
      const svgH = vb.height || svg.clientHeight;
      const padding = 16; // 留一点边距
      const cW = canvas.clientWidth - padding * 2;
      const cH = canvas.clientHeight - padding * 2;
      if (svgW > 0 && svgH > 0 && cW > 0 && cH > 0) {
        fitScale = Math.min(cW / svgW, cH / svgH);
      }
    }
    scaleRef.current = fitScale; translateRef.current = { x: 0, y: 0 };
    applyTransform();
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    setScale(fitScale); setTranslate({ x: 0, y: 0 });
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 / 1.15 : 1.15;
    scaleRef.current = Math.min(Math.max(scaleRef.current * delta, 0.1), 10);
    applyTransform();
    syncStateFromRefs();
  }, [applyTransform, syncStateFromRefs]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      isPanningRef.current = true;
      panStartRef.current = {
        x: e.clientX - translateRef.current.x,
        y: e.clientY - translateRef.current.y,
      };
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current) return;
    translateRef.current = {
      x: e.clientX - panStartRef.current.x,
      y: e.clientY - panStartRef.current.y,
    };
    applyTransform();
  }, [applyTransform]);

  const handleMouseUp = useCallback(() => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setTranslate({ ...translateRef.current });
    }
  }, []);

  // ── Export functions ──
  const getExportSvg = () => {
    if (!svgContent) return '';
    if (!showColorCodes) {
      return svgContent.replace('<g id="bead-grid">', '<g id="bead-grid" class="hide-labels">');
    }
    return svgContent;
  };

  const exportSVG = () => {
    const svg = getExportSvg();
    if (!svg) return;
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'svg');
  };

  const exportBitmap = async (format: 'png' | 'jpg') => {
    const svg = getExportSvg();
    if (!svg) return;
    // Parse SVG to get dimensions
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return;
    const w = parseInt(svgEl.getAttribute('width') || '800');
    const h = parseInt(svgEl.getAttribute('height') || '600');
    // Render to canvas at 2x for high quality
    const dpr = 2;
    const canvas = document.createElement('canvas');
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    // Draw white background for JPG
    if (format === 'jpg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, w, h);
    }
    const img = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0, w, h);
        resolve();
      };
      img.onerror = reject;
      img.src = url;
    });
    URL.revokeObjectURL(url);
    const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
    const quality = format === 'jpg' ? 0.95 : undefined;
    canvas.toBlob((b) => {
      if (b) downloadBlob(b, format);
    }, mimeType, quality);
  };

  const exportPDF = async () => {
    const svg = getExportSvg();
    if (!svg) return;
    try {
      const response = await axios.post(`${API_BASE}/api/export/pdf`, svg, {
        headers: { 'Content-Type': 'image/svg+xml' },
        responseType: 'blob',
      });
      downloadBlob(response.data, 'pdf');
    } catch {
      // Fallback: print the SVG via browser
      const printWin = window.open('', '_blank');
      if (printWin) {
        printWin.document.write(`<!DOCTYPE html><html><head><title>拼豆图纸</title></head><body style="margin:0">${svg}</body></html>`);
        printWin.document.close();
        printWin.print();
      }
    }
  };

  const downloadBlob = (blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pingdou_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Close export menu on outside click
  useEffect(() => {
    const handler = () => setShowExportMenu(false);
    if (showExportMenu) document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showExportMenu]);

  // 当图片最初生成完成时触发一次居中适配缩放
  useEffect(() => {
    if (svgContent && !isGenerating) {
      // 延迟两帧等待 DOM 的 width/height 完全注册到位
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resetView();
        });
      });
    }
  }, [svgContent, isGenerating]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Compute highlighted SVG via string replacement (survives React re-renders) ──
  const displaySvg = useMemo(() => {
    if (!svgContent) return '';
    if (!highlightHex) return svgContent;

    // Inject highlight-active class on the grid group
    let svg = svgContent.replace(
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
      new RegExp('(class="hl-match" [^/]*/>\n<text class=")(color-label")', 'g'),
      '$1hl-match $2'
    );

    return svg;
  }, [svgContent, highlightHex]);

  // ── 通过修改 SVG 的 width/height 属性实现矢量缩放（避免 CSS transform scale 光栅化锯齿）──
  const scaledSvg = useMemo(() => {
    if (!displaySvg) return '';
    return displaySvg.replace(
      /(<svg[^>]*?)\bwidth="([\d.]+)"([^>]*?)\bheight="([\d.]+)"/,
      (_, before, w, mid, h) =>
        `${before}width="${parseFloat(w) * scale}"${mid}height="${parseFloat(h) * scale}"`
    );
  }, [displaySvg, scale]);

  return (
    /* ══ 最外层容器 ══
       h-screen: 占满视口高度
       bg-neutral-100: 🔧 页面背景色（浅灰）
       font-sans: 使用 Geist 无衬线字体
       overflow-hidden: 禁止页面滚动，各区域内部单独滚动 */
    <div className="h-screen flex flex-col bg-neutral-100 font-sans overflow-hidden">

      {/* ══ 三栏布局容器 — flex 横向排列，占满剩余空间 ══ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ══ 左侧面板: Logo + 上传 + 参数 + 生成按钮 ══
            🔧 w-72: 左栏宽度 (288px)，可改为 w-64(256px) 或 w-80(320px)
            border-r: 右边框
            bg-white: 🔧 左栏背景色
            flex flex-col: 内部垂直布局 */}
        <aside className="w-72 flex-shrink-0 border-r border-neutral-200/60 bg-white flex flex-col">

          {/* 🔧 Logo 区域 — 顶部品牌栏
              h-14: 固定高度，保证与右侧工具栏对齐
              border-b: 底部分割线
              图标: 定制像素风 Logo */}
          <div className="flex items-center justify-between px-5 h-14 border-b border-neutral-200/60 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <svg viewBox={POPBEADS_LOGO_VIEWBOX} className="w-[140px] text-neutral-800" shapeRendering="crispEdges">
                <path fill="currentColor" d={POPBEADS_LOGO_PATH} />
              </svg>
              <h1 className="sr-only">PopBeads</h1>
            </div>
            <a href="https://github.com/qqg603976986-bit/pingdou.git" target="_blank" rel="noopener noreferrer" className="text-neutral-400 hover:text-neutral-800 transition-colors rounded-full hover:bg-neutral-100 p-1.5 active:scale-95">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
          </div>

          {/* 🔧 左栏可滚动内容区域 — 包含上传区 + 参数区 */}
          <div className="flex-1 overflow-y-auto">

            {/* ── 上传图片区域 ──────────────────────────────────────
                包含两种状态: 未上传(拖放区) 和 已上传(图片预览) ── */}
            <div className="p-5 border-b border-neutral-100">
              <div className="flex items-center gap-2 text-[14px] font-normal text-black uppercase tracking-widest mb-3 font-pingfang">
                <Upload className="w-3.5 h-3.5" />
                上传图片
              </div>
              {/* ── 未上传状态: 拖放区域 ──
                  🔧 拖放区样式:
                    border-2 border-dashed: 虚线边框
                    rounded-2xl: 大圆角 (16px)
                    p-6: 内边距
                    拖拽激活时: border-neutral-400 bg-neutral-50 scale-[1.02] (微放大)
                    默认态: border-neutral-200，悬停变深 */}
              {!preview ? (
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 active:scale-[0.98] active:bg-neutral-100
                    ${isDragActive ? 'border-neutral-400 bg-neutral-50 scale-[1.02]' : 'border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50'}`}
                >
                  <input {...getInputProps()} />
                  <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-sm text-neutral-600 font-medium">拖放或点击上传</p>
                  <p className="text-[11px] text-neutral-400 mt-1.5 tracking-wide">JPG / PNG / WEBP</p>
                </div>
              ) : (
                /* ── 已上传状态: 图片预览卡片 ──
                    🔧 预览图样式:
                      h-28: 预览图高度 (112px)，可调大显示更多
                      object-cover: 裁剪填充
                      group-hover 悬停盖层: bg-black/40 半透明黑，显示「更换图片」按钮
                      底部文件名: bg-black/60 胶囊显示文件名 */
                <div className="relative group rounded-2xl overflow-hidden border border-neutral-200">
                  <img src={preview} alt="预览" className="w-full h-28 object-cover" />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); setSvgContent(null); setStats(null); setHighlightHex(null); }}
                    className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity text-white/80 hover:text-white drop-shadow-md"
                    title="删除图片"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div {...getRootProps()} className="cursor-pointer">
                      <input {...getInputProps()} />
                      <Button variant="secondary" size="sm" className="gap-1.5 text-xs rounded-full">
                        <Upload className="w-3.5 h-3.5" />
                        更换图片
                      </Button>
                    </div>
                  </div>
                  <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full max-w-[90%] truncate">
                    {file?.name}
                  </div>
                </div>
              )}
            </div>

            {/* ── 参数调整区域 ──────────────────────────────────────
                每个参数组结构: 标题(12px) + 说明文字(11px) + 控件
                参数组之间用 h-px bg-neutral-100 分割线隔开
                🔧 参数区内边距: p-5，参数组间距: space-y-5 ── */}
            <div className="p-5 space-y-5">
              <div className="flex items-center gap-2 text-[14px] font-normal text-black uppercase tracking-widest mb-3 font-pingfang">
                <Settings className="w-3.5 h-3.5" />
                参数调整
              </div>

              {/* 🔧 网格尺寸 — ToggleGroup(行/列) + Slider + 数字输入框
                  Slider: min=16 max=256 step=1
                  Input: min=16 max=512，h-8 w-16 调整输入框尺寸 */}
              {/* Grid Size */}
              <div className="space-y-1">
                <div className="text-[13px] font-medium text-neutral-700 tracking-wide font-pingfang">
                  网格尺寸
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  控制图纸的分辨率，数值越大细节越多
                </p>
                <ToggleGroup
                  value={sizeMode}
                  onChange={setSizeMode}
                  options={[
                    { value: 'height', label: '按高度（行）' },
                    { value: 'width', label: '按宽度（列）' },
                  ]}
                />
                <div className="flex items-center gap-3">
                  <Slider value={sizeValue} onValueChange={setSizeValue} max={256} min={16} step={1} className="flex-1" />
                  <Input
                    type="number" value={sizeValue[0]}
                    onChange={(e) => setSizeValue([parseInt(e.target.value) || 16])}
                    min={16} max={512} className="h-8 text-xs w-16 flex-shrink-0 rounded-lg"
                  />
                </div>
              </div>

              <div className="h-px bg-neutral-100" />

              {/* 🔧 配色数量 — Select 下拉菜单
                  h-8: 下拉框高度
                  可添加更多选项: 复制 SelectItem 并修改 value/文字 */}
              {/* Colors */}
              <div className="space-y-1">
                <div className="text-[13px] font-medium text-neutral-700 tracking-wide font-pingfang">
                  配色数量 <span className="text-[10px] text-neutral-400 font-normal ml-1 border border-neutral-200 px-1 py-0.5 rounded-md relative -top-[1px]">Mard 色号</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  根据你实际拥有的拼豆色板选择可用颜色数
                </p>
                <Select value={maxColors} onValueChange={setMaxColors}>
                  <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
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
              <div className="space-y-1 mt-2">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-medium text-neutral-700 tracking-wide font-pingfang">
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

              {/* 🔧 颜色匹配算法 — ToggleGroup(Lab/RGB) */}
              {/* Color Matching */}
              <div className="space-y-1">
                <div className="text-[13px] font-medium text-neutral-700 tracking-wide font-pingfang">
                  颜色匹配
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Lab 模式按人眼感知匹配最近颜色，效果更自然<br />RGB 模式按数值直接匹配
                </p>
                <ToggleGroup
                  value={quantization}
                  onChange={setQuantization}
                  options={[
                    { value: 'lab', label: 'Lab 感知匹配' },
                    { value: 'rgb', label: 'RGB 直接匹配' },
                  ]}
                />
              </div>

              <div className="h-px bg-neutral-100" />

              {/* 🔧 抖动处理 — Switch 开关
                  开启: floyd_steinberg 算法，颜色过渡更平滑
                  关闭: 纯色填充，边缘更清晰 */}
              {/* Dithering */}
              <div className="space-y-1 my-4">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-medium text-neutral-700 tracking-wide font-pingfang">抖动处理</div>
                  <Switch
                    checked={dithering === 'floyd_steinberg'}
                    onCheckedChange={(v) => setDithering(v ? 'floyd_steinberg' : 'none')}
                  />
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  开启后颜色过渡更平滑，适合渐变多的图片<br />关闭则保持纯色填充
                </p>
              </div>

              <div className="h-px bg-neutral-100" />

              {/* 🔧 单色模式 — Switch 开关
                  开启: 将所有珠子颜色转为灰度，适合黑白打印
                  关闭: 正常彩色显示 */}
              <div className="space-y-1 my-4">
                <div className="flex items-center justify-between">
                  <div className="text-[13px] font-medium text-neutral-700 tracking-wide font-pingfang">单色模式</div>
                  <Switch
                    checked={grayscaleMode}
                    onCheckedChange={setGrayscaleMode}
                  />
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  开启后图纸以灰度显示
                </p>
              </div>

              <div className="h-px bg-neutral-100" />

              {/* 🔧 珠子样式 — ToggleGroup(方形/圆形) */}
              {/* Pixel Style */}
              <div className="space-y-1">
                <div className="text-[13px] font-medium text-neutral-700 tracking-wide font-pingfang">
                  珠子样式
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  方形适合查看像素效果，圆形更贴近实际拼豆成品
                </p>
                <ToggleGroup
                  value={pixelStyle}
                  onChange={setPixelStyle}
                  options={[
                    { value: 'square', label: '方形像素' },
                    { value: 'circle', label: '圆形拼豆' },
                  ]}
                />
              </div>

            </div>
          </div>

          {/* ── 生成按钮 — 固定在左栏底部，不随滚动 ───────────────
              🔧 按钮样式:
                bg-neutral-900: 按钮背景色（近黑）
                hover:bg-neutral-800: 悬停变亮
                text-white: 文字色
                h-11: 按钮高度 (44px)
                rounded-xl: 圆角 (12px)
                加载动画: Loader2 图标 + animate-spin
              🔧 底部容器:
                bg-neutral-50/50: 半透明背景
                border-t: 顶部分割线
                p-5: 内边距 */}
          <div className="flex-shrink-0 p-5 border-t border-neutral-100 bg-neutral-50/50">
            <div className="space-y-2.5">
              <Button
                className="w-full bg-neutral-900 hover:bg-neutral-800 text-white h-11 font-medium rounded-xl tracking-wide active:scale-[0.98] active:bg-neutral-950 transition-all duration-200"
                onClick={handleGenerate}
                disabled={!file || isGenerating}
              >
                {isGenerating ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />处理中...</>
                ) : (
                  <>生成拼豆图纸</>
                )}
              </Button>
            </div>
          </div>
        </aside>

        {/* ══ 中央画布区域 ══
            flex-1: 占满剩余宽度
            bg-neutral-100: 🔧 画布背景色
            内部结构: 工具栏(顶部) + 画布(主体) */}
        <main className="flex-1 flex flex-col overflow-hidden bg-neutral-100">

          {/* ── 顶部工具栏 ──
              左侧: 缩放控件（缩小/百分比/放大/重置）
              右侧: 状态标签 + 高亮取消 + 色号切换 + 导出下拉
              🔧 工具栏高度: h-14 (与左侧栏精确齐平 56px 高度)
              🔧 工具栏背景: bg-white border-b */}
          <div className="flex-shrink-0 flex items-center justify-between px-5 h-14 bg-white border-b border-neutral-200/60">
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg active:scale-95 transition-all duration-200" onClick={zoomOut} title="缩小">
                <ZoomOut className="w-4 h-4 text-neutral-500" />
              </Button>
              <span className="text-[11px] text-neutral-400 w-12 text-center font-mono tracking-wide">{Math.round(scale * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg active:scale-95 transition-all duration-200" onClick={zoomIn} title="放大">
                <ZoomIn className="w-4 h-4 text-neutral-500" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg active:scale-95 transition-all duration-200" onClick={resetView} title="重置视图">
                <Maximize className="w-4 h-4 text-neutral-500" />
              </Button>
            </div>

            {svgContent && (
              <div className="flex items-center gap-2">
                {highlightHex && (
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs gap-1.5 rounded-full border-neutral-300 text-neutral-600 hover:bg-neutral-100 active:scale-95 transition-all duration-200"
                    onClick={() => setHighlightHex(null)}
                  >
                    <span className="w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: highlightHex }} />
                    取消高亮
                  </Button>
                )}
                <Button
                  variant={showColorCodes ? "default" : "outline"}
                  size="sm" className="h-7 text-xs gap-1.5 rounded-full active:scale-95 transition-all duration-200"
                  onClick={() => setShowColorCodes(!showColorCodes)}
                >
                  <Tag className="w-3 h-3" />
                  {showColorCodes ? '隐藏色号' : '显示色号'}
                </Button>

                {/* 🔧 导出下拉菜单
                    按钮样式: h-7 rounded-full 胶囊形
                    菜单样式: rounded-xl shadow-lg 圆角投影
                    菜单项: px-3.5 py-2 ，悬停 hover:bg-neutral-50
                    支持格式: SVG / PNG / JPG / PDF */}
                <div className="relative">
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs gap-1.5 rounded-full active:scale-95 transition-all duration-200"
                    onClick={(e) => { e.stopPropagation(); setShowExportMenu(!showExportMenu); }}
                  >
                    <Download className="w-3 h-3" />
                    导出
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                  {showExportMenu && (
                    <div className="absolute right-0 top-full mt-1.5 bg-white border border-neutral-200 rounded-xl shadow-lg py-1.5 z-50 min-w-[140px]"
                      onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { exportSVG(); setShowExportMenu(false); }}
                        className="w-full text-left px-3.5 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2.5 tracking-wide active:scale-95 transition-all duration-200">
                        <span className="w-8 text-[11px] font-mono text-neutral-500">SVG</span>
                        矢量图
                      </button>
                      <button onClick={() => { exportBitmap('png'); setShowExportMenu(false); }}
                        className="w-full text-left px-3.5 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2.5 tracking-wide active:scale-95 transition-all duration-200">
                        <span className="w-8 text-[11px] font-mono text-neutral-500">PNG</span>
                        无损位图
                      </button>
                      <button onClick={() => { exportBitmap('jpg'); setShowExportMenu(false); }}
                        className="w-full text-left px-3.5 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2.5 tracking-wide active:scale-95 transition-all duration-200">
                        <span className="w-8 text-[11px] font-mono text-neutral-500">JPG</span>
                        压缩位图
                      </button>
                      <button onClick={() => { exportPDF(); setShowExportMenu(false); }}
                        className="w-full text-left px-3.5 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2.5 tracking-wide active:scale-95 transition-all duration-200">
                        <span className="w-8 text-[11px] font-mono text-neutral-500">PDF</span>
                        打印文档
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── 画布主体 ──
              🔧 画布样式:
                cursor-grab: 鼠标手型光标
                active:cursor-grabbing: 拖拽时变为抓取光标
                backgroundImage: 点阵背景图案（类似 PS 透明层）
                  - #d4d4d4: 🔧 点阵颜色
                  - 24px 24px: 🔧 点阵间距
              三种状态:
                1. 生成中: 半透明白色蒙层 + 加载动画
                2. 空状态: 图片图标 + 提示文字
                3. 已生成: SVG 内容显示（可缩放拖拽） */}
          <div
            ref={canvasRef}
            className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ backgroundImage: 'radial-gradient(circle, #d4d4d4 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          >
            {isGenerating && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/60 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3 text-neutral-500">
                  <Loader2 className="w-10 h-10 animate-spin" />
                  <p className="text-sm font-medium tracking-wide">正在生成像素画...</p>
                </div>
              </div>
            )}

            {!svgContent && !isGenerating && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-neutral-400 space-y-3">
                  <ImageIcon className="w-16 h-16 mx-auto opacity-20" />
                  <p className="text-sm tracking-wide">上传照片并点击「生成拼豆图纸」</p>
                </div>
              </div>
            )}

            {svgContent && !isGenerating && (
              <div className="absolute inset-0 flex items-center justify-center" style={{ pointerEvents: 'none' }}>
                <div
                  ref={svgWrapperRef}
                  className={`${!showColorCodes ? 'hide-labels' : ''}`}
                  style={{
                    transform: `translate(${translate.x}px, ${translate.y}px)`,
                    transformOrigin: 'center center',
                    pointerEvents: 'auto',
                    lineHeight: 0,
                  }}
                  dangerouslySetInnerHTML={{ __html: scaledSvg }}
                />
              </div>
            )}
          </div>
        </main>

        {/* ══ 右侧面板: 颜色统计 ══
            🔧 面板宽度:
              有统计数据时: w-64 (256px)
              无数据时: w-0 收起
              transition-all duration-300: 展开/收起动画时长 300ms
            内部结构:
              - 顶部: 总珠数 + 颜色数 概览胶囊
              - 主体: 颜色列表，点击可高亮对应颜色在图纸中的位置 */}
        <aside className={`flex-shrink-0 border-l border-neutral-200/60 bg-white flex flex-col transition-all duration-300 overflow-hidden
          ${stats ? 'w-64' : 'w-0 border-l-0'}`}>
          {stats && (
            <>
              {/* ── 统计头部 — 总珠数 & 颜色数概览
                  🔧 高度: h-14，与左、中两栏强制精确对齐
                  🔧 布局: flex-row，左侧标题，右侧数据，保证单行 */}
              <div className="flex-shrink-0 flex items-center justify-between px-5 h-14 border-b border-neutral-200/60">
                <div className="flex items-center gap-1.5 text-[14px] font-medium text-black font-pingfang">
                  <Palette className="w-3.5 h-3.5" />
                  颜色统计
                </div>
                <div className="flex items-center gap-2 text-[11px] text-neutral-500 font-mono tracking-wide">
                  <span>共 <strong className="text-neutral-700">{stats.total_beads}</strong> 颗</span>
                  <span className="w-px h-3 bg-neutral-200"></span>
                  <span><strong className="text-neutral-700">{stats.unique_colors}</strong> 色</span>
                </div>
              </div>

              {/* ── 颜色列表 — 可滚动，点击高亮/取消高亮 ──
                  🔧 每行颜色项结构:
                    左: 色块 (w-7 h-7 rounded-lg)
                    右上: 色号(font-mono) + 数量
                    右下: 颜色名称 + 百分比
                  🔧 高亮状态: bg-neutral-100 ring-1 ring-neutral-300
                  🔧 非高亮项透明度: opacity-35 */}
              <div className="flex-1 overflow-y-auto p-4">
                {stats.color_table && stats.color_table.length > 0 && (
                  <div className="space-y-1">
                    {stats.color_table.map((c: any, i: number) => (
                      <div
                        key={i}
                        className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all duration-300 text-xs active:scale-[0.97]
                          ${highlightHex === c.hex
                            ? 'bg-neutral-100 ring-1 ring-neutral-300 shadow-sm'
                            : 'hover:bg-neutral-50'}
                          ${highlightHex && highlightHex !== c.hex ? 'opacity-30 scale-[0.98]' : 'opacity-100 scale-100'}`}
                        title={`${c.code} ${c.name}\n点击高亮该颜色在图纸中的位置`}
                        onClick={() => setHighlightHex(prev => prev === c.hex ? null : c.hex)}
                      >
                        <div
                          className="w-7 h-7 rounded-lg border border-black/5 flex-shrink-0"
                          style={{ backgroundColor: c.hex }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold text-neutral-700 tracking-wide">{c.code}</span>
                            <span className="text-neutral-400">×{c.count}</span>
                          </div>
                          <div className="flex items-center justify-between mt-0.5">
                            <span className="text-[10px] text-neutral-400 truncate">{c.name}</span>
                            <span className="text-[10px] text-neutral-400">{c.percentage}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      {/* ── 全局 CSS 注入 ──────────────────────────────────────────
          这些样式通过 <style jsx global> 注入到全局，控制 SVG 渲染效果:

          🔧 .hide-labels .color-label
            → 隐藏 SVG 上的色号标签文字

          🔧 .highlight-active rect/circle[data-hex]
            → 非高亮珠子的透明度 (opacity: 0.12)，越小则越淡化

          🔧 .highlight-active .hl-match
            → 高亮匹配项的透明度 (opacity: 1)，保持完全不透明

          🔧 .highlight-active .color-label
            → 非高亮项的色号标签透明度 (opacity: 0.1) */}
      <style jsx global>{`
        .hide-labels .color-label { display: none !important; }
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
