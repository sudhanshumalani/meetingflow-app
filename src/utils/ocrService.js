// Clean OCR Service using only OCR.space API
export class OCRService {
  constructor() {
    this.userApiKey = localStorage.getItem('ocrApiKey') || null
    this.apiUrl = 'https://api.ocr.space/parse/image'
    console.log('OCR Service initialized with API key:', this.userApiKey ? 'present' : 'missing')
    console.log('Raw API key value:', this.userApiKey)
  }

  setUserApiKey(apiKey) {
    this.userApiKey = apiKey?.trim() || null
    console.log('OCR.space API key', this.userApiKey ? `configured: ${this.userApiKey.substring(0, 8)}...` : 'removed')
  }

  async extractText(imageFile, options = {}) {
    const { onProgress = () => {} } = options

    try {
      onProgress(5)
      console.log('Starting OCR extraction...')
      console.log('API key available:', !!this.userApiKey)

      if (!this.userApiKey || this.userApiKey.trim() === '') {
        console.log('No OCR.space API key configured, using fallback')
        return await this._extractWithFallback(imageFile, onProgress)
      }

      // Try OCR.space API
      console.log('Attempting OCR.space with API key:', this.userApiKey.substring(0, 8) + '...')
      onProgress(25)
      const result = await this._extractWithOCRSpace(imageFile, onProgress)

      if (result && result.success) {
        console.log('OCR.space API successful!')
        return result
      } else {
        throw new Error('OCR.space returned unsuccessful result')
      }

    } catch (error) {
      console.error('OCR.space API failed:', error.message)
      return await this._extractWithFallback(imageFile, onProgress)
    }
  }

  async _extractWithOCRSpace(imageFile, onProgress) {
    try {
      console.log('OCR.space: Starting API call with file:', imageFile.name, 'size:', imageFile.size)

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
      console.log('OCR.space: Sending request to:', this.apiUrl)

      // Make API call to OCR.space
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        body: formData
      })

      console.log('OCR.space: Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('OCR.space: API error response:', errorText)
        throw new Error(`OCR.space API error: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      console.log('OCR.space: Full API result:', result)
      onProgress(50)

      if (!result.IsErroredOnProcessing && result.ParsedResults && result.ParsedResults.length > 0) {
        const text = result.ParsedResults[0].ParsedText.trim()

        if (!text || text.length < 2) {
          throw new Error('No meaningful text extracted from OCR.space')
        }

        console.log('OCR.space extraction successful:', text.length, 'characters')
        console.log('Extracted text:', text)

        const processedResult = this.processOCRResult({
          text: text,
          confidence: result.ParsedResults[0].TextOverlay ? 90 : 85
        })

        processedResult.debug = {
          method: 'OCR.space API',
          processingTime: result.ProcessingTimeInMilliseconds
        }

        onProgress(100)
        return processedResult

      } else {
        const errorMessage = result.ErrorMessage || result.ParsedResults?.[0]?.ErrorMessage || 'Unknown OCR.space error'
        console.error('OCR.space: Processing failed:', errorMessage)
        console.error('OCR.space: Full result object:', JSON.stringify(result, null, 2))
        throw new Error(`OCR.space processing failed: ${errorMessage}`)
      }

    } catch (error) {
      console.error('OCR.space: Exception in _extractWithOCRSpace:', error)
      throw error
    }
  }

  async _extractWithFallback(imageFile, onProgress) {
    console.log('Using fallback mode for:', imageFile.name)
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
        notes: [] // Don't auto-populate fallback text
      },
      actionItems: [],
      debug: {
        isFallback: true,
        reason: 'OCR.space API unavailable or no API key configured',
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

    console.log('Processing OCR result with text:', text.substring(0, 100) + '...')

    // Always distribute text across quadrants for better user experience
    const lines = text.split('\n').filter(line => line.trim().length > 0)
    console.log('Split into', lines.length, 'lines')

    // Smart distribution - try to extract sections, but always populate quadrants
    const sections = this.extractSections(text)
    console.log('Extracted sections:', sections)

    // If sections are mostly empty, distribute raw text
    const hasContentInSections = sections.agenda.length > 0 || sections.decisions.length > 0 ||
                                 sections.actionItems.length > 0 || sections.attendees.length > 0

    if (!hasContentInSections && lines.length > 0) {
      // Distribute all lines across the notes section so Meeting.jsx can handle it
      sections.notes = lines
      console.log('No specific sections found, putting all text in notes section:', lines.length, 'lines')
    } else if (hasContentInSections) {
      console.log('Sections found - agenda:', sections.agenda.length, 'decisions:', sections.decisions.length, 'actions:', sections.actionItems.length, 'attendees:', sections.attendees.length)
    }

    const actionItems = this.extractActionItems(text)

    return {
      success: true,
      confidence: data.confidence || 85,
      text: text,
      words: text.split(/\s+/).length,
      processedAt: new Date().toISOString(),
      extractedSections: sections,
      actionItems: actionItems,
      debug: {
        method: 'OCR.space API',
        linesCount: lines.length,
        hasContentInSections: hasContentInSections
      }
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

      // Detect section headers (but don't add the headers themselves)
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

      // Add line to current section if it's substantial
      if (line.length > 2) {
        sections[currentSection].push(line)
      }
    })

    return sections
  }

  extractActionItems(text) {
    const actionItems = []

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
    console.log('processImageForMeeting called with:', imageFile.name)

    const result = await ocrService.extractText(imageFile, {
      onProgress: options.onProgress || (() => {}),
      ...options
    })

    console.log('OCR service returned:', result)

    if (result.success) {
      const finalResult = {
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

      console.log('Final result being returned to Meeting.jsx:', finalResult)
      return finalResult
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
  localStorage.setItem('ocrApiKey', apiKey || '')
}

// Function to get current OCR capabilities
export const getOCRCapabilities = () => {
  return {
    textDetector: false, // Removed
    tesseract: false,    // Removed
    ocrSpace: !!ocrService.userApiKey,
    initialized: true
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

// Cleanup function (no longer needed but kept for compatibility)
export const cleanupOCR = () => {
  return Promise.resolve()
}