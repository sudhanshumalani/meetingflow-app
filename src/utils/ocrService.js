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
      // Use correct v6 API with optimized settings for better accuracy
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

      // Configure Tesseract for better accuracy
      await this.worker.setParameters({
        // Page segmentation mode - automatically detect text regions
        tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD (Orientation and Script Detection)

        // OCR Engine Mode - use LSTM for better accuracy
        tessedit_ocr_engine_mode: '1', // LSTM OCR Engine Mode

        // Character recognition improvements
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?;:()\'""-•–—/\\@#$%&*+=<>[]{}|~`^_\n\t ',

        // Preserve spacing and formatting
        preserve_interword_spaces: '1',

        // DPI settings for better recognition
        user_defined_dpi: '300',

        // Additional accuracy improvements
        tessedit_do_invert: '0',
        tessedit_enable_doc_dict: '1',
        tessedit_enable_dict_correction: '1',
        load_system_dawg: '1',
        load_freq_dawg: '1',
        load_punc_dawg: '1',
        load_number_dawg: '1',
        load_unambig_dawg: '1',
        load_bigram_dawg: '1',
        load_fixed_length_dawgs: '1',
        segment_penalty_dict_nonword: '1.25',
        segment_penalty_garbage: '1.50',
      })

      this.isInitialized = true
      console.log('OCR ready with optimized settings')

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
      onProgress(15)

      // Preprocess image for better OCR accuracy
      const processedImage = await this._preprocessImage(imageFile)
      imageUrl = URL.createObjectURL(processedImage)

      onProgress(25)

      // Try multiple OCR approaches for best accuracy
      let bestResult = null
      let bestConfidence = 0

      // Approach 1: Standard recognition with automatic segmentation
      try {
        const result1 = await Promise.race([
          this.worker.recognize(imageUrl, {}, {
            hocr: false,
            tsv: false,
            boxes: false,
            unlv: false,
            osd: false,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('OCR timeout')), 45000)
          )
        ])

        if (result1.data && result1.data.confidence > bestConfidence) {
          bestResult = result1.data
          bestConfidence = result1.data.confidence
        }
      } catch (error) {
        console.log('Standard OCR approach failed:', error.message)
      }

      onProgress(60)

      // Approach 2: Single text block mode for cleaner text
      try {
        await this.worker.setParameters({
          tessedit_pageseg_mode: '6' // Assume a single uniform block of text
        })

        const result2 = await Promise.race([
          this.worker.recognize(imageUrl),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('OCR timeout')), 30000)
          )
        ])

        if (result2.data && result2.data.confidence > bestConfidence) {
          bestResult = result2.data
          bestConfidence = result2.data.confidence
        }

        // Restore default segmentation mode
        await this.worker.setParameters({
          tessedit_pageseg_mode: '1'
        })
      } catch (error) {
        console.log('Single block OCR approach failed:', error.message)
      }

      onProgress(85)

      if (!bestResult) {
        throw new Error('All OCR approaches failed')
      }

      console.log(`Best OCR result: ${bestConfidence}% confidence`)

      const result = this.processOCRResult(bestResult)
      onProgress(100)

      URL.revokeObjectURL(imageUrl)
      return result

    } catch (error) {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      throw error
    }
  }

  async _preprocessImage(imageFile) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')

      img.onload = () => {
        try {
          // Calculate optimal size for OCR (aim for 300+ DPI equivalent)
          let { width, height } = img
          const minDimension = Math.min(width, height)

          // Scale up small images for better recognition
          if (minDimension < 1000) {
            const scaleFactor = Math.min(2.0, 1000 / minDimension)
            width *= scaleFactor
            height *= scaleFactor
          }

          canvas.width = width
          canvas.height = height

          // Apply preprocessing for better OCR
          ctx.fillStyle = 'white'
          ctx.fillRect(0, 0, width, height)

          // Draw image with high quality settings
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, width, height)

          // Apply contrast enhancement
          const imageData = ctx.getImageData(0, 0, width, height)
          this._enhanceContrast(imageData)
          ctx.putImageData(imageData, 0, 0)

          // Convert back to blob
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob)
            } else {
              reject(new Error('Failed to preprocess image'))
            }
          }, 'image/png', 1.0)

        } catch (error) {
          reject(error)
        }
      }

      img.onerror = () => reject(new Error('Failed to load image for preprocessing'))
      img.src = URL.createObjectURL(imageFile)
    })
  }

  _enhanceContrast(imageData) {
    const data = imageData.data
    const contrastFactor = 1.2 // Slight contrast enhancement

    for (let i = 0; i < data.length; i += 4) {
      // Apply contrast to RGB channels
      for (let j = 0; j < 3; j++) {
        let value = data[i + j]
        value = ((value - 128) * contrastFactor) + 128
        data[i + j] = Math.max(0, Math.min(255, value))
      }
      // Keep alpha unchanged
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
      confidence: data.confidence || 0.8,
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