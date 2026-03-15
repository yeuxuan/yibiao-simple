/**
 * 步骤导航条组件 - 编号式精工设计
 */
import React from 'react';
import { CheckIcon } from '@heroicons/react/24/solid';

interface StepBarProps {
  steps: string[];
  currentStep: number;
}

const StepBar: React.FC<StepBarProps> = ({ steps, currentStep }) => {
  return (
    <nav aria-label="进度" className="w-full py-4">
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isPending = index > currentStep;

          return (
            <li
              key={step}
              className={`flex items-center ${index !== steps.length - 1 ? 'flex-1' : ''}`}
            >
              {/* 步骤项 */}
              <div className="flex items-center gap-3">
                {/* 圆圈指示器 */}
                <div className="relative flex-shrink-0">
                  {isCompleted ? (
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
                      <CheckIcon className="w-3.5 h-3.5 text-white" />
                    </div>
                  ) : isCurrent ? (
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center ring-4 ring-blue-100">
                      <span className="text-xs font-semibold text-white leading-none">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-stone-100 border border-stone-300 flex items-center justify-center">
                      <span className="text-xs font-medium text-stone-400 leading-none">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </div>
                  )}
                </div>

                {/* 步骤名称 */}
                <span
                  className={`text-sm font-medium whitespace-nowrap ${
                    isCompleted || isCurrent
                      ? 'text-stone-900'
                      : 'text-stone-400'
                  }`}
                >
                  {step}
                </span>
              </div>

              {/* 连接线 */}
              {index !== steps.length - 1 && (
                <div className="flex-1 mx-4">
                  <div
                    className={`h-px ${
                      isCompleted ? 'bg-blue-600' : 'bg-stone-200'
                    }`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default StepBar;
