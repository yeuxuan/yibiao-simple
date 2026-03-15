/**
 * 主应用组件
 */
import React from 'react';
import { useAppState } from './hooks/useAppState';
import ConfigPanel from './components/ConfigPanel';
import StepBar from './components/StepBar';
import DocumentAnalysis from './pages/DocumentAnalysis';
import OutlineEdit from './pages/OutlineEdit';
import ContentEdit from './pages/ContentEdit';
import { ChevronLeftIcon, ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline';

function App() {
  const {
    state,
    updateConfig,
    updateStep,
    updateFileContent,
    updateAnalysisResults,
    updateOutline,
    updateSelectedChapter,
    nextStep,
    prevStep,
  } = useAppState();

  const steps = ['标书解析', '目录编辑', '正文编辑'];

  const renderCurrentPage = () => {
    switch (state.currentStep) {
      case 0:
        return (
          <DocumentAnalysis
            fileContent={state.fileContent}
            projectOverview={state.projectOverview}
            techRequirements={state.techRequirements}
            onFileUpload={updateFileContent}
            onAnalysisComplete={updateAnalysisResults}
          />
        );
      case 1:
        return (
          <OutlineEdit
            projectOverview={state.projectOverview}
            techRequirements={state.techRequirements}
            outlineData={state.outlineData}
            onOutlineGenerated={updateOutline}
          />
        );
      case 2:
        return (
          <ContentEdit
            outlineData={state.outlineData}
            selectedChapter={state.selectedChapter}
            onChapterSelect={updateSelectedChapter}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-stone-50 flex">
      {/* 左侧配置面板 */}
      <ConfigPanel
        config={state.config}
        onConfigChange={updateConfig}
      />

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶部步骤导航 */}
        <div className="sticky top-0 z-50 bg-white border-b border-stone-200">
          <div className="px-8">
            <StepBar steps={steps} currentStep={state.currentStep} />
          </div>
        </div>

        {/* 页面内容 */}
        <div id="app-main-scroll" className="flex-1 overflow-y-auto">
          <div className="px-8 py-6">
            {renderCurrentPage()}
          </div>
        </div>

        {/* 底部导航 */}
        <div className="sticky bottom-0 z-50 bg-white border-t border-stone-200 px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateStep(0)}
                disabled={state.currentStep === 0}
                className="btn-ghost gap-1 disabled:opacity-30"
              >
                <HomeIcon className="w-4 h-4" />
                首页
              </button>
              <div className="w-px h-4 bg-stone-200" />
              <button
                onClick={prevStep}
                disabled={state.currentStep === 0}
                className="btn-ghost gap-1 disabled:opacity-30"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                上一步
              </button>
            </div>

            <button
              onClick={nextStep}
              disabled={state.currentStep === steps.length - 1}
              className="btn-primary gap-1 disabled:opacity-30"
            >
              下一步
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
