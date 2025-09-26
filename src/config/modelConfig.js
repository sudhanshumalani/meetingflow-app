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

/**
 * Enhanced device detection for optimal model selection
 */
export const detectDeviceCapabilities = () => {
  const userAgent = navigator.userAgent;

  // Enhanced mobile detection
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isTablet = /iPad|Android.*\bTablet\b/i.test(userAgent);

  // Low-end device detection
  const isLowEnd = /Android.*\b(SM-J|SM-A|SM-G|LG-|HUAWEI|Xiaomi).*(4|6).*GB/i.test(userAgent);

  // Connection detection
  const connection = navigator.connection;
  const hasSlowConnection = connection &&
    (connection.effectiveType === 'slow-2g' ||
     connection.effectiveType === '2g' ||
     connection.effectiveType === '3g');

  // Memory detection
  const deviceMemory = navigator.deviceMemory || 0;
  const isLowMemory = deviceMemory > 0 && deviceMemory <= 4;

  // Screen size detection
  const isSmallScreen = window.innerWidth <= 768;
  const screenSize = `${window.innerWidth}x${window.innerHeight}`;

  // Battery status (if available)
  const battery = navigator.getBattery ? 'available' : 'not available';

  // Hardware concurrency (CPU cores approximation)
  const cpuCores = navigator.hardwareConcurrency || 'unknown';

  return {
    deviceType: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
    isMobile,
    isTablet,
    isLowEnd,
    hasSlowConnection,
    deviceMemory: `${deviceMemory}GB`,
    isLowMemory,
    isSmallScreen,
    screenSize,
    battery,
    cpuCores,
    connectionType: connection?.effectiveType || 'unknown',
    downlink: connection?.downlink || 'unknown',
    rtt: connection?.rtt || 'unknown',
    userAgent: userAgent.substring(0, 100) + '...' // Truncate for logging
  };
};

// Device-specific model recommendations with enhanced detection
export const getRecommendedModel = () => {
  const capabilities = detectDeviceCapabilities();

  console.log('📱 Device capabilities detected:', capabilities);

  // Mobile phones: Always use tiny for battery efficiency and performance
  if (capabilities.isMobile && !capabilities.isTablet) {
    console.log('📱 Mobile phone detected: selecting tiny model for optimal performance');
    return {
      ...WHISPER_MODELS.tiny,
      reason: 'mobile_phone_optimization'
    };
  }

  // Tablets: Use tiny for low-end, base for high-end
  if (capabilities.isTablet) {
    if (capabilities.isLowEnd || capabilities.isLowMemory || capabilities.hasSlowConnection) {
      console.log('📱 Low-end tablet detected: selecting tiny model');
      return {
        ...WHISPER_MODELS.tiny,
        reason: 'tablet_low_end'
      };
    } else {
      console.log('📱 High-end tablet detected: selecting base model');
      return {
        ...WHISPER_MODELS.base,
        reason: 'tablet_high_end'
      };
    }
  }

  // Desktop: Base model unless constrained
  if (capabilities.isLowMemory || capabilities.hasSlowConnection) {
    console.log('💻 Constrained desktop detected: selecting base model');
    return {
      ...WHISPER_MODELS.base,
      reason: 'desktop_constrained'
    };
  } else {
    console.log('💻 Desktop detected: selecting base model for optimal balance');
    return {
      ...WHISPER_MODELS.base,
      reason: 'desktop_optimal'
    };
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