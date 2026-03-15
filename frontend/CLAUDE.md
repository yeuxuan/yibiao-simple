# frontend/CLAUDE.md

[根目录](../CLAUDE.md) > **frontend**

---

## 模块职责

React + TypeScript 前端 SPA，负责：
1. 呈现三步式标书写作流程（标书解析 → 目录编辑 → 正文编辑）
2. 管理全局应用状态（`useAppState` Hook）
3. 封装所有后端 API 调用（`services/api.ts`）
4. 使用 localStorage 持久化草稿，防止刷新丢失
5. 渲染 AI 流式输出（SSE 数据实时展示）
6. 支持导出完整 Word 文档

---

## 入口与启动

| 文件 | 说明 |
|---|---|
| `src/index.tsx` | React 应用挂载入口 |
| `src/App.tsx` | 根组件，布局骨架，根据 `currentStep` 路由到各页面 |
| `public/index.html` | HTML 模板 |

启动命令：
```bash
cd frontend
npm install
npm start         # 开发服务器，默认 http://localhost:3000
npm run build     # 生产构建，输出到 build/
npm test          # 运行测试
```

环境变量（`frontend/.env` 或 `frontend/.env.example`）：
```
REACT_APP_API_URL=http://localhost:8000
```

---

## 目录结构

```
frontend/src/
├── App.tsx                    # 根组件，三步流程布局骨架
├── App.css                    # 全局样式补充
├── index.tsx                  # React DOM 挂载
├── index.css                  # Tailwind CSS 导入
├── components/
│   ├── ConfigPanel.tsx        # 左侧配置面板（API Key、base_url、模型选择）
│   └── StepBar.tsx            # 顶部步骤导航条
├── pages/
│   ├── DocumentAnalysis.tsx   # 步骤 0：上传文档，流式提取概述和评分要求
│   ├── OutlineEdit.tsx        # 步骤 1：生成/编辑三级目录，支持旧方案上传
│   └── ContentEdit.tsx        # 步骤 2：查看/编辑各章节正文，导出 Word
├── hooks/
│   └── useAppState.ts         # 全局状态管理 Hook（含 draftStorage 集成）
├── services/
│   └── api.ts                 # Axios 封装 + Fetch SSE 封装，全部 API 调用
├── types/
│   └── index.ts               # TypeScript 核心类型定义
└── utils/
    └── draftStorage.ts        # localStorage 草稿持久化工具
```

---

## 页面组件说明

### DocumentAnalysis（步骤 0）
- 文件拖拽/点击上传，调用 `/api/document/upload`
- 点击"解析概述"和"解析评分要求"分别流式调用 `/api/document/analyze-stream`
- 实时累积 SSE chunks 展示在文本域中
- 上传新文件时调用 `draftStorage.clearAll()` 清空所有缓存

### OutlineEdit（步骤 1）
- 可选上传旧方案文件（`/api/expand/upload`），AI 提取已有目录
- 调用 `/api/outline/generate`（SSE心跳模式，等待完成后分片发送结果）
  或 `/api/outline/generate-stream`（有旧方案时使用）
- 目录树展示（三级，可展开/折叠）
- 单章节"生成内容"按钮，调用 `/api/content/generate-chapter-stream`

### ContentEdit（步骤 2）
- 左侧目录树，点击切换当前章节
- 右侧编辑区，支持 Markdown 预览和纯文本编辑
- 章节内容实时保存到 `draftStorage.upsertChapterContent()`
- 顶部"导出 Word"按钮，调用 `/api/document/export-word`，触发浏览器下载

---

## 全局状态（useAppState）

| 状态字段 | 类型 | 说明 |
|---|---|---|
| `currentStep` | number | 当前步骤（0/1/2） |
| `config` | ConfigData | API Key、base_url、model_name |
| `fileContent` | string | 上传文件提取的原始文本 |
| `projectOverview` | string | AI 提取的项目概述 |
| `techRequirements` | string | AI 提取的技术评分要求 |
| `outlineData` | OutlineData | 完整目录树（含章节内容） |
| `selectedChapter` | string | 当前选中章节 id |

所有状态变更方法均会调用 `draftStorage.saveDraft()` 同步持久化。

---

## 草稿持久化（draftStorage）

文件：`src/utils/draftStorage.ts`

| localStorage Key | 内容 |
|---|---|
| `yibiao:draft:v1` | 步骤、文件内容、概述、评分要求、目录结构、选中章节 |
| `yibiao:contentById:v1` | 章节 id → 正文内容 映射表 |

关键方法：
- `loadDraft()` — 初始加载，`useAppState` 初始化时调用
- `saveDraft(partial)` — 增量合并保存，每次状态变更后调用
- `clearAll()` — 上传新文件时清空所有缓存
- `filterContentByOutlineLeaves(outline)` — 按当前目录叶子节点过滤内容，防止目录变更后错误回填

注意：localStorage 通常限制 5-10MB，大正文可能触发 `QUOTA_EXCEEDED_ERR`（已做 try/catch）。

---

## API 服务封装（api.ts）

- Axios 实例：`baseURL = REACT_APP_API_URL || 'http://localhost:8000'`，超时 120s
- SSE 接口使用原生 `fetch()` + `ReadableStream` 读取，不经过 Axios
- 方案扩写上传超时特殊设置为 300s（5分钟），避免大文件超时

| 导出对象 | 说明 |
|---|---|
| `configApi` | `saveConfig`, `loadConfig`, `getModels` |
| `documentApi` | `uploadFile`, `analyzeDocumentStream`, `exportWord` |
| `outlineApi` | `generateOutline`, `generateOutlineStream` |
| `contentApi` | `generateChapterContent`, `generateChapterContentStream` |
| `expandApi` | `uploadExpandFile` |

---

## 核心类型定义（types/index.ts）

```typescript
interface ConfigData {
  api_key: string;
  base_url?: string;
  model_name: string;
}

interface OutlineItem {
  id: string;       // 如 "1", "1.1", "1.1.2"
  title: string;
  description: string;
  children?: OutlineItem[];
  content?: string; // 叶子节点正文
}

interface OutlineData {
  outline: OutlineItem[];
  project_name?: string;
  project_overview?: string;
}

interface AppState {
  currentStep: number;
  config: ConfigData;
  fileContent: string;
  projectOverview: string;
  techRequirements: string;
  outlineData: OutlineData | null;
  selectedChapter: string;
}
```

---

## 关键依赖

```json
{
  "react": "^19.1.1",
  "typescript": "^4.9.5",
  "tailwindcss": "^3.4.17",
  "axios": "^1.11.0",
  "react-markdown": "^10.1.0",
  "@heroicons/react": "^2.2.0",
  "@headlessui/react": "^2.2.7",
  "docx": "^9.5.1",          // 客户端 Word 相关
  "file-saver": "^2.0.5",
  "prism-react-renderer": "^2.4.1"  // 代码高亮
}
```

---

## 开发注意事项

- 所有文字使用简体中文
- Tailwind CSS 原子类优先，避免写内联样式
- SSE 流读取使用 `response.body.getReader()` + `TextDecoder`，注意处理 `[DONE]` 结束信号
- 导出 Word 使用 `fetch` + `blob()` 触发浏览器下载，需设置正确的 `Content-Disposition` 文件名（UTF-8 编码）
- 状态更新使用 `useCallback` 包裹，避免不必要的重渲染
- 草稿保存只保存必要字段，不保存 `config`（含 API Key，不适合存 localStorage）

---

## 测试

- 测试文件：`src/App.test.tsx`（基础渲染测试）
- 测试工具：`@testing-library/react` + `@testing-library/jest-dom`
- 执行：`npm test`

---

## 变更记录 (Changelog)

| 日期 | 内容 |
|---|---|
| 2026-03-15 | 初始化生成，覆盖页面组件、状态管理、草稿持久化、API 封装的详细说明 |
