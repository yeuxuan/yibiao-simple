/**
 * 文档分析页面
 */
import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { documentApi } from '../services/api';
import { ArrowUpTrayIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { draftStorage } from '../utils/draftStorage';

const Spinner = () => (
  <svg className="animate-spin w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

interface DocumentAnalysisProps {
  fileContent: string;
  projectOverview: string;
  techRequirements: string;
  onFileUpload: (content: string) => void;
  onAnalysisComplete: (overview: string, requirements: string) => void;
}

const DocumentAnalysis: React.FC<DocumentAnalysisProps> = ({
  fileContent,
  projectOverview,
  techRequirements,
  onFileUpload,
  onAnalysisComplete,
}) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [localOverview, setLocalOverview] = useState(projectOverview);
  const [localRequirements, setLocalRequirements] = useState(techRequirements);

  const normalizeLineBreaks = (text: string) => {
    if (!text) return text;
    return text
      .replace(/\\n/g, '\n')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
  };

  const [currentAnalysisStep, setCurrentAnalysisStep] = useState<'overview' | 'requirements' | null>(null);
  const [streamingOverview, setStreamingOverview] = useState('');
  const [streamingRequirements, setStreamingRequirements] = useState('');

  const markdownComponents = {
    p: ({ children }: any) => <p className="mb-3 leading-relaxed text-sm text-stone-700" style={{ whiteSpace: 'pre-wrap' }}>{children}</p>,
    ul: ({ children }: any) => <ul className="mb-4 pl-5 space-y-1.5 list-disc text-stone-700">{children}</ul>,
    ol: ({ children }: any) => <ol className="mb-4 pl-5 space-y-1.5 list-decimal text-stone-700">{children}</ol>,
    li: ({ children }: any) => <li className="text-sm leading-relaxed">{children}</li>,
    h1: ({ children }: any) => <h1 className="text-base font-semibold mb-3 text-stone-900 border-b border-stone-200 pb-2">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-sm font-semibold mb-2 text-stone-800">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-sm font-medium mb-2 text-stone-700">{children}</h3>,
    strong: ({ children }: any) => <strong className="font-semibold text-stone-900">{children}</strong>,
    em: ({ children }: any) => <em className="italic text-stone-600">{children}</em>,
    blockquote: ({ children }: any) => <blockquote className="border-l-2 border-stone-300 pl-4 my-3 italic text-stone-500">{children}</blockquote>,
    code: ({ children }: any) => <code className="bg-stone-100 px-1.5 py-0.5 rounded text-xs font-mono text-stone-700">{children}</code>,
    table: ({ children }: any) => <table className="w-full border-collapse border border-stone-200 my-3 text-sm">{children}</table>,
    thead: ({ children }: any) => <thead className="bg-stone-50">{children}</thead>,
    th: ({ children }: any) => <th className="border border-stone-200 px-3 py-2 text-left font-semibold text-xs text-stone-700">{children}</th>,
    td: ({ children }: any) => <td className="border border-stone-200 px-3 py-2 text-xs text-stone-600">{children}</td>,
    br: () => <br />,
  };

  const streamingComponents = {
    p: ({ children }: any) => <p className="mb-2 leading-snug text-xs text-blue-700" style={{ whiteSpace: 'pre-wrap' }}>{children}</p>,
    ul: ({ children }: any) => <ul className="mb-2 pl-4 space-y-0.5 list-disc">{children}</ul>,
    ol: ({ children }: any) => <ol className="mb-2 pl-4 space-y-0.5 list-decimal">{children}</ol>,
    li: ({ children }: any) => <li className="text-xs leading-snug text-blue-700">{children}</li>,
    h1: ({ children }: any) => <h1 className="text-sm font-semibold mb-2 text-blue-800">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-xs font-semibold mb-1 text-blue-700">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-xs font-medium mb-1 text-blue-700">{children}</h3>,
    strong: ({ children }: any) => <strong className="font-semibold text-blue-800">{children}</strong>,
    em: ({ children }: any) => <em className="italic text-blue-600">{children}</em>,
    br: () => <br />,
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      handleFileUpload(file);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setUploadedFile(file);
      handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      setUploading(true);
      setMessage(null);
      const response = await documentApi.uploadFile(file);
      if (response.data.success && response.data.file_content) {
        draftStorage.clearAll();
        onFileUpload(response.data.file_content);
        setMessage({ type: 'success', text: response.data.message });
      } else {
        setMessage({ type: 'error', text: response.data.message });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.response?.data?.detail || '文件上传失败' });
    } finally {
      setUploading(false);
    }
  };

  const handleAnalysis = async () => {
    if (!fileContent) {
      setMessage({ type: 'error', text: '请先上传文档' });
      return;
    }

    try {
      setAnalyzing(true);
      setMessage(null);
      setStreamingOverview('');
      setStreamingRequirements('');

      let overviewResult = '';
      let requirementsResult = '';
      const decoder = new TextDecoder();

      const processStream = async (response: Response, onChunk: (chunk: string) => void) => {
        const reader = response.body?.getReader();
        if (!reader) throw new Error('无法读取响应流');

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
                if (parsed.chunk) onChunk(parsed.chunk);
              } catch (e) {}
            }
          }
        }
      };

      setCurrentAnalysisStep('overview');
      const overviewResponse = await documentApi.analyzeDocumentStream({
        file_content: fileContent,
        analysis_type: 'overview',
      });
      await processStream(overviewResponse, (chunk) => {
        overviewResult += chunk;
        setStreamingOverview(normalizeLineBreaks(overviewResult));
      });
      setLocalOverview(normalizeLineBreaks(overviewResult));

      setCurrentAnalysisStep('requirements');
      const requirementsResponse = await documentApi.analyzeDocumentStream({
        file_content: fileContent,
        analysis_type: 'requirements',
      });
      await processStream(requirementsResponse, (chunk) => {
        requirementsResult += chunk;
        setStreamingRequirements(normalizeLineBreaks(requirementsResult));
      });
      setLocalRequirements(normalizeLineBreaks(requirementsResult));

      onAnalysisComplete(overviewResult, requirementsResult);
      setMessage({ type: 'success', text: '标书解析完成' });
      setStreamingOverview('');
      setStreamingRequirements('');
      setCurrentAnalysisStep(null);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || '标书解析失败' });
      setStreamingOverview('');
      setStreamingRequirements('');
      setCurrentAnalysisStep(null);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* 消息提示 */}
      {message && (
        <div className={message.type === 'success' ? 'alert-success' : 'alert-error'}>
          {message.text}
        </div>
      )}

      {/* 文件上传区域 */}
      <div>
        <h2 className="section-heading mb-4">文档上传</h2>
        <div
          className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-blue-400 bg-blue-50'
              : uploadedFile
              ? 'border-stone-300 bg-stone-50'
              : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50'
          }`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <Spinner />
              <p className="text-sm text-stone-500">正在上传并处理文件...</p>
            </div>
          ) : uploadedFile ? (
            <div className="flex flex-col items-center gap-3">
              <DocumentIcon className="w-10 h-10 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-stone-800">{uploadedFile.name}</p>
                <p className="text-xs text-stone-400 mt-1">点击重新上传</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <ArrowUpTrayIcon className="w-10 h-10 text-stone-300" />
              <div>
                <p className="text-sm font-medium text-stone-600">点击选择文件，或拖拽至此处</p>
                <p className="text-xs text-stone-400 mt-1">支持 PDF、Word 文档，最大 10 MB</p>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      </div>

      {/* 文档分析区域 */}
      {fileContent && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-heading">文档分析</h2>
            <button
              onClick={handleAnalysis}
              disabled={analyzing}
              className="btn-primary gap-2"
            >
              {analyzing ? (
                <>
                  <Spinner />
                  {currentAnalysisStep === 'overview' ? '正在分析概述...' :
                   currentAnalysisStep === 'requirements' ? '正在分析评分要求...' : '解析中...'}
                </>
              ) : (
                <>
                  <DocumentIcon className="w-4 h-4" />
                  解析标书
                </>
              )}
            </button>
          </div>

          {/* 流式内容显示 */}
          {analyzing && ((currentAnalysisStep === 'overview' && streamingOverview) || (currentAnalysisStep === 'requirements' && streamingRequirements)) && (
            <div className="mb-4 border border-blue-100 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
                <Spinner />
                <span className="text-xs font-medium text-blue-700">
                  {currentAnalysisStep === 'overview' ? '正在分析项目概述...' : '正在分析技术评分要求...'}
                </span>
              </div>
              <div className="p-4 bg-white max-h-52 overflow-y-auto">
                <div className="text-xs">
                  <ReactMarkdown components={streamingComponents}>
                    {currentAnalysisStep === 'overview' ? streamingOverview : streamingRequirements}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* 分析结果双列 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="form-label mb-2">项目概述</p>
              <div className="bg-white border border-stone-200 rounded-lg p-4 max-h-72 overflow-y-auto">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown components={markdownComponents}>
                    {localOverview || '项目概述将在解析后显示...'}
                  </ReactMarkdown>
                </div>
              </div>
            </div>

            <div>
              <p className="form-label mb-2">技术评分要求</p>
              <div className="bg-white border border-stone-200 rounded-lg p-4 max-h-72 overflow-y-auto">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown components={markdownComponents}>
                    {localRequirements || '技术评分要求将在解析后显示...'}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentAnalysis;
