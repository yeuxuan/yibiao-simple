# backend/mcp/CLAUDE.md

[根目录](../../CLAUDE.md) > [backend](../CLAUDE.md) > **mcp**

---

## 模块职责

独立的 MCP（Model Context Protocol）Server 实现，对外暴露 DuckDuckGo 搜索工具，供支持 MCP 协议的 AI 客户端（如 Claude Desktop、自定义 MCP 客户端）调用。

此模块与主 FastAPI 服务**完全独立**，通过 stdio 协议运行，不共享端口或进程。

---

## 目录结构

```
backend/mcp/
├── server/
│   └── duckduckgo/
│       ├── main.py      # MCP Server 主程序
│       └── README.md    # 服务说明
└── client/
    └── test.py          # MCP 客户端连通性测试脚本
```

---

## 关键文件

### `server/duckduckgo/main.py`
- 基于 `mcp` 库（v1.13.1）实现 stdio 协议 MCP Server
- 注册单个工具：`duckduckgo_web_search`
- 内置速率限制：每秒 1 次、每月 15000 次
- 搜索最大返回 20 条，默认 10 条
- 查询长度上限：400 字符
- 搜索结果格式化为 Markdown

### `client/test.py`
- MCP 客户端连通性测试，验证 Server 启动和工具调用是否正常

---

## 对外工具接口

### `duckduckgo_web_search`

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `query` | string | 是 | 搜索关键词（最长 400 字符） |
| `count` | number | 否 | 返回数量（1-20，默认 10） |
| `safeSearch` | string | 否 | 安全过滤：`strict`/`moderate`/`off`（默认 `moderate`） |

返回：Markdown 格式的搜索结果文本，含标题、摘要、链接。

---

## 启动方式

```bash
# 直接运行（stdio 模式）
cd backend/mcp/server/duckduckgo
python main.py

# 在 MCP 客户端配置中引用（示例）
{
  "command": "python",
  "args": ["backend/mcp/server/duckduckgo/main.py"]
}
```

---

## 关键依赖

```
mcp==1.13.1              # MCP 协议库
duckduckgo-search==8.1.1  # 搜索能力（与主服务共用）
```

---

## 与主服务的关系

| 对比项 | MCP Server | FastAPI 主服务 |
|---|---|---|
| 运行方式 | 独立进程，stdio 通信 | HTTP 服务，端口 8000 |
| 调用方 | MCP 客户端（AI 工具） | 浏览器前端 |
| 搜索能力 | `duckduckgo_web_search` 工具 | `/api/search/*` 路由 |
| 底层实现 | 直接调用 `duckduckgo-search` | 通过 `search_service.py` 封装 |

---

## 开发注意事项

- MCP Server 所有日志输出到 `sys.stderr`，不影响 stdio 协议通信
- 速率限制为全局共享状态，重启后重置
- 搜索安全级别映射：`strict→on`、`moderate→moderate`、`off→off`

---

## 变更记录 (Changelog)

| 日期 | 内容 |
|---|---|
| 2026-03-15 | 初始化生成 |
