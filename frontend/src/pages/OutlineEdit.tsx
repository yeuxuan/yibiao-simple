/**
 * 目录编辑页面
 */
import React, { useState } from 'react';
import { OutlineData, OutlineItem } from '../types';
import { outlineApi, expandApi } from '../services/api';
import {
  ChevronRightIcon,
  ChevronDownIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  TrashIcon,
  PlusIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';

const Spinner = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={`animate-spin flex-shrink-0 ${className}`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

interface OutlineEditProps {
  projectOverview: string;
  techRequirements: string;
  outlineData: OutlineData | null;
  onOutlineGenerated: (outline: OutlineData) => void;
}

const OutlineEdit: React.FC<OutlineEditProps> = ({
  projectOverview,
  techRequirements,
  outlineData,
  onOutlineGenerated,
}) => {
  const [generating, setGenerating] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [expandFile, setExpandFile] = useState<File | null>(null);
  const [uploadedExpand, setuploadedExpand] = useState(false);
  const [oldOutline, setOldOutline] = useState<string | null>(null);
  const [oldDocument, setOldDocument] = useState<string | null>(null);

  const handleExpandUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setuploadedExpand(true);
      setMessage(null);
      const response = await expandApi.uploadExpandFile(file);
      if (response.data.success) {
        setExpandFile(file);
        setOldOutline(response.data.old_outline || null);
        setOldDocument(response.data.file_content || null);
        setMessage({ type: 'success', text: `方案文件已上传：${file.name}` });
      } else {
        throw new Error(response.data.message || '文件上传失败');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.message || error.message || '文件上传失败' });
    }
  };

  const handleGenerateOutline = async () => {
    if (!projectOverview || !techRequirements) {
      setMessage({ type: 'error', text: '请先完成文档分析' });
      return;
    }
    try {
      setGenerating(true);
      setMessage(null);
      setStreamingContent('');

      const response = await outlineApi.generateOutlineStream({
        overview: projectOverview,
        requirements: techRequirements,
        uploaded_expand: uploadedExpand,
        old_outline: oldOutline || undefined,
        old_document: oldDocument || undefined,
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      let result = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.chunk) {
                result += parsed.chunk;
                setStreamingContent(result);
              }
            } catch (e) {}
          }
        }
      }

      try {
        const outlineJson = JSON.parse(result);
        onOutlineGenerated(outlineJson);
        setMessage({ type: 'success', text: '目录结构生成完成' });
        setStreamingContent('');
        const allIds = new Set<string>();
        const collectIds = (items: OutlineItem[]) => {
          items.forEach(item => {
            allIds.add(item.id);
            if (item.children) collectIds(item.children);
          });
        };
        collectIds(outlineJson.outline);
        setExpandedItems(allIds);
      } catch {
        throw new Error('解析目录结构失败');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || '目录生成失败' });
      setStreamingContent('');
    } finally {
      setGenerating(false);
    }
  };

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const startEditing = (item: OutlineItem) => {
    setEditingItem(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description);
  };

  const cancelEditing = () => {
    setEditingItem(null);
    setEditTitle('');
    setEditDescription('');
  };

  const saveEdit = () => {
    if (!outlineData || !editingItem) return;
    const updateItem = (items: OutlineItem[]): OutlineItem[] =>
      items.map(item => {
        if (item.id === editingItem) return { ...item, title: editTitle.trim(), description: editDescription.trim() };
        if (item.children) return { ...item, children: updateItem(item.children) };
        return item;
      });
    onOutlineGenerated({ ...outlineData, outline: updateItem(outlineData.outline) });
    cancelEditing();
    setMessage({ type: 'success', text: '目录项已更新' });
  };

  const reorderItems = (items: OutlineItem[], parentPrefix: string = ''): OutlineItem[] =>
    items.map((item, index) => {
      const newId = parentPrefix ? `${parentPrefix}.${index + 1}` : `${index + 1}`;
      return { ...item, id: newId, children: item.children ? reorderItems(item.children, newId) : undefined };
    });

  const deleteItem = (itemId: string) => {
    if (!outlineData) return;
    if (window.confirm('确定要删除这个目录项吗？')) {
      const deleteFromItems = (items: OutlineItem[]): OutlineItem[] =>
        items.filter(item => {
          if (item.id === itemId) return false;
          if (item.children) item.children = deleteFromItems(item.children);
          return true;
        });
      const filtered = deleteFromItems(outlineData.outline);
      onOutlineGenerated({ ...outlineData, outline: reorderItems(filtered) });
      setMessage({ type: 'success', text: '目录项已删除' });
    }
  };

  const addChildItem = (parentId: string) => {
    if (!outlineData) return;
    const findNextId = (items: OutlineItem[], targetId: string): string | null => {
      for (const item of items) {
        if (item.id === targetId) {
          const existingChildren = item.children || [];
          let max = 0;
          existingChildren.forEach(child => {
            const parts = child.id.split('.');
            const n = parseInt(parts[parts.length - 1]);
            if (!isNaN(n)) max = Math.max(max, n);
          });
          return `${parentId}.${max + 1}`;
        }
        if (item.children) {
          const result = findNextId(item.children, targetId);
          if (result) return result;
        }
      }
      return null;
    };
    const newId = findNextId(outlineData.outline, parentId) || `${parentId}.1`;
    const newItem: OutlineItem = { id: newId, title: '新目录项', description: '请编辑描述' };
    const addToItems = (items: OutlineItem[]): OutlineItem[] =>
      items.map(item => {
        if (item.id === parentId) return { ...item, children: [...(item.children || []), newItem] };
        if (item.children) return { ...item, children: addToItems(item.children) };
        return item;
      });
    onOutlineGenerated({ ...outlineData, outline: addToItems(outlineData.outline) });
    setExpandedItems(prev => new Set(Array.from(prev).concat(parentId)));
    setTimeout(() => startEditing(newItem), 100);
    setMessage({ type: 'success', text: '子目录已添加' });
  };

  const addRootItem = () => {
    if (!outlineData) return;
    let maxNum = 0;
    outlineData.outline.forEach(item => {
      const n = parseInt(item.id.split('.')[0]);
      if (!isNaN(n)) maxNum = Math.max(maxNum, n);
    });
    const newItem: OutlineItem = { id: `${maxNum + 1}`, title: '新目录项', description: '请编辑描述' };
    onOutlineGenerated({ ...outlineData, outline: [...outlineData.outline, newItem] });
    setTimeout(() => startEditing(newItem), 100);
    setMessage({ type: 'success', text: '目录项已添加' });
  };

  // 色彩映射：一级蓝，二级石青，三级灰
  const levelColors = [
    'text-blue-700 font-semibold',
    'text-stone-700 font-medium',
    'text-stone-600 font-normal',
  ];

  const renderOutlineItem = (item: OutlineItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.id);
    const isEditing = editingItem === item.id;

    return (
      <div key={item.id}>
        <div
          className={`group flex items-start gap-2 py-1.5 px-2 rounded hover:bg-stone-50 ${level > 0 ? 'ml-6' : ''}`}
        >
          {/* 展开/折叠 or 叶节点图标 */}
          {hasChildren ? (
            <button
              onClick={() => toggleExpanded(item.id)}
              className="mt-0.5 p-0.5 text-stone-400 hover:text-stone-600 flex-shrink-0"
            >
              {isExpanded
                ? <ChevronDownIcon className="h-3.5 w-3.5" />
                : <ChevronRightIcon className="h-3.5 w-3.5" />
              }
            </button>
          ) : (
            <DocumentTextIcon className="mt-0.5 h-3.5 w-3.5 text-stone-300 flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-2 pr-2">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="form-input py-1 text-sm"
                  placeholder="目录标题"
                  autoFocus
                />
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="form-input py-1 text-xs resize-none"
                  placeholder="目录描述（可选）"
                />
                <div className="flex gap-2">
                  <button onClick={saveEdit} className="btn-primary py-1 px-3 text-xs">保存</button>
                  <button onClick={cancelEditing} className="btn-secondary py-1 px-3 text-xs">取消</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-sm truncate ${levelColors[Math.min(level, 2)]}`}>
                      <span className="text-stone-400 font-mono text-xs mr-1">{item.id}</span>
                      {item.title}
                    </span>
                    {item.content && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        已生成
                      </span>
                    )}
                  </div>

                  {/* 操作按钮 - hover 显示 */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => startEditing(item)}
                      className="p-1 rounded hover:bg-blue-50 text-stone-400 hover:text-blue-600"
                      title="编辑"
                    >
                      <PencilSquareIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => addChildItem(item.id)}
                      className="p-1 rounded hover:bg-emerald-50 text-stone-400 hover:text-emerald-600"
                      title="添加子目录"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="p-1 rounded hover:bg-red-50 text-stone-400 hover:text-red-600"
                      title="删除"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {item.description && (
                  <p className="text-xs text-stone-400 mt-0.5 leading-relaxed truncate">{item.description}</p>
                )}
              </>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {item.children!.map(child => renderOutlineItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* 消息提示 */}
      {message && (
        <div className={message.type === 'success' ? 'alert-success' : 'alert-error'}>
          {message.text}
        </div>
      )}

      {/* 操作区域 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-heading">目录管理</h2>
        </div>

        <div className="flex items-center gap-3">
          {/* 方案扩写上传 */}
          <div>
            <input
              type="file"
              id="expand-file-upload"
              accept=".pdf,.doc,.docx"
              onChange={handleExpandUpload}
              className="hidden"
              disabled={uploadedExpand}
            />
            <label
              htmlFor="expand-file-upload"
              className={`btn-secondary gap-2 cursor-pointer ${uploadedExpand ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {uploadedExpand ? (
                <><Spinner className="w-3.5 h-3.5" />正在分析...</>
              ) : (
                <><ArrowUpTrayIcon className="w-3.5 h-3.5" />方案扩写</>
              )}
            </label>
          </div>

          <button
            onClick={handleGenerateOutline}
            disabled={generating || !projectOverview || !techRequirements}
            className="btn-primary gap-2"
          >
            {generating ? (
              <><Spinner className="w-3.5 h-3.5" />正在生成目录...</>
            ) : (
              '生成目录结构'
            )}
          </button>
        </div>

        {/* 已上传的方案文件 */}
        {expandFile && (
          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
            <DocumentTextIcon className="h-3.5 w-3.5 text-emerald-500" />
            已上传：<span className="font-medium">{expandFile.name}</span>
          </div>
        )}

        {/* 提示：未完成分析 */}
        {!projectOverview && !techRequirements && (
          <div className="mt-3 alert-warning">
            请先在「标书解析」步骤中完成文档分析，再生成目录。
          </div>
        )}

        {/* 流式内容预览 */}
        {generating && streamingContent && (
          <div className="mt-4 border border-stone-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-stone-50 border-b border-stone-200 flex items-center gap-2">
              <Spinner className="w-3 h-3 text-stone-500" />
              <span className="text-xs text-stone-500 font-medium">正在生成目录结构...</span>
            </div>
            <div className="p-4 bg-white max-h-44 overflow-y-auto">
              <pre className="text-xs text-stone-600 whitespace-pre-wrap font-mono leading-relaxed">
                {streamingContent}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* 目录树 */}
      {outlineData && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-stone-700">
              目录结构
              <span className="ml-2 text-xs font-normal text-stone-400">
                共 {outlineData.outline.length} 个一级章节
              </span>
            </h3>
            <button
              onClick={addRootItem}
              className="btn-ghost gap-1 text-xs py-1 px-2"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              添加章节
            </button>
          </div>

          <div className="bg-white border border-stone-200 rounded-lg p-3 max-h-[60vh] overflow-y-auto">
            {outlineData.outline.map(item => renderOutlineItem(item))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OutlineEdit;
