# Python Playwright 库介绍

## 简介

**Playwright** 是由微软开发的现代自动化测试和浏览器自动化工具，支持 Python、JavaScript、Java 和 .NET。它提供了强大的 API 来控制浏览器，执行自动化任务。

---

## 核心特点

| 特性 | 说明 |
|------|------|
| **多浏览器支持** | 支持 Chromium、Firefox 和 WebKit |
| **跨平台** | Windows、macOS、Linux 全平台兼容 |
| **自动等待** | 智能等待元素加载，无需手动 sleep |
| **多标签页/窗口** | 支持同时操作多个页面 |
| **模拟设备** | 可模拟移动设备、地理位置、权限等 |
| **录制功能** | 支持录制用户操作生成代码 |

---

## 安装

```bash
# 安装 Playwright
pip install playwright

# 安装浏览器（Chromium、Firefox、WebKit）
playwright install
```

---

## 快速开始

### 1. 启动浏览器并打开页面

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    # 启动浏览器（Chromium）
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()
    
    # 打开网页
    page.goto('https://www.example.com')
    
    # 获取页面标题
    print(page.title())
    
    # 关闭浏览器
    browser.close()
```

---

## 常用操作

### 点击元素

```python
# 通过选择器点击
page.click('button#submit')

# 通过文本内容点击
page.click('text=提交')

# 等待并点击
page.click('.button', timeout=5000)
```

### 填写表单

```python
# 填写输入框
page.fill('input[name="username"]', 'myuser')
page.fill('input[name="password"]', 'mypassword')

# 选择下拉框
page.select_option('select#city', 'beijing')

# 勾选复选框
page.check('input[type="checkbox"]')
```

### 获取元素信息

```python
# 获取文本内容
text = page.inner_text('h1.title')

# 获取属性值
href = page.get_attribute('a.link', 'href')

# 获取元素数量
count = page.locator('.item').count()
```

### 等待操作

```python
# 等待元素可见
page.wait_for_selector('.result', state='visible', timeout=10000)

# 等待页面加载完成
page.wait_for_load_state('networkidle')

# 等待特定文本出现
page.wait_for_selector('text=加载完成')
```

---

## 高级功能

### 截图

```python
# 全屏截图
page.screenshot(path='screenshot.png')

# 特定元素截图
element = page.locator('.chart')
element.screenshot(path='chart.png')

# 完整页面截图
page.screenshot(path='full.png', full_page=True)
```

### PDF 生成（仅 Chromium）

```python
page.pdf(path='page.pdf', format='A4')
```

### 模拟移动设备

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    context = browser.new_context(
        viewport={'width': 375, 'height': 667},
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)...'
    )
    page = context.new_page()
    page.goto('https://www.example.com')
    browser.close()
```

---

## 异步支持

```python
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto('https://www.example.com')
        print(await page.title())
        await browser.close()

asyncio.run(main())
```

---

## 代码生成器

Playwright 提供代码录制功能，可以自动生成脚本：

```bash
# 录制操作并生成代码
playwright codegen https://www.example.com
```

---

## 测试框架集成

Playwright 可以与 pytest 集成：

```bash
pip install pytest-playwright
```

```python
# test_example.py
def test_has_title(page):
    page.goto('https://playwright.dev/')
    assert page.title() == 'Fast and reliable end-to-end testing for modern web apps'
```

---

## 官方资源

- 📚 [官方文档](https://playwright.dev/python/)
- 💻 [GitHub 仓库](https://github.com/microsoft/playwright-python)
- 🎥 [教程视频](https://www.youtube.com/c/Playwright)

---

*文档创建于 2026年*
