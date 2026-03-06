"use client";

import { useState, useEffect } from "react";

/**
 * 响应式媒体查询 Hook
 *
 * SSR 安全：服务端渲染时返回 defaultValue（默认 false）。
 * 客户端挂载后通过 matchMedia 检测，并监听窗口变化自动切换。
 *
 * @param query - CSS 媒体查询字符串，如 "(min-width: 768px)"
 * @param defaultValue - SSR 时的默认返回值
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
    const [matches, setMatches] = useState(defaultValue);

    useEffect(() => {
        const mql = window.matchMedia(query);
        // 立即同步一次
        setMatches(mql.matches);

        const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
        mql.addEventListener("change", handler);
        return () => mql.removeEventListener("change", handler);
    }, [query]);

    return matches;
}
