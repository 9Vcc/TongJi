# 本地字体文件

本目录用于存放本地化的 Fira Sans / Fira Code 字体文件，供 `index.html` 中 `@font-face` 声明引用。

## 需要下载的字体文件

请将以下 woff2 字体文件下载并放置到本目录：

- `FiraSans-Regular.woff2`（Fira Sans 400）
- `FiraSans-Medium.woff2`（Fira Sans 500）
- `FiraSans-SemiBold.woff2`（Fira Sans 600）
- `FiraCode-Regular.woff2`（Fira Code 400）

## 下载源

### 方式一：Google Fonts GitHub 镜像（推荐，可直接获取 woff2）

- Fira Sans: https://github.com/google/fonts/tree/main/ofl/firasans
- Fira Code: https://github.com/google/fonts/tree/main/ofl/firacode

### 方式二：项目官方仓库

- Fira Sans（Mozilla）: https://github.com/mozilla/Fira
- Fira Code（tonsky）: https://github.com/tonsky/FiraCode/releases

### 方式三：Google Fonts 在线

- Fira Sans: https://fonts.google.com/specimen/Fira+Sans
- Fira Code: https://fonts.google.com/specimen/Fira+Code

> 注：Google Fonts 在线下载通常为 TTF 格式，可使用 [woff2_compress](https://github.com/google/woff2) 工具转换为 woff2。

## 说明

- 字体文件未放置前，页面将使用系统字体回退栈（`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`）渲染，不影响功能可用性。
- `@font-face` 已设置 `font-display: swap`，确保字体加载期间文字始终可见，避免首屏文字闪烁阻塞。
- Vite 会自动从 `public` 目录提供静态文件，引用路径为 `/fonts/<文件名>.woff2`。
