/**
 * 内容编辑页面 - 完整标书预览和生成
 */
import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { OutlineData, OutlineItem } from '../types';
import {
  DocumentTextIcon,
  PlayIcon,
  DocumentArrowDownIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowUpIcon,
} from '@heroicons/react/24/outline';
import { contentApi, ChapterContentRequest, documentApi } from '../services/api';
import { saveAs } from 'file-saver';
import { draftStorage } from '../utils/draftStorage';

interface ContentEditProps {
  outlineData: OutlineData | null;
  selectedChapter: string;
  onChapterSelect: (chapterId: string) => void;
}

interface GenerationProgress {
  total: number;
  completed: number;
  current: string;
  failed: string[];
  generating: Set<string>;
}

const ContentEdit: React.FC<ContentEditProps> = ({
  outlineData,
  selectedChapter,
  onChapterSelect,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress>({
    total: 0,
    completed: 0,
    current: '',
    failed: [],
    generating: new Set<string>(),
  });
  const [leafItems, setLeafItems] = useState<OutlineItem[]>([]);
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  const collectLeafItems = useCallback((items: OutlineItem[]): OutlineItem[] => {
    let leaves: OutlineItem[] = [];
    items.forEach(item => {
      if (!item.children || item.children.length === 0) {
        leaves.push(item);
      } else {
        leaves = leaves.concat(collectLeafItems(item.children));
      }
    });
    return leaves;
  }, []);

  const getParentChapters = useCallback((targetId: string, items: OutlineItem[], parents: OutlineItem[] = []): OutlineItem[] => {
    for (const item of items) {
      if (item.id === targetId) return parents;
      if (item.children && item.children.length > 0) {
        const found = getParentChapters(targetId, item.children, [...parents, item]);
        if (found.length > 0 || item.children.some(child => child.id === targetId)) {
          return found.length > 0 ? found : [...parents, item];
        }
      }
    }
    return [];
  }, []);

  const getSiblingChapters = useCallback((targetId: string, items: OutlineItem[]): OutlineItem[] => {
    if (items.some(item => item.id === targetId)) return items;
    for (const item of items) {
      if (item.children && item.children.length > 0) {
        const siblings = getSiblingChapters(targetId, item.children);
        if (siblings.length > 0) return siblings;
      }
    }
    return [];
  }, []);

  useEffect(() => {
    if (outlineData) {
      const leaves = collectLeafItems(outlineData.outline);
      const filtered = draftStorage.filterContentByOutlineLeaves(outlineData.outline);
      const mergedLeaves = leaves.map(leaf => {
        const cached = filtered[leaf.id];
        return cached ? { ...leaf, content: cached } : leaf;
      });
      draftStorage.saveContentById(filtered);
      setLeafItems(mergedLeaves);
      setProgress(prev => ({ ...prev, total: leaves.length }));
    }
  }, [outlineData, collectLeafItems]);

  useEffect(() => {
    const scrollContainer = document.getElementById('app-main-scroll');
    const handleScroll = () => {
      const scrollTop = scrollContainer
        ? scrollContainer.scrollTop
        : (window.pageYOffset || document.documentElement.scrollTop);
      setShowScrollToTop(scrollTop > 300);
    };
    handleScroll();
    const target: any = scrollContainer || window;
    target.addEventListener('scroll', handleScroll);
    return () => target.removeEventListener('scroll', handleScroll);
  }, []);

  const getLeafItemContent = (itemId: string): string | undefined => {
    return leafItems.find(leaf => leaf.id === itemId)?.content;
  };

  const isLeafNode = (item: OutlineItem): boolean =>
    !item.children || item.children.length === 0;

  const generateItemContent = async (item: OutlineItem, projectOverview: string): Promise<OutlineItem> => {
    if (!outlineData) throw new Error('缺少目录数据');

    setProgress(prev => ({
      ...prev,
      current: item.title,
      generating: new Set([...Array.from(prev.generating), item.id]),
    }));

    try {
      const parentChapters = getParentChapters(item.id, outlineData.outline);
      const siblingChapters = getSiblingChapters(item.id, outlineData.outline);
      const request: ChapterContentRequest = {
        chapter: item,
        parent_chapters: parentChapters,
        sibling_chapters: siblingChapters,
        project_overview: projectOverview,
      };

      const response = await contentApi.generateChapterContentStream(request);
      if (!response.ok) throw new Error('生成失败');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      let content = '';
      const updatedItem = { ...item };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.status === 'streaming' && parsed.full_content) {
                content = parsed.full_content;
                updatedItem.content = content;
                draftStorage.upsertChapterContent(item.id, content);
                setLeafItems(prevItems => {
                  const newItems = [...prevItems];
                  const index = newItems.findIndex(i => i.id === item.id);
                  if (index !== -1) newItems[index] = { ...updatedItem };
                  return newItems;
                });
              } else if (parsed.status === 'completed' && parsed.content) {
                content = parsed.content;
                updatedItem.content = content;
                draftStorage.upsertChapterContent(item.id, content);
              } else if (parsed.status === 'error') {
                throw new Error(parsed.message);
              }
            } catch (e) {}
          }
        }
      }

      return updatedItem;
    } catch (error) {
      setProgress(prev => ({ ...prev, failed: [...prev.failed, item.title] }));
      throw error;
    } finally {
      setProgress(prev => {
        const newGenerating = new Set(Array.from(prev.generating));
        newGenerating.delete(item.id);
        return { ...prev, generating: newGenerating };
      });
    }
  };

  const handleGenerateContent = async () => {
    if (!outlineData || leafItems.length === 0) return;
    setIsGenerating(true);
    setProgress({ total: leafItems.length, completed: 0, current: '', failed: [], generating: new Set<string>() });

    try {
      const concurrency = 5;
      const updatedItems = [...leafItems];
      for (let i = 0; i < leafItems.length; i += concurrency) {
        const batch = leafItems.slice(i, i + concurrency);
        const promises = batch.map(item =>
          generateItemContent(item, outlineData.project_overview || '')
            .then(updatedItem => {
              const index = updatedItems.findIndex(ui => ui.id === updatedItem.id);
              if (index !== -1) updatedItems[index] = updatedItem;
              setProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
              return updatedItem;
            })
            .catch(error => {
              console.error(`生成内容失败 ${item.title}:`, error);
              setProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
              return item;
            })
        );
        await Promise.all(promises);
      }
      setLeafItems(updatedItems);
    } catch (error) {
      console.error('生成内容时出错:', error);
    } finally {
      setIsGenerating(false);
      setProgress(prev => ({ ...prev, current: '', generating: new Set<string>() }));
    }
  };

  const getLatestContent = (item: OutlineItem): string => {
    if (!item.children || item.children.length === 0) {
      return leafItems.find(leaf => leaf.id === item.id)?.content || item.content || '';
    }
    return item.content || '';
  };

  const scrollToTop = () => {
    const scrollContainer = document.getElementById('app-main-scroll');
    if (scrollContainer) {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExportWord = async () => {
    if (!outlineData) return;
    try {
      const buildExportOutline = (items: OutlineItem[]): OutlineItem[] =>
        items.map(item => ({
          ...item,
          content: getLatestContent(item),
          children: item.children ? buildExportOutline(item.children) : undefined,
        }));

      const exportPayload = {
        project_name: outlineData.project_name,
        project_overview: outlineData.project_overview,
        outline: buildExportOutline(outlineData.outline),
      };

      const response = await documentApi.exportWord(exportPayload);
      if (!response.ok) throw new Error('导出失败');
      const blob = await response.blob();
      saveAs(blob, `${outlineData.project_name || '标书文档'}.docx`);
    } catch (error) {
      console.error('导出失败:', error);
      alert('导出失败，请重试');
    }
  };

  // 渲染目录结构和内容
  const renderOutline = (items: OutlineItem[], level: number = 1): React.ReactElement[] => {
    return items.map(item => {
      const isLeaf = isLeafNode(item);
      const currentContent = isLeaf ? getLeafItemContent(item.id) : item.content;
      const headingClass =
        level === 1
          ? 'font-serif text-xl font-semibold text-stone-900'
          : level === 2
          ? 'font-serif text-base font-semibold text-stone-800'
          : 'text-sm font-semibold text-stone-700';

      return (
        <div key={item.id} className={level === 1 ? 'mb-10' : 'mb-5'}>
          {/* 标题 */}
          <div className={`${headingClass} mb-1.5`}>
            <span className="text-stone-400 font-mono text-xs font-normal mr-2">{item.id}</span>
            {item.title}
          </div>

          {/* 描述 */}
          {item.description && (
            <p className="text-xs text-stone-400 mb-3 leading-relaxed">{item.description}</p>
          )}

          {/* 叶节点内容 */}
          {isLeaf && (
            <div className="border-l-2 border-stone-100 pl-4 mb-4">
              {currentContent ? (
                <div className="prose prose-sm max-w-none prose-stone text-stone-700">
                  <ReactMarkdown>{currentContent}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-stone-300 italic py-2">
                  {progress.generating.has(item.id) ? (
                    <span className="text-blue-500 not-italic">正在生成内容...</span>
                  ) : (
                    '内容待生成'
                  )}
                </p>
              )}
            </div>
          )}

          {/* 子章节 */}
          {item.children && item.children.length > 0 && (
            <div className={level >= 2 ? 'ml-4' : ''}>
              {renderOutline(item.children, level + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  if (!outlineData) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="bg-white border border-stone-200 rounded-lg p-8">
          <div className="text-center py-12">
            <DocumentTextIcon className="mx-auto h-10 w-10 text-stone-200" />
            <h3 className="mt-4 font-serif text-base text-stone-400">暂无内容</h3>
            <p className="mt-1 text-sm text-stone-400">
              请先在「目录编辑」步骤中生成目录结构
            </p>
          </div>
        </div>
      </div>
    );
  }

  const completedItems = leafItems.filter(item => item.content).length;
  const progressPercent = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* 顶部工具栏 */}
      <div className="bg-white border border-stone-200 rounded-lg px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-heading">标书内容</h2>
            <p className="text-xs text-stone-400 mt-0.5">
              共 {leafItems.length} 个章节，已生成 {completedItems} 个
              {progress.failed.length > 0 && (
                <span className="text-red-500 ml-2">失败 {progress.failed.length} 个</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerateContent}
              disabled={isGenerating}
              className="btn-primary gap-2"
            >
              <PlayIcon className="w-4 h-4" />
              {isGenerating ? '生成中...' : '生成标书'}
            </button>
            <button
              onClick={handleExportWord}
              disabled={isGenerating}
              className="btn-secondary gap-2"
            >
              <DocumentArrowDownIcon className="w-4 h-4" />
              导出 Word
            </button>
          </div>
        </div>

        {/* 进度条 */}
        {isGenerating && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-stone-500 mb-1.5">
              <span>{progress.current ? `正在生成：${progress.current}` : '正在准备...'}</span>
              <span>{progress.completed} / {progress.total}</span>
            </div>
            <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 文档主体 */}
      <div className="bg-white border border-stone-200 rounded-lg">
        <div className="px-10 py-10">
          {/* 文档标题 */}
          <h1 className="font-serif text-3xl font-bold text-stone-900 mb-8 text-center">
            {outlineData.project_name || '投标技术文件'}
          </h1>

          {/* 项目概述 */}
          {outlineData.project_overview && (
            <div className="border-l-4 border-blue-200 pl-5 mb-10 py-1">
              <h2 className="font-serif text-sm font-semibold text-stone-500 uppercase tracking-wider mb-2">项目概述</h2>
              <p className="text-sm text-stone-700 leading-relaxed">{outlineData.project_overview}</p>
            </div>
          )}

          {/* 分隔线 */}
          <div className="border-t border-stone-100 mb-10" />

          {/* 目录结构和内容 */}
          <div>
            {renderOutline(outlineData.outline)}
          </div>
        </div>
      </div>

      {/* 底部统计 */}
      <div className="bg-white border border-stone-200 rounded-lg px-5 py-3">
        <div className="flex items-center justify-between text-xs text-stone-500">
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5">
              <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
              已完成 {completedItems} 个
            </div>
            <div className="flex items-center gap-1.5">
              <DocumentTextIcon className="w-3.5 h-3.5 text-stone-300" />
              待生成 {leafItems.length - completedItems} 个
            </div>
            {progress.failed.length > 0 && (
              <div className="flex items-center gap-1.5 text-red-500">
                <ExclamationCircleIcon className="w-3.5 h-3.5" />
                失败 {progress.failed.length} 个
              </div>
            )}
          </div>
          <span>
            总字数：{leafItems.reduce((sum, item) => sum + (item.content?.length || 0), 0).toLocaleString()}
          </span>
        </div>
      </div>

      {/* 回到顶部 */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-20 right-6 w-9 h-9 bg-stone-800 hover:bg-stone-900 text-white rounded-full flex items-center justify-center shadow-md transition-all duration-200 focus:outline-none z-[60]"
          aria-label="回到顶部"
        >
          <ArrowUpIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

export default ContentEdit;
