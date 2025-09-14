// Vercel serverless function to proxy Claude API calls
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { text, meetingContext, apiKey } = req.body

    if (!apiKey) {
      return res.status(400).json({ error: 'API key required' })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `I will provide you with rough meeting notes. Your task is to carefully review them and produce an organized output with the following three sections:

**Summary** – Write a concise overview (3–5 sentences) capturing the overall purpose of the meeting and the main outcomes.

**Key Discussion Points** – List the most important topics discussed during the meeting in bullet points. Group related points together if appropriate.

**Action Items** – Provide a clear, numbered list of action items. Each action item should specify:
• What needs to be done
• Who is responsible (if identifiable from the notes)
• Any deadlines or timelines (if mentioned or implied)

Format the response cleanly with headers for each section. Do not include extraneous information or rephrase in a vague way—keep it clear, concise, and actionable.

Meeting Notes:
"""${text}"""

Meeting Context: ${JSON.stringify(meetingContext, null, 2)}

Please provide a JSON response with:
{
  "summary": "Concise 3-5 sentence overview capturing the overall purpose and main outcomes",
  "keyDiscussionPoints": ["Important topic discussed", "Key decision or insight", "Challenge or concern raised", ...],
  "actionItems": [
    {
      "task": "Clear description of what needs to be done",
      "assignee": "person responsible or 'Unassigned'",
      "priority": "high/medium/low",
      "dueDate": "deadline if mentioned or null"
    }
  ],
  "sentiment": "positive/neutral/negative"
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
        const parsed = JSON.parse(jsonMatch[0])
        return res.status(200).json({ success: true, data: parsed })
      }
    } catch (parseError) {
      console.warn('Could not parse Claude JSON response:', parseError)
    }

    // Return structured fallback if JSON parsing fails
    return res.status(200).json({
      success: true,
      data: {
        summary: content.substring(0, 200),
        keyDiscussionPoints: [content],
        actionItems: [],
        sentiment: 'neutral'
      }
    })

  } catch (error) {
    console.error('Claude proxy error:', error)
    return res.status(500).json({
      error: 'Claude processing failed',
      message: error.message
    })
  }
}