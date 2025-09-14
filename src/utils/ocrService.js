import { createWorker } from 'tesseract.js'

// Multi-tier OCR Service with TextDetector API, OCR.space, and Tesseract.js fallbacks
export class OCRService {
  constructor() {
    this.tesseractWorker = null
    this.isInitialized = false
    this.userApiKey = null // User-configured OCR.space API key
    this.ocrSpaceUrl = 'https://api.ocr.space/parse/image'
  }

  async initialize() {
    // Try to initialize Tesseract.js as a fallback option
    if (!this.isInitialized && !this.tesseractWorker) {
      try {
        console.log('Initializing Tesseract.js as OCR fallback...')
        this.tesseractWorker = await createWorker('eng', 1, {
          logger: () => {} // Silent logging
        })
        this.isInitialized = true
        console.log('Tesseract.js fallback ready')
      } catch (error) {
        console.log('Tesseract.js initialization failed, will use manual fallback only')
      }
    }
  }

  async cleanup() {
    if (this.tesseractWorker) {
      try {
        await this.tesseractWorker.terminate()
      } catch (error) {
        // Silent cleanup
      }
      this.tesseractWorker = null
    }
    this.isInitialized = false
  }

  setUserApiKey(apiKey) {
    this.userApiKey = apiKey?.trim() || null
    console.log('OCR.space API key', this.userApiKey ? 'configured' : 'removed')
  }

  async extractText(imageFile, options = {}) {
    const { onProgress = () => {} } = options

    try {
      onProgress(5)
      console.log('Starting OCR extraction with multi-tier approach...')

      // Tier 1: Try experimental TextDetector API (Chrome only, experimental)
      try {
        if ('TextDetector' in window) {
          console.log('Attempting TextDetector API...')
          onProgress(15)
          const result = await this._extractWithTextDetector(imageFile, onProgress)
          if (result && result.success) {
            console.log('TextDetector API successful!')
            return result
          }
        }
      } catch (error) {
        console.log('TextDetector API failed:', error.message)
      }

      // Tier 2: Try OCR.space with user API key
      if (this.userApiKey) {
        try {
          console.log('Attempting OCR.space with user API key...')
          onProgress(25)
          const result = await this._extractWithOCRSpace(imageFile, onProgress)
          if (result && result.success) {
            console.log('OCR.space API successful!')
            return result
          }
        } catch (error) {
          console.log('OCR.space API failed:', error.message)
        }
      }

      // Tier 3: Try Tesseract.js fallback
      if (this.tesseractWorker && this.isInitialized) {
        try {
          console.log('Attempting Tesseract.js fallback...')
          onProgress(40)
          const result = await this._extractWithTesseract(imageFile, onProgress)
          if (result && result.success) {
            console.log('Tesseract.js successful!')
            return result
          }
        } catch (error) {
          console.log('Tesseract.js failed:', error.message)
        }
      }

      // Final fallback: Manual entry mode
      console.log('All OCR methods failed, using manual fallback')
      return await this._extractWithFallback(imageFile, onProgress)

    } catch (error) {
      console.error('OCR extraction error:', error)
      return await this._extractWithFallback(imageFile, onProgress)
    }
  }

  async _extractWithTextDetector(imageFile, onProgress) {
    try {
      // Create bitmap from image file
      const bitmap = await createImageBitmap(imageFile)
      onProgress(20)

      const detector = new TextDetector()
      const textBlocks = await detector.detect(bitmap)

      if (textBlocks && textBlocks.length > 0) {
        // Combine all detected text
        const text = textBlocks.map(block => block.rawValue).join(' ')

        if (text.trim().length < 3) {
          throw new Error('No meaningful text detected')
        }

        console.log('TextDetector extracted:', text.length, 'characters')

        const processedResult = this.processOCRResult({
          text: text.trim(),
          confidence: 80 // TextDetector doesn't provide confidence, estimate
        })

        processedResult.debug = {
          method: 'TextDetector API',
          blocksFound: textBlocks.length
        }

        return processedResult
      } else {
        throw new Error('No text blocks detected')
      }
    } catch (error) {
      throw new Error(`TextDetector failed: ${error.message}`)
    }
  }

  async _extractWithOCRSpace(imageFile, onProgress) {
    try {
      // Prepare form data for OCR.space API
      const formData = new FormData()
      formData.append('apikey', this.userApiKey)
      formData.append('language', 'eng')
      formData.append('isOverlayRequired', 'false')
      formData.append('detectOrientation', 'true')
      formData.append('scale', 'true')
      formData.append('isTable', 'false')
      formData.append('OCREngine', '2') // Use OCR Engine 2 for better accuracy
      formData.append('file', imageFile)

      onProgress(35)

      // Make API call to OCR.space
      const response = await fetch(this.ocrSpaceUrl, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`OCR.space API error: ${response.status}`)
      }

      const result = await response.json()
      onProgress(50)

      if (!result.IsErroredOnProcessing && result.ParsedResults && result.ParsedResults.length > 0) {
        const text = result.ParsedResults[0].ParsedText.trim()

        if (!text || text.length < 2) {
          throw new Error('No meaningful text extracted from OCR.space')
        }

        console.log('OCR.space extraction successful:', text.length, 'characters')

        const processedResult = this.processOCRResult({
          text: text,
          confidence: result.ParsedResults[0].TextOverlay ? 90 : 85
        })

        processedResult.debug = {
          method: 'OCR.space API',
          processingTime: result.ProcessingTimeInMilliseconds
        }

        return processedResult

      } else {
        const errorMessage = result.ErrorMessage || result.ParsedResults?.[0]?.ErrorMessage || 'Unknown OCR.space error'
        throw new Error(`OCR.space processing failed: ${errorMessage}`)
      }

    } catch (error) {
      throw new Error(`OCR.space failed: ${error.message}`)
    }
  }

  async _extractWithTesseract(imageFile, onProgress) {
    try {
      // Create object URL for Tesseract
      const imageUrl = URL.createObjectURL(imageFile)

      onProgress(60)

      // Use Tesseract with basic configuration
      const result = await this.tesseractWorker.recognize(imageUrl, {}, {
        hocr: false,
        tsv: false,
        boxes: false,
        unlv: false,
        osd: false,
      })

      URL.revokeObjectURL(imageUrl)

      if (result.data && result.data.text) {
        const text = result.data.text.trim()

        if (!text || text.length < 3) {
          throw new Error('No meaningful text extracted from Tesseract')
        }

        console.log('Tesseract extraction successful:', text.length, 'characters')

        const processedResult = this.processOCRResult({
          text: text,
          confidence: result.data.confidence || 70
        })

        processedResult.debug = {
          method: 'Tesseract.js',
          confidence: result.data.confidence
        }

        onProgress(90)
        return processedResult

      } else {
        throw new Error('Tesseract returned no text data')
      }

    } catch (error) {
      throw new Error(`Tesseract failed: ${error.message}`)
    }
  }

  async _extractWithFallback(imageFile, onProgress) {
    // Simulate processing time for better UX
    onProgress(70)
    await new Promise(resolve => setTimeout(resolve, 500))
    onProgress(90)

    const fallbackText = `Image uploaded: ${imageFile.name}

The text in this image could not be automatically extracted. You can:
• Manually type the key points from the image into the digital notes
• Use the image as a visual reference for your meeting
• Take additional notes about what's shown in the image
• Configure your own OCR.space API key in settings for better text extraction

The image has been saved and will be included in your meeting record.`

    onProgress(100)

    return {
      success: true,
      text: fallbackText,
      confidence: 0,
      words: fallbackText.split(/\s+/).length,
      processedAt: new Date().toISOString(),
      fileName: imageFile.name,
      fileSize: imageFile.size,
      extractedSections: {
        agenda: [],
        decisions: [],
        actionItems: [],
        notes: [], // Don't auto-populate fallback text
        attendees: []
      },
      actionItems: [],
      debug: {
        isFallback: true,
        reason: 'All OCR methods failed or unavailable',
        timestamp: new Date().toISOString(),
        methods: ['TextDetector', 'OCR.space', 'Tesseract.js'].filter(method => {
          if (method === 'TextDetector') return 'TextDetector' in window
          if (method === 'OCR.space') return !!this.userApiKey
          if (method === 'Tesseract.js') return !!this.tesseractWorker
          return false
        }).join(', ') || 'None available'
      }
    }
  }

  processOCRResult(data) {
    const text = data.text.trim()

    // Enhanced validation for text quality
    if (!text || text.length < 3) {
      throw new Error('No meaningful text extracted')
    }

    // Check for gibberish patterns
    const qualityScore = this._calculateTextQuality(text)
    console.log(`OCR text quality score: ${qualityScore}%`)

    if (qualityScore < 30) {
      console.warn('Low quality OCR text detected, may contain errors')
    }

    // Extract structured information from OCR text
    const sections = this.extractSections(text)
    const actionItems = this.extractActionItems(text)

    return {
      success: true,
      confidence: data.confidence || 75,
      qualityScore: qualityScore,
      text: text,
      words: text.split(/\s+/).length,
      processedAt: new Date().toISOString(),
      extractedSections: sections,
      actionItems: actionItems
    }
  }

  _calculateTextQuality(text) {
    let score = 100

    // Check for excessive special characters (sign of poor OCR)
    const specialCharRatio = (text.match(/[^a-zA-Z0-9\s.,!?;:()\'""-]/g) || []).length / text.length
    if (specialCharRatio > 0.3) score -= 40

    // Check for reasonable word length distribution
    const words = text.split(/\s+/)
    const veryLongWords = words.filter(word => word.length > 20).length
    if (veryLongWords / words.length > 0.1) score -= 30

    // Check for reasonable character distribution
    const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length
    if (alphaRatio < 0.3) score -= 25 // Too few letters suggests poor recognition

    // Check for excessive repetition (common OCR error)
    const uniqueWords = new Set(words.map(w => w.toLowerCase()))
    const repetitionRatio = 1 - (uniqueWords.size / Math.max(words.length, 1))
    if (repetitionRatio > 0.6) score -= 20

    // Check for reasonable sentence structure
    const sentenceCount = (text.match(/[.!?]+/g) || []).length
    if (sentenceCount === 0 && text.length > 50) score -= 15

    return Math.max(0, score)
  }

  extractSections(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)

    const sections = {
      agenda: [],
      decisions: [],
      actionItems: [],
      notes: [],
      attendees: []
    }

    // Simple section extraction based on common patterns
    let currentSection = 'notes' // Default section

    lines.forEach(line => {
      const lower = line.toLowerCase()

      // Detect section headers
      if (lower.includes('agenda') || lower.includes('topics')) {
        currentSection = 'agenda'
        return
      } else if (lower.includes('decision') || lower.includes('resolved')) {
        currentSection = 'decisions'
        return
      } else if (lower.includes('action') || lower.includes('todo') || lower.includes('next step')) {
        currentSection = 'actionItems'
        return
      } else if (lower.includes('attendee') || lower.includes('participant')) {
        currentSection = 'attendees'
        return
      }

      // Add line to current section
      if (line.length > 5) { // Filter out very short lines
        sections[currentSection].push(line)
      }
    })

    return sections
  }

  extractActionItems(text) {
    const actionItems = []
    const lines = text.split('\n')

    const actionPatterns = [
      /(?:action|todo|task|follow.?up):\s*(.+)/gi,
      /(?:need to|should|must|will)\s+(.+?)(?:\.|$)/gi,
      /^\s*[-•*]\s*(.+?)(?:\s+by\s+(.+?))?(?:\.|$)/gmi
    ]

    actionPatterns.forEach(pattern => {
      let match
      while ((match = pattern.exec(text)) !== null) {
        const task = match[1]?.trim()
        const assignee = match[2]?.trim()

        if (task && task.length > 10) {
          actionItems.push({
            id: Math.random().toString(36).substr(2, 9),
            text: task,
            assignee: assignee || 'Unassigned',
            priority: 'medium',
            completed: false,
            createdAt: new Date().toISOString()
          })
        }
      }
    })

    return actionItems.slice(0, 10) // Limit to 10 action items
  }
}

// Create singleton instance
const ocrService = new OCRService()

// Load saved API key from localStorage
const savedApiKey = localStorage.getItem('ocrApiKey')
if (savedApiKey) {
  ocrService.setUserApiKey(savedApiKey)
  console.log('OCR.space API key loaded from localStorage')
}

// Initialize on first load
ocrService.initialize().catch(() => {
  console.log('OCR service initialization completed with fallback only')
})

// Main function to process images for meetings
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

// Function to configure user's OCR.space API key
export const setOCRApiKey = (apiKey) => {
  ocrService.setUserApiKey(apiKey)
}

// Function to get current OCR capabilities
export const getOCRCapabilities = () => {
  return {
    textDetector: 'TextDetector' in window,
    tesseract: !!ocrService.tesseractWorker,
    ocrSpace: !!ocrService.userApiKey,
    initialized: ocrService.isInitialized
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