# 文档处理 ChatBot

基于 React + Go 的文档处理 ChatBot。用户可以上传 PDF、DOCX、TXT 和图片文件，管理文件列表，并基于选中的文件与 AI 文档助手进行流式对话。

## 功能概览

- 文件上传：支持点击上传、拖拽上传、聊天输入区附件上传。
- 文件管理：支持文件列表展示、选择上下文、重命名、删除、下载、重新解析。
- 文件解析：
  - TXT：本地直接读取文本。
  - DOCX：本地解压 XML 提取段落文本。
  - PDF：优先用 `pdftotext` 提取文本层；无文本层时用 `pdftoppm` 按页转图片，再调用 DashScope OCR。
  - 图片：调用 DashScope `qwen-vl-ocr` 识别文字。
- 聊天交互：基于已选文件内容组装上下文，调用 Qwen `qwen-plus`。
- 流式响应：后端通过 SSE 返回模型输出，前端实时渲染 Markdown。
- 断线续传：聊天输出断线后，前端可基于 `streamId + seq` 自动续拉后续内容，并平滑回放。
- Markdown 渲染：支持标题、列表、代码块、表格、引用等常见 Markdown。
- 导出：支持 AI 回复的 Markdown 导出；代码中也包含 PDF / DOCX 导出组件和工具。
- 会话级存储：文件和聊天流状态保存在 Go 进程内存中，服务重启后清空。

## 系统架构

```text
doc-chatbot/
├── backend/                 # Go + Fiber API 服务
│   ├── main.go              # 服务入口、路由、CORS、启动清理
│   ├── config/              # 环境变量配置
│   ├── handlers/            # HTTP API handler
│   ├── models/              # FileInfo、ChatRequest 等模型
│   ├── services/            # 文件解析、OCR、Qwen 调用
│   └── store/               # 内存文件状态和聊天流缓存
└── frontend/                # React + TypeScript + Vite 前端
    ├── src/api/             # 前端 API 封装
    ├── src/components/      # 聊天、文件管理、布局组件
    ├── src/store/           # Zustand 状态管理
    └── src/utils/           # 导出工具
```

### 后端

后端使用 Go + Fiber，提供两组核心 API：

- `/api/files/*`：文件上传、列表、状态、重命名、删除、下载、重新解析。
- `/api/chat/*`：流式聊天和断线续传。

文件上传后会先保存到 `UPLOAD_DIR`，并写入内存 Store，状态为 `pending`。解析完成后状态变为 `ready`，解析失败则为 `failed` 并返回 `parseError`。

聊天流采用 SSE。每次生成会创建一个内存聊天任务 `streamId`，每个 chunk 都有递增 `seq`。如果前端连接断开，可以通过：

```text
GET /api/chat/stream/:streamId?from=<lastSeq>
```

继续获取后续内容。

### 前端

前端使用 React + TypeScript + Vite + Tailwind CSS，状态管理使用 Zustand。

主要页面结构：

- 左侧：文件管理侧栏，包含上传区域、文件列表、选择状态、文件操作。
- 右侧：聊天区域，包含消息列表、Markdown 渲染、步骤提示、输入框。

前端通过 Vite dev proxy 将 `/api` 转发到后端 `http://localhost:8080`。

## 技术栈

| 层       | 技术                                         |
| -------- | -------------------------------------------- |
| 前端     | React 18、TypeScript、Vite、Tailwind CSS     |
| 状态管理 | Zustand                                      |
| Markdown | react-markdown、remark-gfm、rehype-highlight |
| 上传交互 | react-dropzone                               |
| 图标     | lucide-react                                 |
| 后端     | Go、Fiber v2                                 |
| 模型调用 | DashScope OpenAI Compatible API              |
| 聊天模型 | `qwen-plus`                                  |
| OCR 模型 | `qwen-vl-ocr`                                |
| PDF 工具 | `pdftotext`、`pdftoppm`                      |

## 环境要求

- Node.js 18+
- npm
- Go 1.21+
- Poppler 工具：
  - `pdftotext`
  - `pdftoppm`

macOS 可通过 Homebrew 安装 Poppler：

```bash
brew install poppler
```

Linux（Ubuntu/Debian）：

```bash
sudo apt-get install -y poppler-utils
```

## 环境变量

后端读取 `doc-chatbot/backend/.env`。可以从示例文件复制：

```bash
cd doc-chatbot/backend
cp .env.example .env
```

示例：

```env
QWEN_API_KEY=sk-xxx
QWEN_API_HOST=https://dashscope.aliyuncs.com/compatible-mode/v1

OCR_API_KEY=sk-xxx
OCR_API_HOST=https://dashscope.aliyuncs.com/compatible-mode/v1

WORKSPACE_ID=
UPLOAD_DIR=./uploads
PORT=8080
```

说明：

- `QWEN_API_HOST` 和 `OCR_API_HOST` 可以使用同一个 OpenAI Compatible 网关地址。
- 聊天和 OCR 不是靠 host 区分，而是靠请求里的 `model` 区分：
  - 聊天：`qwen-plus`
  - OCR：`qwen-vl-ocr`

## 启动方式

### 1. 启动后端

```bash
cd doc-chatbot/backend
go mod tidy
go run .
```

默认监听：

```text
http://localhost:8080
```

健康检查：

```bash
curl http://localhost:8080/api/files
```

预期返回：

```json
[]
```

注意：后端启动时会清空 `UPLOAD_DIR`，并重置内存 Store。

### 2. 启动前端

```bash
cd doc-chatbot/frontend
npm install
npm run dev
```

默认访问：

```text
http://localhost:5173
```

前端 dev server 会把 `/api` 请求代理到 `http://localhost:8080`。

## 构建与验证

后端测试：

```bash
cd doc-chatbot/backend
go test ./...
```

前端构建：

```bash
cd doc-chatbot/frontend
npm run build
```

## API 摘要

### 文件接口

| 方法   | 路径                      | 说明         |
| ------ | ------------------------- | ------------ |
| POST   | `/api/files/upload`       | 上传文件     |
| GET    | `/api/files`              | 获取文件列表 |
| GET    | `/api/files/:id/status`   | 获取解析状态 |
| GET    | `/api/files/:id/download` | 下载原始文件 |
| PATCH  | `/api/files/:id/rename`   | 重命名文件   |
| DELETE | `/api/files/:id`          | 删除文件     |
| POST   | `/api/files/:id/reparse`  | 重新解析     |

### 聊天接口

| 方法 | 路径                          | 说明                  |
| ---- | ----------------------------- | --------------------- |
| POST | `/api/chat/stream`            | 创建流式聊天          |
| GET  | `/api/chat/stream/:id?from=N` | 从指定 chunk 序号续传 |

## 已知限制

- 当前是单用户演示版本，没有登录、权限和多租户隔离。
- 文件和聊天流缓存只保存在内存中，后端重启后会丢失。
- PDF 扫描件先走本地，扫描不到再走走 OCR，速度取决于页数和 DashScope 响应时间。
- 断线续传只能在后端进程仍然存活时生效。
- 大文件和长文档会被截断或跳过部分上下文，以避免超过模型上下文限制。
