/**
 * Whisper Model Download Modal
 * First-time setup flow for downloading AI models
 */

import React, { useState, useEffect } from 'react';
import { Download, Zap, Database, Wifi, X, CheckCircle, AlertCircle } from 'lucide-react';
import { WHISPER_MODELS, estimateDownloadTime } from '../../config/modelConfig.js';

const ModelDownloadModal = ({
  isOpen,
  onClose,
  onModelSelected,
  onDownloadComplete,
  recommendedModelId = 'base'
}) => {
  const [selectedModel, setSelectedModel] = useState(recommendedModelId);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStage, setDownloadStage] = useState('');
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [connectionType, setConnectionType] = useState('unknown');
  const [storageInfo, setStorageInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      detectConnectionType();
      checkStorageInfo();
    }
  }, [isOpen]);

  const detectConnectionType = () => {
    if ('connection' in navigator) {
      setConnectionType(navigator.connection.effectiveType || 'unknown');
    }
  };

  const checkStorageInfo = async () => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        const availableMB = (estimate.quota - estimate.usage) / (1024 * 1024);
        setStorageInfo({
          availableMB: Math.floor(availableMB),
          quotaMB: Math.floor(estimate.quota / (1024 * 1024)),
          usageMB: Math.floor(estimate.usage / (1024 * 1024))
        });
      } catch (error) {
        console.error('Failed to get storage info:', error);
      }
    }
  };

  const handleDownload = async () => {
    if (!selectedModel) return;

    setIsDownloading(true);
    setError(null);
    setDownloadProgress(0);

    try {
      // Import the service dynamically to avoid loading it on every render
      const { default: audioTranscriptionService } = await import('../../services/audioTranscriptionService.js');

      await audioTranscriptionService.downloadWhisperModel(selectedModel, (progress) => {
        setDownloadProgress(progress.progress);

        if (progress.type === 'download') {
          setDownloadStage(`Downloading: ${progress.receivedMB}MB / ${progress.totalMB}MB`);

          // Calculate speed
          if (progress.receivedBytes && progress.startTime) {
            const elapsed = Date.now() - progress.startTime;
            const speed = progress.receivedBytes / (elapsed / 1000) / (1024 * 1024);
            setDownloadSpeed(`${speed.toFixed(1)} MB/s`);
          }
        } else if (progress.type === 'cache_hit') {
          setDownloadStage('Loading from cache...');
        }
      });

      // Download complete
      setDownloadProgress(100);
      setDownloadStage('Download complete!');

      // Notify parent and close modal
      if (onDownloadComplete) {
        onDownloadComplete(selectedModel);
      }

      setTimeout(() => {
        setIsDownloading(false);
        onClose();
      }, 1500);

    } catch (error) {
      console.error('Download failed:', error);
      setError(error.message);
      setIsDownloading(false);
      setDownloadProgress(0);
      setDownloadStage('');
    }
  };

  const handleModelSelect = (modelId) => {
    if (!isDownloading) {
      setSelectedModel(modelId);
      if (onModelSelected) {
        onModelSelected(modelId);
      }
    }
  };

  if (!isOpen) return null;

  const selectedModelInfo = WHISPER_MODELS[selectedModel];
  const estimatedTime = estimateDownloadTime(selectedModel, connectionType);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">AI Transcription Setup</h2>
                <p className="text-sm text-gray-500">Choose your AI model for offline transcription</p>
              </div>
            </div>
            {!isDownloading && (
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Connection & Storage Info */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center space-x-2 text-gray-600">
                <Wifi className="w-4 h-4" />
                <span>Connection: {connectionType.toUpperCase()}</span>
              </div>
              {storageInfo && (
                <div className="flex items-center space-x-2 text-gray-600">
                  <Database className="w-4 h-4" />
                  <span>{storageInfo.availableMB}MB available</span>
                </div>
              )}
            </div>
            {selectedModelInfo && (
              <div className="text-xs text-gray-500">
                Estimated download time: {estimatedTime}
              </div>
            )}
          </div>

          {/* Model Selection */}
          {!isDownloading && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900">Choose AI Model Size</h3>
              <div className="space-y-3">
                {Object.values(WHISPER_MODELS).map((model) => (
                  <div
                    key={model.id}
                    onClick={() => handleModelSelect(model.id)}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                      selectedModel === model.id
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-medium text-gray-900 capitalize">{model.id} Model</h4>
                          {model.recommended === 'mobile' && window.innerWidth < 768 && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                              Recommended
                            </span>
                          )}
                          {model.recommended === 'desktop' && window.innerWidth >= 768 && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{model.description}</p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>Size: {model.size}</span>
                          <span>Speed: {model.speed}</span>
                          <span>Quality: {model.accuracy}</span>
                        </div>
                      </div>
                      {selectedModel === model.id && (
                        <CheckCircle className="w-5 h-5 text-purple-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Download Progress */}
          {isDownloading && (
            <div className="space-y-4">
              <div className="text-center">
                <h3 className="font-semibold text-gray-900">Downloading AI Model</h3>
                <p className="text-sm text-gray-600 capitalize">{selectedModel} model - {selectedModelInfo?.size}</p>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{downloadStage}</span>
                  <span>{Math.round(downloadProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                {downloadSpeed && (
                  <div className="text-xs text-gray-500 text-center">
                    {downloadSpeed}
                  </div>
                )}
              </div>

              {/* Download Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  🔄 The model will be cached for offline use. You only need to download it once!
                </p>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-800">Download Failed</p>
                <p className="text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isDownloading && (
          <div className="p-6 border-t bg-gray-50 rounded-b-xl">
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                Model will be cached for offline transcription
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Skip for now
                </button>
                <button
                  onClick={handleDownload}
                  disabled={!selectedModel}
                  className="flex items-center space-x-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Download {selectedModel ? WHISPER_MODELS[selectedModel].size : ''}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelDownloadModal;