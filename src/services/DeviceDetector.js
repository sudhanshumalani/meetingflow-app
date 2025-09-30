class DeviceDetector {
  static isDesktop() {
    return !this.isMobile();
  }

  static isMobile() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  }

  static isiOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  static isAndroid() {
    return /Android/i.test(navigator.userAgent);
  }

  static isPWA() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  static supportsSystemAudio() {
    // Only desktop Chrome/Edge support system audio via getDisplayMedia
    const isChrome = /Chrome|Chromium|Edge/i.test(navigator.userAgent);
    const isFirefox = /Firefox/i.test(navigator.userAgent);

    return this.isDesktop() && (isChrome || isFirefox);
  }

  static getRecommendedMode() {
    if (this.supportsSystemAudio()) {
      return 'system-audio'; // For Zoom meetings on desktop
    } else {
      return 'microphone'; // For in-person meetings on mobile
    }
  }

  static getPlatformName() {
    if (this.isiOS()) return 'iOS';
    if (this.isAndroid()) return 'Android';
    if (/Windows/.test(navigator.userAgent)) return 'Windows';
    if (/Mac/.test(navigator.userAgent)) return 'macOS';
    if (/Linux/.test(navigator.userAgent)) return 'Linux';
    return 'Unknown';
  }

  static getBrowserName() {
    if (/Chrome/i.test(navigator.userAgent) && !/Edge/i.test(navigator.userAgent)) {
      return 'Chrome';
    }
    if (/Edge/i.test(navigator.userAgent)) return 'Edge';
    if (/Firefox/i.test(navigator.userAgent)) return 'Firefox';
    if (/Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent)) {
      return 'Safari';
    }
    return 'Unknown';
  }

  static getCapabilities() {
    return {
      platform: this.getPlatformName(),
      browser: this.getBrowserName(),
      isMobile: this.isMobile(),
      isiOS: this.isiOS(),
      isPWA: this.isPWA(),
      supportsSystemAudio: this.supportsSystemAudio(),
      supportsMicrophone: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices,
      recommendedMode: this.getRecommendedMode()
    };
  }

  static getUseCaseMessage() {
    if (this.supportsSystemAudio()) {
      return '🖥️ Perfect for Zoom meetings - System audio will be captured';
    } else if (this.isMobile()) {
      return '📱 Perfect for in-person meetings - Microphone will be captured';
    } else {
      return '🎤 Microphone mode available';
    }
  }
}

export default DeviceDetector;
