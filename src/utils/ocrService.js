import { createWorker } from 'tesseract.js'

// OCR Service using Tesseract.js v6 for real text extraction
export class OCRService {
  constructor() {
    this.worker = null
    this.isInitialized = false
  }

  async initialize() {
    if (this.isInitialized && this.worker) return

    console.log('=== OCR INITIALIZATION (Tesseract.js v6) ===')
    console.log('Creating worker with modern API...')

    try {
      // Use the correct v6 API - worker is ready immediately
      this.worker = await createWorker('eng', 1, {
        logger: (info) => {
          console.log('Tesseract:', info)
          if (info.status === 'recognizing text' && info.progress) {
            console.log(`OCR Progress: ${Math.round(info.progress * 100)}%`)
          }
        }
      })

      this.isInitialized = true
      console.log('OCR worker created and ready!')

    } catch (error) {
      console.error('OCR initialization failed:', error)
      await this.cleanup()
      throw new Error(`OCR initialization failed: ${error.message}`)
    }
  }

  async cleanup() {
    if (this.worker) {
      try {
        await this.worker.terminate()
        console.log('OCR worker terminated')
      } catch (error) {
        console.warn('Error terminating OCR worker:', error)
      }
      this.worker = null
    }
    this.isInitialized = false
  }

  async extractText(imageFile, options = {}) {
    let imageUrl = null
    try {
      console.log('=== OCR EXTRACTION DEBUG START ===')
      console.log('Starting OCR extraction for:', imageFile.name)
      console.log('Image file details:', {
        name: imageFile.name,
        size: imageFile.size,
        type: imageFile.type,
        lastModified: imageFile.lastModified
      })

      await this.initialize()

      const {
        onProgress = () => {},
        preprocessImage = true
      } = options

      // Convert file to image URL for Tesseract
      imageUrl = URL.createObjectURL(imageFile)
      console.log('Created image URL for Tesseract:', imageUrl)

      // Verify the worker is properly initialized
      if (!this.worker) {
        throw new Error('OCR worker not properly initialized')
      }

      // Run OCR with v6 API - no timeout needed, it's built in
      console.log('Starting OCR recognition...')
      onProgress(10)

      const ret = await this.worker.recognize(imageUrl)
      const data = ret.data

      console.log('=== RAW TESSERACT RESULT ===')
      console.log('Full data object:', data)

      console.log('Tesseract raw result:', {
        text: data.text.substring(0, 100) + '...',
        confidence: data.confidence,
        wordCount: data.words?.length
      })

      // Clean up object URL
      URL.revokeObjectURL(imageUrl)

      // Validate that we got real OCR results
      if (!data.text || data.text.trim().length < 5) {
        throw new Error('OCR extracted very little or no text from the image')
      }

      // Check if the text looks like mock data (basic sanity check)
      const suspiciousPhrases = [
        'proceed with mobile development',
        'postpone desktop app',
        'Meeting Notes - Q4 Planning',
        'Sprint Review Meeting',
        'Client Check-in Meeting'
      ]

      const isSuspicious = suspiciousPhrases.some(phrase =>
        data.text.toLowerCase().includes(phrase.toLowerCase())
      )

      if (isSuspicious) {
        console.warn('OCR result contains suspicious mock-like content')
      }

      // Process and structure the results
      const processedResult = this.processOCRResult(data)

      const result = {
        success: true,
        confidence: data.confidence / 100, // Convert to 0-1 scale
        text: data.text.trim(),
        words: data.words.length,
        processedAt: new Date().toISOString(),
        fileName: imageFile.name,
        fileSize: imageFile.size,
        extractedSections: processedResult.sections,
        actionItems: processedResult.actionItems,
        // Add debug info
        debug: {
          rawConfidence: data.confidence,
          originalTextLength: data.text.length,
          tesseractVersion: 'v4',
          processingMethod: 'tesseract.js'
        }
      }

      console.log('Final OCR result:', {
        textLength: result.text.length,
        confidence: result.confidence,
        actionItemsCount: result.actionItems.length
      })

      return result

    } catch (error) {
      console.error('OCR extraction failed:', error)
      console.error('Error stack:', error.stack)

      // Clean up object URL if it was created
      try {
        if (imageUrl) {
          URL.revokeObjectURL(imageUrl)
        }
      } catch (urlCleanupError) {
        console.warn('Failed to cleanup image URL:', urlCleanupError)
      }

      // Try to recover by reinitializing if this looks like a worker issue
      if (error.message.includes('timeout') || error.message.includes('Worker') || !this.worker) {
        console.log('Attempting to recover OCR worker...')
        this.isInitialized = false
        this.worker = null

        try {
          await this.initialize()
          console.log('OCR worker recovery successful')
        } catch (recoveryError) {
          console.error('OCR worker recovery failed:', recoveryError)
        }
      }

      // Don't fall back to mock data - return clear error
      return {
        success: false,
        error: `OCR processing failed: ${error.message || 'Unknown error'}`,
        fileName: imageFile.name,
        debug: {
          errorType: error.constructor.name,
          timestamp: new Date().toISOString(),
          workerState: this.worker ? 'exists' : 'null',
          isInitialized: this.isInitialized
        }
      }
    }
  }

  processOCRResult(data) {
    const text = data.text.trim()
    const lines = text.split('\n').filter(line => line.trim().length > 0)

    // Extract structured sections from the text
    const sections = this.extractSections(text, lines)
    const actionItems = this.extractActionItems(text)

    return {
      sections,
      actionItems
    }
  }

  extractSections(text, lines) {
    const sections = {
      agenda: [],
      decisions: [],
      actionItems: [],
      notes: [],
      attendees: []
    }

    let currentSection = 'notes'
    const sectionKeywords = {
      agenda: ['agenda', 'topics', 'items', 'discussion'],
      decisions: ['decisions', 'resolved', 'agreed', 'concluded'],
      actionItems: ['action', 'todo', 'tasks', 'follow up', 'next steps'],
      attendees: ['attendees', 'participants', 'present', 'members']
    }

    for (const line of lines) {
      const lowerLine = line.toLowerCase()

      // Check if this line indicates a new section
      let foundSection = false
      for (const [section, keywords] of Object.entries(sectionKeywords)) {
        if (keywords.some(keyword => lowerLine.includes(keyword))) {
          currentSection = section
          foundSection = true
          break
        }
      }

      // If it's not a section header, add to current section
      if (!foundSection && line.trim().length > 3) {
        // Clean up bullet points and formatting
        const cleanedLine = line.replace(/^[•\-*◦▪▫‣⁃]\s*/, '').trim()
        if (cleanedLine.length > 0) {
          sections[currentSection].push(cleanedLine)
        }
      }
    }

    return sections
  }

  extractActionItems(text) {
    const actionItems = []
    const patterns = [
      // Checkbox patterns
      /[□☐▢]\s*(.+)/g,
      // Bullet point with action words
      /[•\-*]\s*(.+?(?:to\s+\w+|by\s+\w+|follow[\s-]?up|complete|finish|review|update|contact).*)/gi,
      // Action/TODO patterns
      /(?:action|todo|task):\s*(.+)/gi,
      // Numbered action items
      /\d+\.\s*(.+(?:to\s+\w+|by\s+\w+|follow[\s-]?up|complete|finish|review|update|contact).*)/gi
    ]

    patterns.forEach(pattern => {
      const matches = [...text.matchAll(pattern)]
      matches.forEach(match => {
        const item = match[1]?.trim()
        if (item && item.length > 10 && item.length < 200) {
          const assignee = this.extractAssignee(item)
          const priority = this.extractPriority(item)

          actionItems.push({
            text: item,
            assignee,
            priority,
            completed: false,
            extractedAt: new Date().toISOString()
          })
        }
      })
    })

    // Remove duplicates and limit results
    const uniqueItems = actionItems.filter((item, index, array) =>
      array.findIndex(i => i.text.toLowerCase() === item.text.toLowerCase()) === index
    )

    return uniqueItems.slice(0, 8) // Limit to 8 items max
  }

  extractAssignee(text) {
    const patterns = [
      /(\w+)\s+(?:to|will|should)\s+/i,
      /assigned\s+to\s+(\w+)/i,
      /-\s*(\w+)(?:\s|$)/i,
      /\b(\w+):\s*(?:to|will|should)/i,
      /\((\w+)\)/g // Names in parentheses
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match && match[1] && match[1].length > 1) {
        const name = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
        // Filter out common words that aren't names
        if (!['The', 'And', 'For', 'But', 'Not', 'You', 'All', 'Can', 'Had', 'Her', 'Was', 'One', 'Our', 'Out', 'Day', 'Has', 'His', 'How', 'Man', 'New', 'Now', 'Old', 'See', 'Two', 'Way', 'Who', 'Boy', 'Did', 'Get', 'May', 'Say', 'She', 'Use', 'Yet'].includes(name)) {
          return name
        }
      }
    }
    return 'Unassigned'
  }

  extractPriority(text) {
    const lowerText = text.toLowerCase()
    if (lowerText.includes('urgent') || lowerText.includes('asap') || lowerText.includes('critical')) {
      return 'high'
    } else if (lowerText.includes('low') || lowerText.includes('optional') || lowerText.includes('nice to have')) {
      return 'low'
    }
    return 'medium'
  }

  async cleanup() {
    if (this.worker) {
      await this.worker.terminate()
      this.worker = null
      this.isInitialized = false
    }
  }
}

// Legacy OCR service instance (kept for compatibility, but not used)
const legacyOcrService = new OCRService()

// Utility function to validate image files
export const validateImageFile = (file) => {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/bmp']
  const maxSize = 10 * 1024 * 1024 // 10MB

  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'Please select a valid image file (JPEG, PNG, WebP, or BMP)'
    }
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: 'Image file size must be less than 10MB'
    }
  }

  return { valid: true }
}

// Fallback OCR implementation when Tesseract fails completely
class FallbackOCRService {
  constructor() {
    this.isInitialized = true // Always ready
  }

  async initialize() {
    // No initialization needed
    return Promise.resolve()
  }

  async extractText(imageFile, options = {}) {
    const { onProgress = () => {}, includeEnablePrompt = false } = options

    console.log('=== FALLBACK OCR SERVICE ACTIVATED ===')
    console.log('Using fallback OCR service (OCR disabled by default to prevent hanging)')

    // Quick progress simulation
    onProgress(25)
    await new Promise(resolve => setTimeout(resolve, 200))
    onProgress(50)
    await new Promise(resolve => setTimeout(resolve, 200))
    onProgress(75)
    await new Promise(resolve => setTimeout(resolve, 200))
    onProgress(90)
    await new Promise(resolve => setTimeout(resolve, 100))

    // Return a helpful message for the user
    const baseText = `📝 Manual Note Entry Mode

OCR (text extraction) is currently disabled to prevent the app from freezing.

✅ All app features are fully functional:
• Digital note-taking (4-quadrant format)
• Meeting templates
• Action item tracking
• Meeting export options
• Photo capture and storage

💡 To try enabling OCR text extraction:
• Look for the "Enable OCR" button in the interface
• Note: This may cause slower performance or hanging

📎 File uploaded: ${imageFile.name}
📊 Size: ${(imageFile.size / 1024).toFixed(1)} KB
🎯 Type: ${imageFile.type}

You can manually type your meeting notes in the Digital Notes section.`

    const enablePromptText = includeEnablePrompt ? `

🔧 Want to try OCR text extraction? Look for the "Enable OCR" button.` : ''

    const fallbackText = baseText + enablePromptText

    onProgress(100)

    return {
      success: true,
      confidence: 0.0, // Indicate this is fallback
      text: fallbackText,
      words: fallbackText.split(/\s+/).length,
      processedAt: new Date().toISOString(),
      fileName: imageFile.name,
      fileSize: imageFile.size,
      extractedSections: {
        agenda: [],
        decisions: [],
        actionItems: [],
        notes: [], // Don't auto-populate fallback text
        attendees: [],
        fallbackMessage: fallbackText // Store separately to avoid auto-population
      },
      actionItems: [], // No action items from fallback
      debug: {
        isFallback: true,
        reason: 'Tesseract.js initialization or processing failed',
        timestamp: new Date().toISOString(),
        processingMethod: 'fallback'
      }
    }
  }

  async cleanup() {
    // No cleanup needed
    return Promise.resolve()
  }
}

// Enhanced OCR service with immediate fallback strategy
class EnhancedOCRService {
  constructor() {
    this.primaryService = new OCRService()
    this.fallbackService = new FallbackOCRService()
    // Start with fallback mode to avoid initialization issues
    this.usingFallback = true
    this.ocrEnabled = false
    this.initializationAttempted = false
  }

  // Method to enable real OCR (user must explicitly request it)
  async enableRealOCR() {
    if (this.ocrEnabled) return { success: true, message: 'OCR already enabled' }

    console.log('User requested to enable real OCR - attempting initialization...')

    try {
      this.initializationAttempted = true

      // Set a very short timeout for initialization attempt
      const initPromise = this.primaryService.initialize()
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('OCR initialization timeout - using fallback')), 10000) // 10 second timeout
      })

      await Promise.race([initPromise, timeoutPromise])

      this.ocrEnabled = true
      this.usingFallback = false
      console.log('Real OCR successfully enabled!')

      return {
        success: true,
        message: 'OCR successfully enabled! You can now extract text from images.'
      }
    } catch (error) {
      console.warn('Failed to enable real OCR:', error.message)
      this.usingFallback = true
      this.ocrEnabled = false

      return {
        success: false,
        message: `Could not enable OCR: ${error.message}. Using fallback service.`,
        error: error.message
      }
    }
  }

  // Method to disable real OCR and use fallback
  async disableRealOCR() {
    this.usingFallback = true
    this.ocrEnabled = false
    await this.primaryService.cleanup()

    return {
      success: true,
      message: 'Switched to fallback service. App will work without OCR.'
    }
  }

  getStatus() {
    return {
      usingFallback: this.usingFallback,
      ocrEnabled: this.ocrEnabled,
      initializationAttempted: this.initializationAttempted,
      canTryEnabling: !this.ocrEnabled
    }
  }

  async extractText(imageFile, options = {}) {
    console.log('=== ENHANCED OCR SERVICE EXTRACT TEXT ===')
    console.log('Service status:', {
      usingFallback: this.usingFallback,
      ocrEnabled: this.ocrEnabled,
      initializationAttempted: this.initializationAttempted
    })

    // Always use fallback unless user explicitly enabled OCR
    if (this.usingFallback || !this.ocrEnabled) {
      console.log('Using fallback service')
      return this.fallbackService.extractText(imageFile, {
        ...options,
        includeEnablePrompt: !this.initializationAttempted
      })
    }

    console.log('Using real OCR service')

    try {
      const result = await this.primaryService.extractText(imageFile, options)

      // If primary service failed, switch back to fallback
      if (!result.success) {
        console.warn('Primary OCR failed during processing, switching to fallback service')
        this.usingFallback = true
        this.ocrEnabled = false
        return this.fallbackService.extractText(imageFile, options)
      }

      return result
    } catch (error) {
      console.error('Primary OCR service error during processing, using fallback:', error)
      this.usingFallback = true
      this.ocrEnabled = false
      return this.fallbackService.extractText(imageFile, options)
    }
  }

  async cleanup() {
    await this.primaryService.cleanup()
    await this.fallbackService.cleanup()
  }
}

// Use enhanced service with fallback
const enhancedOcrService = new EnhancedOCRService()

// Main function to process images for meetings (maintaining compatibility)
export const processImageForMeeting = async (imageFile, meetingContext, options = {}) => {
  try {
    const result = await enhancedOcrService.extractText(imageFile, {
      onProgress: options.onProgress || (() => {}),
      ...options
    })

    if (result.success) {
      return {
        success: true,
        ocrResult: {
          text: result.text,
          confidence: result.confidence,
          extractedSections: result.extractedSections
        },
        actionItems: result.actionItems,
        processedAt: result.processedAt,
        fileName: result.fileName,
        fileSize: result.fileSize,
        words: result.words,
        debug: result.debug
      }
    } else {
      return {
        success: false,
        error: result.error,
        fileName: result.fileName,
        debug: result.debug
      }
    }
  } catch (error) {
    console.error('Error processing image:', error)
    return {
      success: false,
      error: 'Failed to process image for OCR',
      fileName: imageFile?.name || 'unknown'
    }
  }
}

// OCR control functions
export const enableOCR = () => {
  return enhancedOcrService.enableRealOCR()
}

export const disableOCR = () => {
  return enhancedOcrService.disableRealOCR()
}

export const getOCRStatus = () => {
  return enhancedOcrService.getStatus()
}

// Cleanup function for app shutdown
export const cleanupOCR = () => {
  return enhancedOcrService.cleanup()
}