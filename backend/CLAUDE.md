# backend/CLAUDE.md

[根目录](../CLAUDE.md) > **backend**

---

## 模块职责

FastAPI 后端服务，负责：
1. 暴露 RESTful API 供前端调用
2. 处理上传的招标文件（PDF/Word），提取文本与表格
3. 调用 OpenAI 兼容 API，实现文档分析、目录生成、章节内容生成
4. 通过 Server-Sent Events（SSE）向前端推送流式响应
5. 管理用户的 API 配置（持久化到本地文件）
6. 提供网络搜索和网页内容读取能力
7. 生产模式下内嵌前端静态文件，作为单一服务部署

---

## 入口与启动

| 文件 | 说明 |
|---|---|
| `run.py` | 直接启动脚本，`uvicorn backend.app.main:app --reload` |
| `app/main.py` | FastAPI 应用实例，注册所有路由和中间件 |
| `app/config.py` | 应用全局配置（`Settings`，从 `.env` 读取） |

启动命令：
```bash
cd backend
python run.py
# 或
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 目录结构

```
backend/
├── app/
│   ├── main.py              # FastAPI 应用入口，CORS、路由注册、静态文件服务
│   ├── config.py            # 全局配置（app_name, CORS, 文件上传, 默认模型）
│   ├── models/
│   │   └── schemas.py       # 所有 Pydantic 请求/响应模型
│   ├── routers/             # 按业务拆分的路由模块（6个）
│   │   ├── config.py        # /api/config/*
│   │   ├── document.py      # /api/document/*（含 Word 导出）
│   │   ├── outline.py       # /api/outline/*
│   │   ├── content.py       # /api/content/*
│   │   ├── search.py        # /api/search/*
│   │   └── expand.py        # /api/expand/*
│   ├── services/            # 业务逻辑层
│   │   ├── openai_service.py    # OpenAI 异步客户端封装，核心 AI 能力
│   │   ├── file_service.py      # 文件上传、PDF/Word 文本提取、图片处理
│   │   └── search_service.py    # DuckDuckGo 搜索、网页内容抓取（多策略）
│   └── utils/
│       ├── config_manager.py    # 读写 ~/.ai_write_helper/user_config.json
│       ├── prompt_manager.py    # 所有 AI 提示词模板管理
│       ├── outline_util.py      # 目录节点分布计算工具
│       ├── json_util.py         # JSON 结构校验（check_json）
│       └── sse.py               # SSE 响应工具（sse_response）
├── mcp/
│   ├── server/duckduckgo/main.py  # MCP Server（独立进程）
│   └── client/test.py             # MCP 客户端测试
├── requirements.txt         # Python 依赖
├── run.py                   # 启动入口
└── .env.example             # 环境变量示例
```

---

## 对外接口（API 路由）

### 配置管理 `/api/config`
| 方法 | 路径 | 请求体 | 响应 | 说明 |
|---|---|---|---|---|
| POST | /api/config/save | `ConfigRequest` | `ConfigResponse` | 保存 API Key、base_url、model_name |
| GET | /api/config/load | - | `dict` | 加载已保存配置 |
| POST | /api/config/models | `ConfigRequest` | `ModelListResponse` | 获取模型列表（会先临时保存配置） |

### 文档处理 `/api/document`
| 方法 | 路径 | 请求体 | 响应 | 说明 |
|---|---|---|---|---|
| POST | /api/document/upload | `multipart/form-data` | `FileUploadResponse` | 上传 PDF/Word，返回提取文本 |
| POST | /api/document/analyze-stream | `AnalysisRequest` | SSE 流 | 流式分析文档（overview 或 requirements） |
| POST | /api/document/export-word | `WordExportRequest` | `application/vnd.openxmlformats...` | 将目录数据导出为 Word，支持 Markdown 渲染 |

### 目录管理 `/api/outline`
| 方法 | 路径 | 请求体 | 响应 | 说明 |
|---|---|---|---|---|
| POST | /api/outline/generate | `OutlineRequest` | SSE 流 | 两阶段并发生成目录（心跳保活+分片发送） |
| POST | /api/outline/generate-stream | `OutlineRequest` | SSE 流 | 流式生成目录（支持旧方案辅助） |

### 内容管理 `/api/content`
| 方法 | 路径 | 请求体 | 响应 | 说明 |
|---|---|---|---|---|
| POST | /api/content/generate-chapter | `ChapterContentRequest` | `{success, content}` | 同步生成单章节 |
| POST | /api/content/generate-chapter-stream | `ChapterContentRequest` | SSE 流 | 流式生成单章节 |

### 搜索 `/api/search`
| 方法 | 路径 | 请求体/查询参数 | 响应 | 说明 |
|---|---|---|---|---|
| POST/GET | /api/search/ | `SearchRequest` | `SearchResponse` | DuckDuckGo 搜索 |
| POST | /api/search/formatted | `SearchRequest` | `{formatted_results}` | 返回格式化文本 |
| POST | /api/search/load-url | `UrlContentRequest` | `UrlContentResponse` | 抓取网页内容（requests->Playwright->Selenium） |

### 方案扩写 `/api/expand`
| 方法 | 路径 | 请求体 | 响应 | 说明 |
|---|---|---|---|---|
| POST | /api/expand/upload | `multipart/form-data` | `FileUploadResponse` | 上传旧方案，AI 提取已有目录 JSON |

---

## 核心服务说明

### OpenAIService (`app/services/openai_service.py`)
- 使用 `openai.AsyncOpenAI` 异步客户端
- `stream_chat_completion()` — 底层流式调用，所有 AI 生成均基于此
- `_generate_with_json_check()` — 带 JSON 结构校验与自动重试（最多3次）的通用方法
- `generate_outline_v2()` — 两阶段目录生成：
  1. 串行生成一级提纲（与评分项一一对应）
  2. `asyncio.gather()` 并发补全所有一级节点的二三级目录
- `_generate_chapter_content()` — 流式生成单章节，接受上级/同级章节上下文

### FileService (`app/services/file_service.py`)
- PDF 解析策略（优先级）：`pdfplumber` → `PyMuPDF` → `PyPDF2`
- Word 解析策略（优先级）：`docx2python` → `python-docx`
- 支持提取表格内容（结构化 `[表格 N] ... [表格结束]` 格式）
- 支持提取内嵌图片并上传到外部图片服务器（`https://mt.agnet.top/image/upload`）

### SearchService (`app/services/search_service.py`)
- 基于 `duckduckgo-search` 库（无需 API Key）
- 网页内容抓取三级降级：`requests+BeautifulSoup` → `Playwright`（JS渲染）→ `SeleniumBase`（反检测）
- 默认区域：中国（`region="cn"`）

---

## 关键依赖

```
fastapi==0.116.1        # Web 框架
uvicorn[standard]==0.35.0  # ASGI 服务器
openai==1.106.1         # OpenAI 客户端
pdfplumber==0.11.7      # PDF 解析（主力）
pymupdf==1.26.4         # PDF 解析（备用）
docx2python==3.5.0      # Word 解析（主力）
python-docx==1.2.0      # Word 解析（备用）+ Word 生成
duckduckgo-search==8.1.1  # 搜索
playwright==1.51.0      # 网页抓取
mcp==1.13.1             # MCP Server 支持
```

---

## 配置管理

- 运行时配置保存路径：`~/.ai_write_helper/user_config.json`
- 字段：`api_key`, `base_url`, `model_name`
- 应用配置（`app/config.py`）：
  - CORS 允许源：`localhost:3000-3004`
  - 文件大小限制：10MB
  - 默认模型：`gpt-3.5-turbo`

---

## 数据模型（Pydantic）

| 模型 | 用途 |
|---|---|
| `ConfigRequest` | 保存/获取模型配置 |
| `FileUploadResponse` | 文件上传结果，含 `file_content` 和 `old_outline` |
| `AnalysisRequest` | 文档分析，`analysis_type` 枚举：`overview`/`requirements` |
| `OutlineItem` | 目录节点，支持递归嵌套（`children`） |
| `OutlineRequest` | 目录生成请求，含 `uploaded_expand` 标志 |
| `ChapterContentRequest` | 单章节生成，含 `parent_chapters`、`sibling_chapters` 上下文 |
| `WordExportRequest` | Word 导出，含完整 `outline` 树 |

---

## 开发注意事项

- SSE 响应必须使用 `utils/sse.py` 的 `sse_response()` 统一封装
- AI 生成 JSON 时必须经过 `utils/json_util.py` 的 `check_json()` 校验，失败自动重试
- 所有提示词集中在 `utils/prompt_manager.py`，修改提示词只改此文件
- 新增路由后需在 `app/main.py` 中 `app.include_router()` 注册
- 新增 Python 依赖必须同步更新 `requirements.txt` 和根目录 `build.py`
- 文件上传后临时存储在 `uploads/`，处理完毕后自动删除（`_safe_file_cleanup`）
- 目录生成使用 `asyncio.gather()` 并发，注意 OpenAI API 的并发限制

---

## 变更记录 (Changelog)

| 日期 | 内容 |
|---|---|
| 2026-03-15 | 初始化生成，覆盖全部6个路由、3个服务、5个工具的详细说明 |
