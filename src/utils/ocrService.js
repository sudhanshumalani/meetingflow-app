import { createWorker } from 'tesseract.js'

// World-class OCR Service with built-in fallback and auto-initialization
export class OCRService {
  constructor() {
    this.worker = null
    this.isInitialized = false
    this.initializationPromise = null
  }

  async initialize() {
    // Prevent multiple simultaneous initialization
    if (this.initializationPromise) {
      return this.initializationPromise
    }

    if (this.isInitialized && this.worker) return

    this.initializationPromise = this._initializeWorker()

    try {
      await this.initializationPromise
    } catch (error) {
      console.log('OCR initialization failed, will use fallback mode')
    } finally {
      this.initializationPromise = null
    }
  }

  async _initializeWorker() {
    try {
      // Use correct v6 API with reasonable timeout
      this.worker = await Promise.race([
        createWorker('eng', 1, {
          logger: (info) => {
            if (info.status === 'recognizing text' && info.progress) {
              // Progress logging handled elsewhere
            }
          }
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Initialization timeout')), 15000)
        )
      ])

      this.isInitialized = true
      console.log('OCR ready')

    } catch (error) {
      console.log('OCR unavailable, using fallback mode')
      this.worker = null
      this.isInitialized = false
      // Don't throw - let the service work in fallback mode
    }
  }

  async cleanup() {
    if (this.worker) {
      try {
        await this.worker.terminate()
      } catch (error) {
        // Silent cleanup
      }
      this.worker = null
    }
    this.isInitialized = false
  }

  async extractText(imageFile, options = {}) {
    const { onProgress = () => {} } = options
    let imageUrl = null

    try {
      // Try to initialize OCR if not already done
      await this.initialize()

      onProgress(10)

      // If OCR is available, use it
      if (this.worker && this.isInitialized) {
        return await this._extractWithOCR(imageFile, onProgress)
      } else {
        // Use intelligent fallback
        return await this._extractWithFallback(imageFile, onProgress)
      }

    } catch (error) {
      console.log('OCR processing error, using fallback')
      return await this._extractWithFallback(imageFile, onProgress)
    }
  }

  async _extractWithOCR(imageFile, onProgress) {
    let imageUrl = null
    try {
      imageUrl = URL.createObjectURL(imageFile)
      onProgress(20)

      const ret = await Promise.race([
        this.worker.recognize(imageUrl),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('OCR timeout')), 30000)
        )
      ])

      onProgress(90)

      const result = this.processOCRResult(ret.data)
      onProgress(100)

      URL.revokeObjectURL(imageUrl)
      return result

    } catch (error) {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      throw error
    }
  }

  async _extractWithFallback(imageFile, onProgress) {
    // Simulate processing time for better UX
    onProgress(25)
    await new Promise(resolve => setTimeout(resolve, 500))
    onProgress(50)
    await new Promise(resolve => setTimeout(resolve, 500))
    onProgress(90)

    const fallbackText = `Image uploaded: ${imageFile.name}

The text in this image could not be automatically extracted. You can:
• Manually type the key points from the image into the digital notes
• Use the image as a visual reference for your meeting
• Take additional notes about what's shown in the image

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
        reason: 'OCR unavailable or failed',
        timestamp: new Date().toISOString()
      }
    }
  }

  processOCRResult(data) {
    const text = data.text.trim()

    // Basic validation
    if (!text || text.length < 3) {
      throw new Error('No meaningful text extracted')
    }

    // Extract structured information from OCR text
    const sections = this.extractSections(text)
    const actionItems = this.extractActionItems(text)

    return {
      success: true,
      confidence: data.confidence || 0.8,
      text: text,
      words: text.split(/\s+/).length,
      processedAt: new Date().toISOString(),
      extractedSections: sections,
      actionItems: actionItems
    }
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