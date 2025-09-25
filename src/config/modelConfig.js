/**
 * Whisper Model Configuration
 * Using Hugging Face CDN for model hosting (no files in repository)
 */

export const WHISPER_MODELS = {
  tiny: {
    id: 'tiny',
    name: 'ggml-tiny.en.bin',
    size: '75MB',
    sizeBytes: 78643200, // ~75MB
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    description: 'Fast, good accuracy - recommended for mobile',
    accuracy: 'Good',
    speed: 'Very Fast',
    recommended: 'mobile'
  },
  base: {
    id: 'base',
    name: 'ggml-base.en.bin',
    size: '142MB',
    sizeBytes: 148644352, // ~142MB
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    description: 'Better accuracy, good balance - recommended for desktop',
    accuracy: 'Better',
    speed: 'Fast',
    recommended: 'desktop'
  },
  small: {
    id: 'small',
    name: 'ggml-small.en.bin',
    size: '466MB',
    sizeBytes: 488857600, // ~466MB
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    description: 'Best accuracy, slower processing - for high-quality needs',
    accuracy: 'Best',
    speed: 'Slower',
    recommended: 'quality'
  }
};

// WASM files (small enough to include)
export const WHISPER_WASM = {
  wasmUrl: 'https://cdn.jsdelivr.net/npm/@visionenergy/whisper.wasm@1.0.0/dist/whisper.wasm',
  wasmSize: '2.8MB',
  localWasmPath: '/models/whisper.wasm' // fallback if we decide to host locally
};

// CDN Configuration
export const CDN_CONFIG = {
  primary: {
    name: 'Hugging Face',
    baseUrl: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/',
    description: 'Primary CDN - Fast and reliable'
  },
  fallback: {
    name: 'GitHub Releases',
    baseUrl: 'https://github.com/yourusername/meetingflow-app/releases/download/v1.0.0-models/',
    description: 'Fallback CDN - If primary fails'
  }
};

// Device-specific model recommendations
export const getRecommendedModel = () => {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const hasSlowConnection = navigator.connection &&
    (navigator.connection.effectiveType === 'slow-2g' || navigator.connection.effectiveType === '2g');

  if (isMobile || hasSlowConnection) {
    return WHISPER_MODELS.tiny;
  } else {
    return WHISPER_MODELS.base;
  }
};

// Storage estimation
export const estimateDownloadTime = (modelId, connectionType = 'unknown') => {
  const model = WHISPER_MODELS[modelId];
  if (!model) return 'Unknown';

  const speeds = {
    'slow-2g': 50 * 1024, // 50 KB/s
    '2g': 250 * 1024, // 250 KB/s
    '3g': 750 * 1024, // 750 KB/s
    '4g': 2.5 * 1024 * 1024, // 2.5 MB/s
    'unknown': 1 * 1024 * 1024 // 1 MB/s default
  };

  const speed = speeds[connectionType] || speeds.unknown;
  const timeSeconds = model.sizeBytes / speed;

  if (timeSeconds < 60) {
    return `~${Math.ceil(timeSeconds)} seconds`;
  } else {
    return `~${Math.ceil(timeSeconds / 60)} minutes`;
  }
};

export default WHISPER_MODELS;