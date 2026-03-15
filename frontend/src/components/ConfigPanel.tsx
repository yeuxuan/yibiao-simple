/**
 * 配置面板组件
 */
import React, { useState, useEffect } from 'react';
import { ConfigData } from '../types';
import { configApi } from '../services/api';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

interface ConfigPanelProps {
  config: ConfigData;
  onConfigChange: (config: ConfigData) => void;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onConfigChange }) => {
  const [localConfig, setLocalConfig] = useState<ConfigData>(config);
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await configApi.loadConfig();
      if (response.data) {
        setLocalConfig(response.data);
        onConfigChange(response.data);
      }
    } catch (error) {
      console.error('加载配置失败:', error);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const response = await configApi.saveConfig(localConfig);
      if (response.data.success) {
        onConfigChange(localConfig);
        setMessage({ type: 'success', text: '配置已保存' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: response.data.message || '保存失败' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '配置保存失败' });
    } finally {
      setLoading(false);
    }
  };

  const handleGetModels = async () => {
    if (!localConfig.api_key) {
      setMessage({ type: 'error', text: '请先输入 API Key' });
      return;
    }

    try {
      setLoading(true);
      const response = await configApi.getModels(localConfig);
      if (response.data.success) {
        setModels(response.data.models);
        if (response.data.models.length > 0 && !response.data.models.includes(localConfig.model_name)) {
          setLocalConfig({ ...localConfig, model_name: response.data.models[0] });
        }
        setMessage({ type: 'success', text: `获取到 ${response.data.models.length} 个模型` });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: response.data.message });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '获取模型列表失败' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-64 bg-white border-r border-stone-200 flex flex-col overflow-y-auto flex-shrink-0">
      {/* 品牌标题 */}
      <div className="px-5 pt-6 pb-5 border-b border-stone-100">
        <h1 className="font-serif text-xl font-semibold text-stone-900 leading-tight">
          标书 AI
        </h1>
        <p className="text-xs text-stone-400 mt-1 leading-relaxed">
          智能标书写作助手
        </p>
      </div>

      {/* 配置区域 */}
      <div className="flex-1 px-5 py-5 space-y-5">

        {/* API 配置 */}
        <div>
          <p className="form-label">接口配置</p>
          <div className="space-y-3">
            <div>
              <label htmlFor="api_key" className="block text-xs text-stone-500 mb-1">
                API Key
              </label>
              <input
                type="password"
                id="api_key"
                value={localConfig.api_key}
                onChange={(e) => setLocalConfig({ ...localConfig, api_key: e.target.value })}
                className="form-input"
                placeholder="sk-..."
              />
            </div>

            <div>
              <label htmlFor="base_url" className="block text-xs text-stone-500 mb-1">
                Base URL <span className="text-stone-400">（可选）</span>
              </label>
              <input
                type="text"
                id="base_url"
                value={localConfig.base_url || ''}
                onChange={(e) => setLocalConfig({ ...localConfig, base_url: e.target.value })}
                className="form-input"
                placeholder="https://api.openai.com/v1"
              />
            </div>
          </div>
        </div>

        {/* 分隔线 */}
        <div className="border-t border-stone-100" />

        {/* 模型配置 */}
        <div>
          <p className="form-label">模型选择</p>

          <button
            onClick={handleGetModels}
            disabled={loading}
            className="btn-secondary w-full mb-3 gap-2"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? '获取中...' : '获取可用模型'}
          </button>

          <div>
            <label htmlFor="model_name" className="block text-xs text-stone-500 mb-1">
              模型名称
            </label>
            {models.length > 0 ? (
              <select
                id="model_name"
                value={localConfig.model_name}
                onChange={(e) => setLocalConfig({ ...localConfig, model_name: e.target.value })}
                className="form-input"
              >
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                id="model_name"
                value={localConfig.model_name}
                onChange={(e) => setLocalConfig({ ...localConfig, model_name: e.target.value })}
                className="form-input"
                placeholder="gpt-4o"
              />
            )}
          </div>
        </div>

        {/* 保存按钮 */}
        <button
          onClick={handleSave}
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? '保存中...' : '保存配置'}
        </button>

        {/* 消息提示 */}
        {message && (
          <div className={message.type === 'success' ? 'alert-success' : 'alert-error'}>
            {message.text}
          </div>
        )}

        {/* 分隔线 */}
        <div className="border-t border-stone-100" />

        {/* 使用说明 */}
        <div>
          <p className="form-label">使用步骤</p>
          <ol className="space-y-2">
            {['配置 API 密钥与模型', '上传招标文件并解析', '生成目录结构', '生成并导出正文'].map((text, i) => (
              <li key={i} className="flex gap-2 text-xs text-stone-500 leading-relaxed">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-stone-100 text-stone-400 flex items-center justify-center font-medium text-[10px] mt-0.5">
                  {i + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};

export default ConfigPanel;
