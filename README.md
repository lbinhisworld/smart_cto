# 企业信息与商业画布查询

前端页面：输入公司名称，点击查询，对接后端 API 展示企业基本信息与 BMC 商业画布。

## 解决「无法访问此网站 / ERR_CONNECTION_REFUSED」

说明：**有程序在对应端口监听时，浏览器才能连上**。请按下面区分情况处理。

| 你访问的地址 | 原因 | 做法 |
|-------------|------|------|
| 例如 `http://localhost:3000`（前端页面） | 没有启动前端静态服务 | 在本项目目录执行：`npx serve .`，再打开终端里显示的地址（如 http://localhost:3000） |
| 点击「查询」后报错、或你访问的是 `http://localhost:8000` | 没有启动后端 API | 先去**后端项目目录**启动 API（如 `deno run --allow-net main.ts`），并保证 `main.js` 里 `API_URL` 的端口（如 8000）与后端一致 |

**推荐本地联调步骤：**

1. 终端一：在**后端项目**里启动 API（端口例如 8000）。
2. 终端二：在本项目目录执行 `npx serve .`，记下输出的地址（如 http://localhost:3000）。
3. 浏览器打开该地址，输入公司名称并点击查询。

## 使用方式

1. **配置后端地址**  
   在 `main.js` 顶部修改 `API_URL` 为你的后端地址，例如：
   - 本地：`http://localhost:8000`
   - 线上：`https://你的域名`

2. **后端接口约定**  
   - 方法：`POST`
   - 请求体：`{ "companyName": "企业名称" }`
   - 成功：`{ "success": true, "data": { "basic_info", "business_model_canvas", "metadata" } }`
   - 失败：`{ "error": "错误信息" }`，HTTP 状态码 400 / 404 / 500

3. **本地预览**  
   - 用本地服务器（推荐，避免 file 协议限制）：
     ```bash
     npx serve .
     ```
     然后访问终端里提示的地址（如 `http://localhost:3000`）。
   - 或直接双击打开 `index.html`（此时查询会请求 `main.js` 里配置的 API_URL，需后端已启动）。

4. **跨域**  
   若前端与 API 不同域，需在后端配置 CORS（允许前端所在域名和 `Content-Type: application/json`）。

## 文件说明

- `index.html`：页面结构（搜索框、加载、错误、基本信息、BMC、元数据）
- `styles.css`：样式与 BMC 九宫格布局
- `main.js`：请求 API、渲染结果、加载与错误处理
