# 拼豆工坊 — 前端

基于 [Next.js](https://nextjs.org) + [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) 构建的拼豆图纸生成器 Web 界面。

## 技术栈

- **框架**：Next.js 16 (App Router)
- **语言**：TypeScript
- **样式**：Tailwind CSS 4
- **UI 组件**：shadcn/ui (Radix UI)
- **HTTP 客户端**：Axios
- **文件上传**：react-dropzone
- **图标**：Lucide React

## 启动开发服务器

```bash
npm install
npm run dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000) 查看页面。

## 构建生产版本

```bash
npm run build
npm start
```

## 配置说明

- [next.config.ts](next.config.ts) — Next.js 配置（含 `allowedDevOrigins` 跨域配置）
- [components.json](components.json) — shadcn/ui 组件配置
- [tsconfig.json](tsconfig.json) — TypeScript 配置

## 与后端通信

前端通过 `POST http://localhost:8000/api/generate` 向 FastAPI 后端发送 `multipart/form-data` 请求，后端返回 Base64 编码的图纸图片和统计数据。
