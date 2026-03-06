/* ══════════════════════════════════════════════════════════════
   共享常量 — 桌面端 & 移动端通用
   ══════════════════════════════════════════════════════════════ */

/** 后端 API 基础地址 */
export const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

/** PopBeads Logo 视口尺寸（与字符矩阵宽高一致） */
export const POPBEADS_LOGO_VIEWBOX = "0 0 39 5";

/**
 * PopBeads 像素风 Logo SVG path —— 由字符矩阵映射生成
 * 每个 '#' 对应 1x1 的像素方块
 */
export const POPBEADS_LOGO_PATH = [
    "#### #### #### ###  ### ### ###  ###",
    "#  # #  # #  # #  # #   # # #  # #  ",
    "#### #  # #### #### ### ### #  # ###",
    "#    #  # #    #  # #   # # #  #   #",
    "#    #### #    ###  ### # # ###  ###",
]
    .flatMap((r, y) =>
        r
            .split("")
            .map((c, x) => (c === "#" ? `M${x} ${y}h1v1h-1Z` : ""))
            .filter(Boolean)
    )
    .join("");
