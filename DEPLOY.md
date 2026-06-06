# 部署文档

**架构**：阿里云 ECS（Go 后端）+ Vercel（React 前端）  
**前提**：域名、SSL 证书、Nginx 已配置完毕

---

## 一、ECS 后端部署

### 1.1 安装系统依赖

```bash
# PDF 逐页渲染为图片所需（pdftoppm 命令）
sudo apt update && sudo apt install -y poppler-utils

# 验证
pdftoppm -v
```

### 1.2 安装 Go

```bash
# 下载 Go 1.21（如已安装可跳过）
wget https://go.dev/dl/go1.21.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc
go version
```

### 1.3 上传代码并构建

**方式 A：本地编译后上传二进制（推荐）**

```bash
# 本地执行（Mac/Linux）
cd doc-chatbot/backend
GOOS=linux GOARCH=amd64 go build -o doc-chatbot-linux .

# 上传到 ECS
scp doc-chatbot-linux root@your-server:/opt/doc-chatbot/
scp .env root@your-server:/opt/doc-chatbot/
```

**方式 B：上传源码在 ECS 编译**

```bash
scp -r doc-chatbot/backend root@your-server:/opt/doc-chatbot/
ssh root@your-server
cd /opt/doc-chatbot && go mod tidy && go build -o doc-chatbot .
```

### 1.4 配置 .env

```bash
# ECS 上执行
vim /opt/doc-chatbot/.env
```

```env
QWEN_API_KEY=sk-xxx
QWEN_API_HOST=https://dashscope.aliyuncs.com/compatible-mode/v1
OCR_API_KEY=sk-xxx
OCR_API_HOST=https://dashscope.aliyuncs.com/compatible-mode/v1
WORKSPACE_ID=xxx
UPLOAD_DIR=/opt/doc-chatbot/uploads
PORT=8080
```

```bash
# 创建上传目录
mkdir -p /opt/doc-chatbot/uploads
```

### 1.5 配置 systemd 开机自启

```bash
sudo vim /etc/systemd/system/doc-chatbot.service
```

```ini
[Unit]
Description=Doc Chatbot Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/doc-chatbot
ExecStart=/opt/doc-chatbot/doc-chatbot-linux
Restart=on-failure
RestartSec=5s
EnvironmentFile=/opt/doc-chatbot/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable doc-chatbot
sudo systemctl start doc-chatbot

# 检查状态
sudo systemctl status doc-chatbot
```

### 1.6 Nginx 新增配置块

在现有 Nginx server 块中加入 `/api` 的反向代理：

```nginx
# 在 server { ... } 块内添加
location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;

    # SSE 流式输出必须关闭缓冲
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection '';
    chunked_transfer_encoding on;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE 长连接超时设置
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

```bash
sudo nginx -t && sudo nginx -s reload
```

> **注意**：`proxy_buffering off` 是 SSE 流式输出的关键，不加会导致 AI 回复卡到最后才一次性显示。

---

## 二、前端修改 & Vercel 部署

### 2.1 修改 API 地址

```ts
// frontend/src/api/files.ts 和 chat.ts 顶部
const BASE = 'https://yourdomain.com/api'   // 改为你的域名
```

### 2.2 修改后端 CORS

```go
// backend/main.go
app.Use(cors.New(cors.Config{
    AllowOrigins: "https://your-app.vercel.app",  // 改为 Vercel 分配的域名
    AllowMethods: "GET,POST,PATCH,DELETE,OPTIONS",
    AllowHeaders: "Content-Type,Authorization",
}))
```

### 2.3 部署到 Vercel

```bash
# 1. 推送代码到 GitHub
git add . && git commit -m "deploy" && git push

# 2. Vercel 控制台：New Project → 选仓库 → 配置如下
#    Framework Preset: Vite
#    Root Directory:   frontend
#    Build Command:    npm run build
#    Output Directory: dist

# 3. 部署完成后记录 Vercel 域名，填回后端 CORS 配置
```

**Vercel 环境变量**（如果不想把 API 地址硬编码）：

在 Vercel 控制台 → Settings → Environment Variables 添加：
```
VITE_API_BASE=https://yourdomain.com/api
```

前端代码改为：
```ts
const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8080/api'
```

---

## 三、验证部署

```bash
# 1. 检查后端服务
curl https://yourdomain.com/api/files
# 期望返回：[]

# 2. 检查 SSE 流式接口
curl -N -X POST https://yourdomain.com/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"你好","fileIds":[],"history":[]}'
# 期望看到流式 data: {...} 输出

# 3. 打开 Vercel 前端地址，上传文件测试完整流程
```

---

## 四、后续更新发布

**后端更新**：
```bash
# 本地重新编译
GOOS=linux GOARCH=amd64 go build -o doc-chatbot-linux .
scp doc-chatbot-linux root@your-server:/opt/doc-chatbot/
ssh root@your-server "sudo systemctl restart doc-chatbot"
```

**前端更新**：
```bash
git push  # Vercel 自动触发重新部署
```

---

## 五、已知注意事项

| 事项 | 说明 |
|------|------|
| 服务重启清空文件 | 设计如此（Session 级），重启后用户需重新上传 |
| 磁盘空间 | 定期检查 `/opt/doc-chatbot/uploads`，重启自动清空无需手动处理 |
| .env 安全 | 不要把含真实 Key 的 `.env` 提交到 Git，`.gitignore` 中已排除 |
| ECS 安全组 | 8080 端口无需对外开放，Nginx 代理即可，减少攻击面 |
