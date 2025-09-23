/**
 * Haptic Feedback Utility for Mobile Devices
 * Provides tactile feedback for user interactions
 */

class HapticFeedback {
  constructor() {
    this.isSupported = this.checkSupport()
  }

  /**
   * Check if haptic feedback is supported
   * @returns {boolean}
   */
  checkSupport() {
    return (
      'vibrate' in navigator ||
      'mozVibrate' in navigator ||
      'webkitVibrate' in navigator ||
      (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function')
    )
  }

  /**
   * Trigger vibration if supported
   * @param {number|number[]} pattern - Vibration pattern
   */
  vibrate(pattern) {
    if (!this.isSupported) return false

    try {
      if (navigator.vibrate) {
        return navigator.vibrate(pattern)
      } else if (navigator.mozVibrate) {
        return navigator.mozVibrate(pattern)
      } else if (navigator.webkitVibrate) {
        return navigator.webkitVibrate(pattern)
      }
    } catch (error) {
      console.warn('Haptic feedback failed:', error)
    }
    return false
  }

  /**
   * Light haptic feedback for subtle interactions
   */
  light() {
    return this.vibrate(50)
  }

  /**
   * Medium haptic feedback for standard interactions
   */
  medium() {
    return this.vibrate(100)
  }

  /**
   * Strong haptic feedback for important actions
   */
  strong() {
    return this.vibrate(200)
  }

  /**
   * Success feedback pattern
   */
  success() {
    return this.vibrate([50, 50, 50])
  }

  /**
   * Error feedback pattern
   */
  error() {
    return this.vibrate([100, 50, 100, 50, 100])
  }

  /**
   * Warning feedback pattern
   */
  warning() {
    return this.vibrate([150, 100, 150])
  }

  /**
   * Button tap feedback
   */
  tap() {
    return this.light()
  }

  /**
   * Swipe gesture feedback
   */
  swipe() {
    return this.medium()
  }

  /**
   * Long press feedback
   */
  longPress() {
    return this.vibrate([50, 30, 100])
  }

  /**
   * Selection feedback
   */
  selection() {
    return this.vibrate([30, 20, 30])
  }

  /**
   * Stop all vibrations
   */
  stop() {
    return this.vibrate(0)
  }
}

// Create singleton instance
const hapticFeedback = new HapticFeedback()

export default hapticFeedback

// Named exports for convenience
export const {
  light,
  medium,
  strong,
  success,
  error,
  warning,
  tap,
  swipe,
  longPress,
  selection,
  stop
} = hapticFeedback