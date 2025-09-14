// Simple, reliable OCR service with Claude AI integration
export class SimpleOCRService {
  constructor() {
    this.apiKey = localStorage.getItem('ocrApiKey') || null
    this.claudeApiKey = localStorage.getItem('claudeApiKey') || null
  }

  setOCRApiKey(key) {
    this.apiKey = key?.trim() || null
    if (key) {
      localStorage.setItem('ocrApiKey', key)
    } else {
      localStorage.removeItem('ocrApiKey')
    }
  }

  setClaudeApiKey(key) {
    this.claudeApiKey = key?.trim() || null
    if (key) {
      localStorage.setItem('claudeApiKey', key)
    } else {
      localStorage.removeItem('claudeApiKey')
    }
  }

  async extractTextFromImage(imageFile, onProgress = () => {}) {
    console.log('Starting OCR extraction for:', imageFile.name)
    onProgress(10)

    try {
      // Try OCR.space API first
      if (this.apiKey) {
        console.log('Using OCR.space API')
        onProgress(30)
        const result = await this.callOCRSpaceAPI(imageFile, onProgress)
        if (result.success) {
          return result
        }
      }

      // Fallback to simple text placeholder
      console.log('Using fallback mode')
      return this.createFallbackResult(imageFile)

    } catch (error) {
      console.error('OCR extraction failed:', error)
      return this.createFallbackResult(imageFile, error.message)
    }
  }

  async callOCRSpaceAPI(imageFile, onProgress) {
    const formData = new FormData()
    formData.append('apikey', this.apiKey)
    formData.append('language', 'eng')
    formData.append('isOverlayRequired', 'false')
    formData.append('detectOrientation', 'true')
    formData.append('scale', 'true')
    formData.append('OCREngine', '2')
    formData.append('file', imageFile)

    onProgress(50)

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(`OCR API failed: ${response.status}`)
    }

    const data = await response.json()
    onProgress(80)

    if (data.IsErroredOnProcessing) {
      throw new Error(data.ErrorMessage || 'OCR processing failed')
    }

    if (!data.ParsedResults || data.ParsedResults.length === 0) {
      throw new Error('No text found in image')
    }

    const extractedText = data.ParsedResults[0].ParsedText?.trim()
    if (!extractedText || extractedText.length < 3) {
      throw new Error('No meaningful text extracted')
    }

    onProgress(100)
    console.log('OCR successful, extracted:', extractedText.length, 'characters')

    return {
      success: true,
      text: extractedText,
      confidence: 90,
      method: 'OCR.space API',
      timestamp: new Date().toISOString()
    }
  }

  createFallbackResult(imageFile, error = null) {
    const fallbackText = error ?
      `OCR Error: ${error}\n\nImage: ${imageFile.name}\nPlease configure OCR.space API key in Settings or manually enter the text.` :
      `Image uploaded: ${imageFile.name}\n\nPlease configure OCR.space API key in Settings for automatic text extraction, or manually enter the text below.`

    return {
      success: true,
      text: fallbackText,
      confidence: 0,
      method: 'Manual Entry',
      isFallback: true,
      timestamp: new Date().toISOString()
    }
  }

  // Claude AI integration for processing extracted text
  async processWithClaude(text, meetingContext = {}) {
    if (!this.claudeApiKey) {
      console.log('No Claude API key configured')
      return null
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.claudeApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: `Please analyze this meeting text and extract structured information:

Text: """${text}"""

Meeting Context: ${JSON.stringify(meetingContext, null, 2)}

Please provide a JSON response with:
{
  "summary": "Brief 2-3 sentence summary",
  "keyPoints": ["point1", "point2", ...],
  "decisions": ["decision1", "decision2", ...],
  "actionItems": [{"task": "description", "assignee": "person", "priority": "high/medium/low"}],
  "challenges": ["challenge1", "challenge2", ...],
  "sentiment": "positive/neutral/negative",
  "insights": ["insight1", "insight2", ...],
  "relationships": [{"stakeholder1": "name", "stakeholder2": "name", "interaction": "description"}]
}`
          }]
        })
      })

      if (!response.ok) {
        throw new Error(`Claude API failed: ${response.status}`)
      }

      const data = await response.json()
      const content = data.content[0]?.text

      if (!content) {
        throw new Error('No response from Claude')
      }

      // Try to parse JSON from Claude's response
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0])
        }
      } catch (parseError) {
        console.warn('Could not parse Claude JSON response:', parseError)
      }

      // Return structured fallback if JSON parsing fails
      return {
        summary: content.substring(0, 200),
        keyPoints: [content],
        decisions: [],
        actionItems: [],
        challenges: [],
        sentiment: 'neutral',
        insights: [],
        relationships: []
      }

    } catch (error) {
      console.error('Claude processing failed:', error)
      return null
    }
  }
}

// Create singleton instance
const ocrService = new SimpleOCRService()

// Main export functions
export const extractTextFromImage = async (imageFile, options = {}) => {
  return await ocrService.extractTextFromImage(imageFile, options.onProgress)
}

export const processWithClaude = async (text, meetingContext) => {
  return await ocrService.processWithClaude(text, meetingContext)
}

export const setOCRApiKey = (key) => {
  ocrService.setOCRApiKey(key)
}

export const setClaudeApiKey = (key) => {
  ocrService.setClaudeApiKey(key)
}

export const getCapabilities = () => {
  return {
    ocrSpace: !!ocrService.apiKey,
    claude: !!ocrService.claudeApiKey,
    manual: true
  }
}