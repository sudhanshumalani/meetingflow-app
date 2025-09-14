import Tesseract from 'tesseract.js'

// OCR Service using Tesseract.js for real text extraction
export class OCRService {
  constructor() {
    this.worker = null
    this.isInitialized = false
  }

  async initialize() {
    if (this.isInitialized) return

    try {
      console.log('=== OCR INITIALIZATION DEBUG ===')
      console.log('Tesseract object:', typeof Tesseract, Tesseract)

      // Check if running in browser environment
      console.log('Environment check:', {
        isBrowser: typeof window !== 'undefined',
        hasNavigator: typeof navigator !== 'undefined',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A'
      })

      console.log('Creating Tesseract worker...')
      this.worker = await Tesseract.createWorker({
        corePath: 'https://unpkg.com/tesseract.js-core@4.0.6/tesseract-core-simd.js',
        workerPath: 'https://unpkg.com/tesseract.js@4.1.1/dist/worker.min.js',
        logger: (m) => {
          console.log('Tesseract initialization logger:', m)
          // Optional: log progress for debugging
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`)
          }
        }
      })
      console.log('Worker created successfully:', this.worker)

      console.log('Loading language...')
      await this.worker.loadLanguage('eng')
      console.log('Language loaded')

      console.log('Initializing worker...')
      await this.worker.initialize('eng')
      console.log('Worker initialized')

      // Optimize for better text recognition
      await this.worker.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?;:()[]{}"-•√×÷°@#$%&*+=<>/\\|~`^_',
        preserve_interword_spaces: '1',
      })

      this.isInitialized = true
    } catch (error) {
      console.error('Failed to initialize OCR worker:', error)
      throw new Error('OCR initialization failed')
    }
  }

  async extractText(imageFile, options = {}) {
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
      const imageUrl = URL.createObjectURL(imageFile)
      console.log('Created image URL for Tesseract:', imageUrl)

      // Verify the worker is properly initialized
      if (!this.worker) {
        throw new Error('OCR worker not properly initialized')
      }

      // Run OCR with progress callback
      console.log('Calling worker.recognize with image URL...')
      onProgress(10) // Initial progress
      const { data } = await this.worker.recognize(imageUrl, {
        logger: (m) => {
          console.log('Tesseract recognition logger:', m)
          if (m.status === 'recognizing text' && m.progress) {
            console.log(`Recognition progress: ${Math.round(m.progress * 100)}%`)
            onProgress(Math.round(m.progress * 100))
          }
        }
      })

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

      // Don't fall back to mock data - return clear error
      return {
        success: false,
        error: `OCR processing failed: ${error.message || 'Unknown error'}`,
        fileName: imageFile.name,
        debug: {
          errorType: error.constructor.name,
          timestamp: new Date().toISOString()
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

// Singleton instance
const ocrService = new OCRService()

// Main function to process images for meetings (maintaining compatibility)
export const processImageForMeeting = async (imageFile, meetingContext, options = {}) => {
  try {
    const result = await ocrService.extractText(imageFile, {
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
        words: result.words
      }
    } else {
      return {
        success: false,
        error: result.error,
        fileName: result.fileName
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

// Cleanup function for app shutdown
export const cleanupOCR = () => {
  return ocrService.cleanup()
}