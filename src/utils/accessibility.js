// Accessibility utilities and helpers

export class AccessibilityManager {
  constructor() {
    this.setupKeyboardNavigation()
    this.setupFocusManagement()
    this.setupScreenReaderAnnouncements()
  }

  setupKeyboardNavigation() {
    // Global keyboard event handler
    document.addEventListener('keydown', this.handleGlobalKeydown.bind(this))
    
    // Focus visible indicators
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        document.body.classList.add('user-is-tabbing')
      }
    })
    
    document.addEventListener('mousedown', () => {
      document.body.classList.remove('user-is-tabbing')
    })
  }

  handleGlobalKeydown(event) {
    const { key, ctrlKey, metaKey, altKey } = event
    const modifierKey = ctrlKey || metaKey

    // Global keyboard shortcuts
    switch (key) {
      case 'Escape':
        this.handleEscape()
        break
      case 'k':
        if (modifierKey) {
          event.preventDefault()
          this.triggerGlobalSearch()
        }
        break
      case 'n':
        if (modifierKey) {
          event.preventDefault()
          this.triggerNotifications()
        }
        break
      case 'h':
        if (modifierKey && altKey) {
          event.preventDefault()
          this.showKeyboardShortcuts()
        }
        break
      case '?':
        if (!modifierKey) {
          this.showKeyboardShortcuts()
        }
        break
    }
  }

  handleEscape() {
    // Close any open modals or overlays
    const modals = document.querySelectorAll('[role="dialog"], [data-modal]')
    const lastModal = Array.from(modals).pop()
    
    if (lastModal) {
      const closeButton = lastModal.querySelector('[data-close], button[aria-label*="close" i]')
      if (closeButton) {
        closeButton.click()
      }
    }
  }

  triggerGlobalSearch() {
    const event = new CustomEvent('app:open-search')
    document.dispatchEvent(event)
  }

  triggerNotifications() {
    const event = new CustomEvent('app:open-notifications')
    document.dispatchEvent(event)
  }

  showKeyboardShortcuts() {
    const event = new CustomEvent('app:show-shortcuts')
    document.dispatchEvent(event)
  }

  setupFocusManagement() {
    this.focusStack = []
  }

  // Focus management for modals and overlays
  trapFocus(element) {
    const focusableElements = this.getFocusableElements(element)
    const firstFocusable = focusableElements[0]
    const lastFocusable = focusableElements[focusableElements.length - 1]

    // Store previous focus
    this.focusStack.push(document.activeElement)

    const handleTabKey = (e) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault()
          lastFocusable.focus()
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault()
          firstFocusable.focus()
        }
      }
    }

    element.addEventListener('keydown', handleTabKey)
    
    // Focus the first element
    if (firstFocusable) {
      firstFocusable.focus()
    }

    // Return cleanup function
    return () => {
      element.removeEventListener('keydown', handleTabKey)
      this.restorePreviousFocus()
    }
  }

  restorePreviousFocus() {
    const previousFocus = this.focusStack.pop()
    if (previousFocus && previousFocus.focus) {
      previousFocus.focus()
    }
  }

  getFocusableElements(element) {
    const focusableSelectors = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
      '[role="button"]:not([disabled])',
      '[role="link"]'
    ].join(', ')

    return Array.from(element.querySelectorAll(focusableSelectors))
      .filter(el => this.isVisible(el))
  }

  isVisible(element) {
    const style = window.getComputedStyle(element)
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetParent !== null
  }

  setupScreenReaderAnnouncements() {
    // Create live region for announcements
    this.liveRegion = document.createElement('div')
    this.liveRegion.setAttribute('aria-live', 'polite')
    this.liveRegion.setAttribute('aria-atomic', 'true')
    this.liveRegion.className = 'sr-only'
    this.liveRegion.style.cssText = `
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    `
    document.body.appendChild(this.liveRegion)

    // Create assertive live region for urgent announcements
    this.assertiveRegion = this.liveRegion.cloneNode()
    this.assertiveRegion.setAttribute('aria-live', 'assertive')
    document.body.appendChild(this.assertiveRegion)
  }

  announce(message, priority = 'polite') {
    const region = priority === 'assertive' ? this.assertiveRegion : this.liveRegion
    
    // Clear and set new message
    region.textContent = ''
    setTimeout(() => {
      region.textContent = message
    }, 100)

    // Clear after announcement
    setTimeout(() => {
      region.textContent = ''
    }, 3000)
  }

  // Enhanced form validation announcements
  announceFormError(fieldName, errorMessage) {
    this.announce(`Error in ${fieldName}: ${errorMessage}`, 'assertive')
  }

  announceFormSuccess(message) {
    this.announce(message, 'polite')
  }

  // Navigation announcements
  announcePageChange(pageName) {
    this.announce(`Navigated to ${pageName}`)
  }

  announceLoadingState(isLoading, context = '') {
    if (isLoading) {
      this.announce(`Loading${context ? ` ${context}` : ''}...`)
    } else {
      this.announce(`Loading complete${context ? ` for ${context}` : ''}`)
    }
  }

  // Progress announcements
  announceProgress(current, total, context = '') {
    const percentage = Math.round((current / total) * 100)
    this.announce(`${context} progress: ${current} of ${total} (${percentage}%)`)
  }

  // Generate accessible descriptions
  generateAriaLabel(element, context = {}) {
    const { type, name, status, count, date } = context
    
    let label = name || element.textContent?.trim() || ''
    
    if (type) label = `${type}: ${label}`
    if (status) label += `, ${status}`
    if (count !== undefined) label += `, ${count} items`
    if (date) label += `, ${this.formatDateForScreenReader(date)}`
    
    return label
  }

  formatDateForScreenReader(date) {
    const dateObj = new Date(date)
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  // Keyboard navigation helpers
  createSkipLink(targetId, text = 'Skip to main content') {
    const skipLink = document.createElement('a')
    skipLink.href = `#${targetId}`
    skipLink.textContent = text
    skipLink.className = 'skip-link'
    skipLink.style.cssText = `
      position: absolute;
      top: -40px;
      left: 6px;
      background: #000;
      color: #fff;
      padding: 8px;
      text-decoration: none;
      border-radius: 4px;
      z-index: 1000;
      transition: top 0.3s;
    `
    
    skipLink.addEventListener('focus', () => {
      skipLink.style.top = '6px'
    })
    
    skipLink.addEventListener('blur', () => {
      skipLink.style.top = '-40px'
    })
    
    return skipLink
  }

  // Add keyboard shortcuts modal
  createKeyboardShortcutsModal() {
    const shortcuts = [
      { key: 'Ctrl+K', description: 'Open global search' },
      { key: 'Ctrl+N', description: 'Open notifications' },
      { key: 'Esc', description: 'Close modals and overlays' },
      { key: 'Tab', description: 'Navigate between elements' },
      { key: 'Enter/Space', description: 'Activate buttons and links' },
      { key: 'Alt+Ctrl+H', description: 'Show keyboard shortcuts' },
      { key: '?', description: 'Show keyboard shortcuts' }
    ]

    const modal = document.createElement('div')
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-labelledby', 'shortcuts-title')
    modal.setAttribute('aria-modal', 'true')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center modal-overlay'
    
    modal.innerHTML = `
      <div class="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4 p-6 modal-content">
        <div class="flex items-center justify-between mb-4">
          <h2 id="shortcuts-title" class="text-lg font-semibold">Keyboard Shortcuts</h2>
          <button class="p-1 hover:bg-gray-100 rounded focus-ring" aria-label="Close shortcuts">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="space-y-3">
          ${shortcuts.map(shortcut => `
            <div class="flex justify-between items-center">
              <kbd class="px-2 py-1 bg-gray-100 rounded text-sm font-mono">${shortcut.key}</kbd>
              <span class="text-sm text-gray-600 ml-4">${shortcut.description}</span>
            </div>
          `).join('')}
        </div>
        <div class="mt-6 text-center">
          <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors button-press focus-ring">
            Got it
          </button>
        </div>
      </div>
    `

    // Add event listeners
    const closeButton = modal.querySelector('[aria-label="Close shortcuts"]')
    const gotItButton = modal.querySelector('button:last-child')
    
    const close = () => {
      document.body.removeChild(modal)
      this.restorePreviousFocus()
    }
    
    closeButton.addEventListener('click', close)
    gotItButton.addEventListener('click', close)
    
    // Trap focus
    const cleanup = this.trapFocus(modal)
    
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cleanup()
        close()
      }
    })

    return modal
  }

  // Check color contrast
  checkColorContrast(foreground, background) {
    // Simple color contrast checker
    const getLuminance = (color) => {
      const rgb = parseInt(color.replace('#', ''), 16)
      const r = (rgb >> 16) & 0xff
      const g = (rgb >> 8) & 0xff
      const b = rgb & 0xff
      
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255
    }
    
    const l1 = getLuminance(foreground)
    const l2 = getLuminance(background)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    
    return {
      ratio,
      aaLevel: ratio >= 4.5 ? 'AA' : 'Fail',
      aaaLevel: ratio >= 7 ? 'AAA' : 'Fail'
    }
  }

  // Validate form accessibility
  validateFormAccessibility(form) {
    const issues = []
    
    // Check for labels
    const inputs = form.querySelectorAll('input, select, textarea')
    inputs.forEach(input => {
      const label = form.querySelector(`label[for="${input.id}"]`)
      const ariaLabel = input.getAttribute('aria-label')
      const ariaLabelledBy = input.getAttribute('aria-labelledby')
      
      if (!label && !ariaLabel && !ariaLabelledBy) {
        issues.push(`Input missing label: ${input.name || input.type}`)
      }
    })
    
    // Check for error messages
    const errorElements = form.querySelectorAll('[role="alert"], .error-message')
    if (errorElements.length === 0) {
      issues.push('Form lacks error message container')
    }
    
    return issues
  }
}

// Create singleton instance
const accessibility = new AccessibilityManager()

// Export accessibility utilities
export const a11y = {
  announce: accessibility.announce.bind(accessibility),
  trapFocus: accessibility.trapFocus.bind(accessibility),
  generateAriaLabel: accessibility.generateAriaLabel.bind(accessibility),
  announceFormError: accessibility.announceFormError.bind(accessibility),
  announceFormSuccess: accessibility.announceFormSuccess.bind(accessibility),
  announcePageChange: accessibility.announcePageChange.bind(accessibility),
  announceLoadingState: accessibility.announceLoadingState.bind(accessibility),
  announceProgress: accessibility.announceProgress.bind(accessibility)
}

export default accessibility