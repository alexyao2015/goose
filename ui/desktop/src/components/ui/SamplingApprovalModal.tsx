import React, { useState } from 'react';
import { SamplingRequest } from '../../api/types.gen';

interface SamplingApprovalModalProps {
  request: SamplingRequest;
  onApprove: (requestId: string) => Promise<void>;
  onDeny: (requestId: string) => Promise<void>;
  isOpen: boolean;
}

export const SamplingApprovalModal: React.FC<SamplingApprovalModalProps> = ({
  request,
  onApprove,
  onDeny,
  isOpen,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleApprove = async () => {
    setIsLoading(true);
    try {
      await onApprove(request.id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeny = async () => {
    setIsLoading(true);
    try {
      await onDeny(request.id);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            MCP Sampling Request
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Extension <span className="font-mono font-medium">{request.extension_name}</span> is requesting to perform sampling
          </p>
        </div>

        {/* Content */}
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {/* System Prompt */}
          {request.system_prompt && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                System Prompt:
              </h3>
              <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                {request.system_prompt}
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Messages:
            </h3>
            <div className="space-y-2">
              {request.messages.map((message, index) => (
                <div
                  key={index}
                  className={`rounded p-3 ${
                    message.role === 'user'
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
                      : 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500'
                  }`}
                >
                  <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 uppercase">
                    {message.role}
                  </div>
                  <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Parameters */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Parameters:
            </h3>
            <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Max Tokens:</span>
                <span className="font-mono text-gray-800 dark:text-gray-200">{request.max_tokens}</span>
              </div>
              {request.model_preferences && (
                <>
                  {request.model_preferences.hints && request.model_preferences.hints.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Model Hints:</span>
                      <span className="font-mono text-gray-800 dark:text-gray-200">
                        {request.model_preferences.hints.map(h => h.name).filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                  {request.model_preferences.cost_priority !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Cost Priority:</span>
                      <span className="font-mono text-gray-800 dark:text-gray-200">
                        {request.model_preferences.cost_priority}
                      </span>
                    </div>
                  )}
                  {request.model_preferences.speed_priority !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Speed Priority:</span>
                      <span className="font-mono text-gray-800 dark:text-gray-200">
                        {request.model_preferences.speed_priority}
                      </span>
                    </div>
                  )}
                  {request.model_preferences.intelligence_priority !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Intelligence Priority:</span>
                      <span className="font-mono text-gray-800 dark:text-gray-200">
                        {request.model_preferences.intelligence_priority}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={handleDeny}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Processing...' : 'Deny'}
          </button>
          <button
            onClick={handleApprove}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Processing...' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
};
