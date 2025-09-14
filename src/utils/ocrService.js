// High-quality OCR Service using OCR.space free API
export class OCRService {
  constructor() {
    this.isInitialized = true // Always ready since it's API-based
    this.apiKey = 'helloworld' // OCR.space free tier API key
    this.apiUrl = 'https://api.ocr.space/parse/image'
  }

  async initialize() {
    // No initialization needed for API-based service
    return Promise.resolve()
  }

  async cleanup() {
    // No cleanup needed for API-based service
    return Promise.resolve()
  }

  async extractText(imageFile, options = {}) {
    const { onProgress = () => {} } = options

    try {
      onProgress(10)

      // Always try OCR.space API first
      return await this._extractWithOCRSpace(imageFile, onProgress)

    } catch (error) {
      console.log('OCR.space API failed, using fallback:', error.message)
      return await this._extractWithFallback(imageFile, onProgress)
    }
  }

  async _extractWithOCRSpace(imageFile, onProgress) {
    try {
      onProgress(25)

      // Convert image to base64
      const base64Image = await this._imageToBase64(imageFile)
      onProgress(40)

      // Prepare form data for OCR.space API
      const formData = new FormData()
      formData.append('apikey', this.apiKey)
      formData.append('language', 'eng')
      formData.append('isOverlayRequired', 'false')
      formData.append('detectOrientation', 'true')
      formData.append('isCreateSearchablePdf', 'false')
      formData.append('isSearchablePdfHideTextLayer', 'false')
      formData.append('scale', 'true')
      formData.append('isTable', 'false')
      formData.append('OCREngine', '2') // Use OCR Engine 2 for better accuracy
      formData.append('file', imageFile)

      onProgress(50)

      // Make API call to OCR.space
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`OCR.space API error: ${response.status}`)
      }

      const result = await response.json()
      onProgress(80)

      if (!result.IsErroredOnProcessing && result.ParsedResults && result.ParsedResults.length > 0) {
        const text = result.ParsedResults[0].ParsedText.trim()

        if (!text || text.length < 2) {
          throw new Error('No meaningful text extracted')
        }

        console.log('OCR.space extraction successful:', text.length, 'characters')

        const processedResult = this.processOCRResult({
          text: text,
          confidence: result.ParsedResults[0].TextOverlay ? 90 : 85 // Estimate confidence
        })

        onProgress(100)
        return processedResult

      } else {
        const errorMessage = result.ErrorMessage || result.ParsedResults?.[0]?.ErrorMessage || 'Unknown OCR.space error'
        throw new Error(`OCR.space processing failed: ${errorMessage}`)
      }

    } catch (error) {
      console.log('OCR.space API call failed:', error.message)
      throw error
    }
  }

  async _imageToBase64(imageFile) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        resolve(reader.result.split(',')[1]) // Remove data:image/... prefix
      }
      reader.onerror = reject
      reader.readAsDataURL(imageFile)
    })
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
        reason: 'OCR.space API unavailable or failed',
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
      confidence: data.confidence || 85, // OCR.space typically has higher confidence
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