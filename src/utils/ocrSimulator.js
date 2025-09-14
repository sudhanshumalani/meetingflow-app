// Simulated OCR text extraction for demo purposes

export const simulateOCR = async (imageFile) => {
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000))
  
  // Mock OCR results based on common meeting scenarios
  const mockResults = [
    {
      confidence: 0.95,
      text: `Meeting Notes - Q4 Planning
      
Agenda Items:
• Budget review for next quarter
• Team restructuring proposals  
• Product roadmap adjustments
• Marketing campaign results

Key Decisions:
- Approved 15% budget increase for engineering
- New hire approvals for design team
- Launch date moved to January 15th

Action Items:
□ Sarah to finalize budget allocation by Friday
□ Marcus to update roadmap documentation
□ Schedule follow-up meeting for next week

Attendees: Sarah Chen, Marcus Johnson, Elena Rodriguez`,
      extractedSections: {
        agenda: ["Budget review", "Team restructuring", "Product roadmap", "Marketing results"],
        decisions: ["Budget increase approved", "New hires approved", "Launch date changed"],
        actionItems: ["Budget allocation - Sarah", "Roadmap update - Marcus", "Follow-up meeting"]
      }
    },
    {
      confidence: 0.87,
      text: `Sprint Review Meeting
      
Completed Stories:
• User authentication system ✓
• API endpoint optimizations ✓
• Dashboard performance improvements ✓

In Progress:
• Mobile responsive design (80% complete)
• Database migration (blocked)
• Email notification system

Blockers:
- Server migration delayed by infrastructure team
- Need design approval for mobile layouts
- Third-party API integration issues

Next Sprint Goals:
1. Complete mobile responsiveness
2. Resolve server migration blockers
3. Implement email notifications
4. Start user testing phase`,
      extractedSections: {
        completed: ["User authentication", "API optimizations", "Dashboard performance"],
        inProgress: ["Mobile design", "Database migration", "Email system"],
        blockers: ["Server migration", "Design approval", "API integration"],
        nextGoals: ["Mobile completion", "Migration resolution", "Email implementation", "User testing"]
      }
    },
    {
      confidence: 0.91,
      text: `Client Check-in Meeting
ABC Corp Partnership Review

Project Status:
✓ Phase 1 deliverables completed on time
✓ User acceptance testing passed
⚠ Phase 2 scope needs clarification
⚠ Additional resources required

Client Feedback:
"Very satisfied with the quality of deliverables.
The team has been responsive and professional.
Would like to explore additional features for Q2."

Concerns Raised:
- Timeline for Phase 2 seems aggressive
- Need better communication on technical decisions
- Budget discussions for scope additions

Next Steps:
• Schedule technical review meeting
• Prepare revised timeline proposal
• Document scope change requests
• Set up weekly check-in calls`,
      extractedSections: {
        status: ["Phase 1 complete", "UAT passed", "Phase 2 needs clarity", "Resources needed"],
        feedback: ["Quality satisfaction", "Responsive team", "Additional features interest"],
        concerns: ["Timeline aggressive", "Technical communication", "Budget discussions"],
        nextSteps: ["Technical review", "Timeline proposal", "Scope documentation", "Weekly calls"]
      }
    }
  ]
  
  // Return a random mock result
  const result = mockResults[Math.floor(Math.random() * mockResults.length)]
  
  // Add some random variation to confidence
  result.confidence = Math.max(0.75, result.confidence + (Math.random() - 0.5) * 0.2)
  
  return result
}

export const extractActionItems = (text) => {
  // Simple pattern matching for action items
  const patterns = [
    /□\s*(.*)/g,
    /•\s*(.+?(?:to\s+\w+|by\s+\w+|follow[\s-]up).*)/gi,
    /(?:action|todo|task):\s*(.*)/gi,
    /\d+\.\s*(.+)/g
  ]
  
  const actionItems = []
  patterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)]
    matches.forEach(match => {
      if (match[1] && match[1].trim().length > 10) {
        actionItems.push({
          text: match[1].trim(),
          completed: false,
          priority: 'medium',
          assignee: extractAssignee(match[1])
        })
      }
    })
  })
  
  return actionItems.slice(0, 5) // Limit to 5 items
}

const extractAssignee = (text) => {
  const namePatterns = [
    /(\w+)\s+to\s+/i,
    /assigned\s+to\s+(\w+)/i,
    /-\s*(\w+)\s*$/i
  ]
  
  for (const pattern of namePatterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1]
    }
  }
  
  return 'Unassigned'
}

export const processImageForMeeting = async (imageFile, meetingContext) => {
  try {
    const ocrResult = await simulateOCR(imageFile)
    const actionItems = extractActionItems(ocrResult.text)
    
    return {
      success: true,
      ocrResult,
      actionItems,
      processedAt: new Date().toISOString(),
      fileName: imageFile.name,
      fileSize: imageFile.size
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}