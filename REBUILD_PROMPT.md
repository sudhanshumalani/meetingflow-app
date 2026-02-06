# MeetingFlow App - Complete Rebuild Specification

> Use this prompt with Claude, ChatGPT, Perplexity, or any LLM to design and build a clean meeting management PWA from scratch.

---

## THE PROMPT

```
I want to build a Progressive Web App (PWA) called "MeetingFlow" - an intelligent meeting management application. I need you to help me design and build this from scratch with a clean, maintainable architecture.

## CORE CONSTRAINTS (NON-NEGOTIABLE)

1. **PWA for iOS Safari** - Must work as installable home screen app on iOS. This means:
   - No APIs that don't work in iOS Safari standalone mode
   - Lazy-load Firebase SDK (module-level imports break iOS PWA)
   - Use REST API fallbacks where SDK doesn't work
   - Handle iOS-specific quirks (audio autoplay, wake lock, etc.)

2. **AssemblyAI for Transcription** - Use AssemblyAI's real-time streaming API:
   - WebSocket streaming transcription
   - Token provisioning via Cloudflare Worker (don't expose API key in client)
   - Speaker diarization support
   - 16kHz PCM audio format

3. **Offline-First Architecture** - App must work without internet:
   - IndexedDB (via Dexie) as primary storage
   - Queue operations for later sync
   - Graceful degradation when offline

4. **Cross-Device Sync** - Data must sync between devices:
   - Cloud storage (Firestore recommended)
   - Conflict resolution (last-write-wins is fine)
   - Manual and automatic sync options

---

## CORE FEATURES

### 1. Meeting Management

**Data Model:**
```typescript
interface Meeting {
  id: string                    // UUID
  title: string
  date: string                  // YYYY-MM-DD

  // Content
  transcript?: string           // Full transcript text
  notes?: string                // User notes
  images?: string[]             // Base64 or URLs

  // AI Analysis Results
  summary?: string              // AI-generated summary
  keyPoints?: string[]          // Key discussion points
  actionItems?: ActionItem[]    // Extracted action items

  // Relationships
  stakeholderIds?: string[]     // Linked stakeholders

  // Metadata
  duration?: number             // Seconds
  priority?: 'low' | 'medium' | 'high'
  status?: 'upcoming' | 'in-progress' | 'completed'

  // Soft delete support
  deleted?: boolean
  deletedAt?: string

  // Sync
  createdAt: string
  updatedAt: string
  version: number               // For conflict detection
}

interface ActionItem {
  id: string
  task: string
  assignee?: string             // Stakeholder ID or name
  priority?: 'low' | 'medium' | 'high'
  status: 'open' | 'completed'
  dueDate?: string
}
```

**Features:**
- Create, read, update, soft-delete meetings
- List view with search, filter, sort
- Date-based organization
- Link multiple stakeholders to a meeting
- Priority tagging
- Bulk operations (delete, export)

### 2. Three Content Capture Modes

**A. Digital Notes Mode**
- Simple rich text editor
- Section-based: Summary, Key Points, Action Items
- Auto-save while typing

**B. Photo Capture Mode**
- Camera access for whiteboard photos
- Image upload via file picker or drag-drop
- OCR text extraction (use OCR.space API - free tier available)
- Gallery view of captured images

**C. Audio Recording Mode**
- Real-time streaming transcription via AssemblyAI WebSocket
- Live transcript display as user speaks
- Speaker diarization (identify different speakers)
- Audio source selection:
  - Microphone only
  - Tab audio (for recording Zoom/Meet calls)
  - Hybrid (both simultaneously)
- Recording controls: start, pause, resume, stop
- Connection health indicator
- Crash recovery (persist partial transcript if app crashes)

### 3. Stakeholder Management

**Data Model:**
```typescript
interface Stakeholder {
  id: string
  name: string
  email?: string
  company?: string
  role?: string

  // Categorization
  category?: string             // e.g., 'leadership', 'engineering', 'customer'
  priority?: 'critical' | 'high' | 'medium' | 'low'

  // Relationship tracking
  lastContactDate?: string
  relationshipHealth?: 'excellent' | 'good' | 'neutral' | 'at-risk'

  // Metadata
  notes?: string
  tags?: string[]

  deleted?: boolean
  createdAt: string
  updatedAt: string
}

interface StakeholderCategory {
  id: string
  name: string
  color: string                 // For UI badges
  description?: string
}
```

**Features:**
- CRUD for stakeholders
- Categorization with color-coded badges
- Search and filter
- Link stakeholders to meetings
- View all meetings for a stakeholder
- Relationship health tracking
- Custom category creation

### 4. AI Analysis (Claude API)

**Analyze meeting transcripts to extract:**
- Executive summary (200-500 words)
- Key discussion points (5-10 items)
- Action items with assignee detection
- Sentiment analysis (optional)

**Implementation:**
- Direct Claude API call from client (API key stored locally)
- Fallback: Copy-paste workflow for users without API key
- Progress indicator during analysis
- Cache results to avoid re-processing

### 5. Storage Architecture

**Local Storage (IndexedDB via Dexie):**
```typescript
// Schema
const db = new Dexie('MeetingFlowDB')
db.version(1).stores({
  meetings: 'id, date, *stakeholderIds, deleted, updatedAt',
  stakeholders: 'id, name, category, deleted, updatedAt',
  categories: 'id, name',
  syncQueue: '++id, entityType, entityId, operation, status'
})
```

**Cloud Storage (Firestore):**
- Collections: meetings, stakeholders, categories
- User-scoped data (userId in document path)
- Real-time subscriptions for sync

**Sync Strategy:**
- Outbox pattern: Queue local changes, process when online
- Last-write-wins conflict resolution
- Soft deletes propagate across devices
- Manual sync trigger + optional auto-sync

### 6. PWA Features

**Service Worker:**
- Precache app shell and assets
- Cache-first for static assets
- Network-first for API calls with cache fallback
- Background sync for queued operations

**Manifest:**
- Installable on iOS and Android home screen
- Standalone display mode (no browser chrome)
- App icons (192x192, 512x512)
- Theme color and background color

**Offline Support:**
- Full CRUD works offline
- Queue sync operations
- Show offline indicator
- Graceful error messages

### 7. Export Features

**Formats:**
- PDF report (summary, notes, action items)
- JSON (full data backup)
- CSV (tabular meeting list)

**Options:**
- Single meeting export
- Bulk export (date range)
- Include/exclude sections

---

## TECHNICAL STACK (RECOMMENDED)

```json
{
  "framework": "React 19+ with Vite",
  "styling": "Tailwind CSS",
  "routing": "React Router v7",
  "database": "Dexie (IndexedDB wrapper)",
  "cloud": "Firebase/Firestore",
  "transcription": "AssemblyAI real-time API",
  "ai": "Claude API (Anthropic)",
  "ocr": "OCR.space API",
  "icons": "Lucide React",
  "pwa": "vite-plugin-pwa with Workbox"
}
```

---

## UI/UX REQUIREMENTS

### Responsive Design
- Mobile-first approach
- Touch-friendly (44px minimum touch targets)
- Works on phones, tablets, desktops

### Key Screens
1. **Home** - Meeting list with filters, search, quick actions
2. **Meeting Detail** - Tabbed interface for notes/photos/audio
3. **Stakeholders** - List view with categories
4. **Settings** - API keys, sync config, data management

### Mobile Optimizations
- Swipe gestures for navigation
- Pull-to-refresh
- Large buttons for recording controls
- Full-screen recording mode option

### Accessibility
- Semantic HTML
- ARIA labels
- Keyboard navigation
- Screen reader support
- Skip links

---

## WHAT TO AVOID (LESSONS LEARNED)

1. **Over-complicated sync logic**
   - Start simple: manual sync button
   - Add auto-sync later if needed
   - Don't build elaborate conflict resolution unless required

2. **Too many storage layers**
   - Stick to ONE local storage (Dexie/IndexedDB)
   - Don't use localStorage + localforage + Dexie
   - Migration complexity is a nightmare

3. **Aggressive data cleanup**
   - Never auto-delete data based on cloud state
   - Always require explicit user action for deletions
   - Soft delete everything, hard delete never

4. **Complex state management**
   - React Context is fine for this app size
   - Don't reach for Redux/Zustand unless truly needed
   - Keep state close to where it's used

5. **Premature optimization**
   - Don't build tiered storage (hot/warm/cold) initially
   - Don't chunk transcripts unless you hit real limits
   - Add complexity only when you hit actual problems

6. **Feature creep**
   - Build core features first, polish them
   - Don't add analytics dashboard before basic CRUD works perfectly
   - Ship MVP, iterate based on actual usage

---

## PHASE 1: MVP (BUILD THIS FIRST)

1. Meeting CRUD with simple notes
2. Basic stakeholder management
3. Audio recording with AssemblyAI transcription
4. Local storage only (Dexie)
5. PWA installable

## PHASE 2: CORE FEATURES

1. Photo capture with OCR
2. Claude AI analysis
3. Cloud sync (Firestore)
4. Export to PDF/JSON

## PHASE 3: POLISH

1. Stakeholder categories
2. Action item tracking
3. Search across all meetings
4. Settings and customization

## PHASE 4: ADVANCED (ONLY IF NEEDED)

1. Analytics dashboard
2. Speaker diarization
3. Multi-device conflict resolution
4. n8n/webhook integrations

---

## IMPLEMENTATION NOTES

### Audio Recording & AssemblyAI Integration (DETAILED)

#### Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Audio Source   │────▶│  Audio Pipeline  │────▶│  AssemblyAI WebSocket│
│  (Mic/Tab/Both) │     │  (16kHz PCM)     │     │  (Real-time Stream) │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
                                                           │
                                                           ▼
                                                   ┌───────────────┐
                                                   │  Transcript   │
                                                   │  (Turn msgs)  │
                                                   └───────────────┘
```

#### 1. Token Provisioning (Cloudflare Worker)

**Never expose API key in client code.** Use a Cloudflare Worker:

```javascript
// Cloudflare Worker (recommended)
export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      })
    }

    // Get temporary token from AssemblyAI
    const response = await fetch('https://api.assemblyai.com/v2/realtime/token', {
      method: 'POST',
      headers: {
        'Authorization': env.ASSEMBLYAI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ expires_in: 3600 }) // 1 hour token
    })

    const data = await response.json()

    return new Response(JSON.stringify({ token: data.token }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}
```

**Client-side token fetch:**
```javascript
async getAuthToken() {
  // Preferred: Get temporary token from Cloudflare Worker
  if (this.tokenUrl) {
    const response = await fetch(this.tokenUrl)
    const data = await response.json()
    return { token: data.token, isTemporary: true }
  }

  // Fallback: Use API key directly (dev only, not recommended)
  if (this.apiKey) {
    const response = await fetch(
      'https://api.assemblyai.com/v2/realtime/token?expires_in=3600',
      { headers: { Authorization: this.apiKey } }
    )
    const data = await response.json()
    return { token: data.token }
  }

  throw new Error('No authentication method configured')
}
```

#### 2. WebSocket Connection (v3 Universal Streaming)

```javascript
async startRealtimeTranscription(audioStream, callbacks = {}) {
  const { onTranscript, onError, onClose } = callbacks

  // Get auth token
  const auth = await this.getAuthToken()
  const token = auth.token

  // Connect to AssemblyAI WebSocket (v3 endpoint)
  const sampleRate = 16000
  this.ws = new WebSocket(
    `wss://streaming.assemblyai.com/v3/ws?sample_rate=${sampleRate}&token=${token}`
  )

  this.ws.onopen = () => {
    console.log('🔌 WebSocket connected')
    this.isStreaming = true
    this.startKeepalive() // Prevent idle disconnection
  }

  this.ws.onmessage = (message) => {
    const data = JSON.parse(message.data)

    if (data.type === 'Begin') {
      // Session started - {id, expires_at}
      console.log('Session started:', data.id)
    }
    else if (data.type === 'Turn') {
      // Transcript data
      const isFinal = data.end_of_turn === true
      const text = data.transcript || ''

      if (text && onTranscript) {
        onTranscript(text, isFinal, data.turn_order)
      }
    }
    else if (data.type === 'Termination') {
      // Session ended
      console.log('Session terminated:', data.reason)
    }
  }

  this.ws.onerror = (error) => {
    console.error('WebSocket error:', error)
    if (onError) onError(new Error('WebSocket connection error'))
  }

  this.ws.onclose = (event) => {
    console.log('WebSocket closed:', event.code, event.reason)
    this.isStreaming = false

    // Attempt reconnection for recoverable errors
    if (this.isRecoverableClose(event.code) && this.reconnectAttempts < 5) {
      this.attemptReconnect(audioStream, callbacks)
    } else {
      if (onClose) onClose(event)
      this.cleanup()
    }
  }

  // Set up audio processing pipeline
  await this.setupAudioProcessing(audioStream, sampleRate)
}
```

#### 3. Audio Processing Pipeline

**Convert browser audio (Float32) to AssemblyAI format (Int16 PCM, 16kHz):**

```javascript
async setupAudioProcessing(stream, targetSampleRate = 16000) {
  // Create AudioContext at target sample rate
  this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: targetSampleRate
  })

  this.source = this.audioContext.createMediaStreamSource(stream)

  // Option 1: AudioWorklet (modern, off-main-thread - preferred)
  try {
    await this.audioContext.audioWorklet.addModule('/audio-processor.js')
    this.processor = new AudioWorkletNode(this.audioContext, 'audio-stream-processor')

    this.processor.port.onmessage = (event) => {
      if (event.data.type === 'audio' && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(event.data.data.buffer) // Int16Array buffer
      }
    }

    this.source.connect(this.processor)
    this.processor.connect(this.audioContext.destination)
  }
  // Option 2: ScriptProcessorNode (legacy fallback)
  catch {
    const bufferSize = 4096
    this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1)

    // Buffer for 100ms chunks (1600 samples at 16kHz)
    this.audioBuffer = new Float32Array(1600)
    this.audioBufferIndex = 0

    this.processor.onaudioprocess = (e) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return

      const audioData = e.inputBuffer.getChannelData(0)

      for (let i = 0; i < audioData.length; i++) {
        this.audioBuffer[this.audioBufferIndex++] = audioData[i]

        // Send when buffer is full (100ms of audio)
        if (this.audioBufferIndex >= this.audioBuffer.length) {
          const int16Data = this.float32ToInt16(this.audioBuffer)
          this.ws.send(int16Data)
          this.audioBufferIndex = 0
        }
      }
    }

    this.source.connect(this.processor)
    this.processor.connect(this.audioContext.destination)
  }
}

// Convert Float32 (-1 to 1) to Int16 (-32768 to 32767)
float32ToInt16(float32Array) {
  const int16Array = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }
  return int16Array.buffer
}
```

**AudioWorklet processor (audio-processor.js):**
```javascript
class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(1600) // 100ms at 16kHz
    this.bufferIndex = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const audioData = input[0]

    for (let i = 0; i < audioData.length; i++) {
      this.buffer[this.bufferIndex++] = audioData[i]

      if (this.bufferIndex >= this.buffer.length) {
        // Convert to Int16 and send to main thread
        const int16 = new Int16Array(this.buffer.length)
        for (let j = 0; j < this.buffer.length; j++) {
          const s = Math.max(-1, Math.min(1, this.buffer[j]))
          int16[j] = s < 0 ? s * 0x8000 : s * 0x7FFF
        }

        this.port.postMessage({ type: 'audio', data: int16 })
        this.bufferIndex = 0
      }
    }

    return true
  }
}

registerProcessor('audio-stream-processor', AudioStreamProcessor)
```

#### 4. Three Audio Source Modes

```javascript
const audioSources = [
  { id: 'microphone', name: 'Microphone Only', icon: '🎤' },
  { id: 'tabAudio', name: 'Tab Audio Capture', icon: '🖥️' },   // Zoom, Meet, YouTube
  { id: 'mixed', name: 'Hybrid Mode', icon: '🎙️' }             // Both simultaneously
]

// Get microphone stream
async getMicrophoneStream() {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 16000
    }
  })
}

// Get tab/display audio stream
async getTabAudioStream() {
  return navigator.mediaDevices.getDisplayMedia({
    video: true,  // Required, but we only use audio
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  })
}

// Hybrid mode: Merge microphone + tab audio
async getHybridStream() {
  const [micStream, tabStream] = await Promise.all([
    this.getMicrophoneStream(),
    this.getTabAudioStream()
  ])

  // Create AudioContext to merge streams
  const audioContext = new AudioContext({ sampleRate: 16000 })
  const destination = audioContext.createMediaStreamDestination()

  // Connect both sources to destination
  const micSource = audioContext.createMediaStreamSource(micStream)
  const tabSource = audioContext.createMediaStreamSource(tabStream)

  micSource.connect(destination)
  tabSource.connect(destination)

  return destination.stream
}
```

#### 5. Speaker Diarization (Hybrid Real-time + Batch)

Real-time streaming doesn't support speaker labels. Use hybrid approach:
1. Stream for instant transcript (no speakers)
2. Record audio simultaneously
3. After stopping, process recording with speaker diarization API

```javascript
async startHybridTranscription(audioStream, options = {}, callbacks = {}) {
  const { speakers_expected = null } = options
  const { onRealtimeTranscript, onSpeakerTranscript, onError } = callbacks

  // Part 1: Start real-time streaming (instant feedback)
  await assemblyAIService.startRealtimeTranscription(audioStream, {
    onTranscript: (text, isFinal) => {
      if (onRealtimeTranscript) onRealtimeTranscript(text, isFinal)
    },
    onError
  })

  // Part 2: Record audio for post-processing
  this.recordedChunks = []
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm'

  this.mediaRecorder = new MediaRecorder(audioStream, {
    mimeType,
    audioBitsPerSecond: 128000
  })

  this.mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      this.recordedChunks.push(event.data)
    }
  }

  this.mediaRecorder.onstop = async () => {
    // Process with speaker diarization
    const audioBlob = new Blob(this.recordedChunks, { type: mimeType })
    const speakerData = await this.transcribeWithSpeakers(audioBlob, { speakers_expected })
    if (onSpeakerTranscript) onSpeakerTranscript(speakerData)
  }

  this.mediaRecorder.start(1000) // Collect data every second
}

// Batch transcription with speaker labels
async transcribeWithSpeakers(audioBlob, options = {}) {
  const { speakers_expected = null, onProgress } = options

  // Step 1: Upload audio
  const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { authorization: this.apiKey },
    body: audioBlob
  })
  const { upload_url } = await uploadResponse.json()

  // Step 2: Request transcription with speaker labels
  const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      authorization: this.apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      audio_url: upload_url,
      speaker_labels: true,
      speakers_expected: speakers_expected, // null = auto-detect
      language_code: 'en'
    })
  })
  const { id } = await transcriptResponse.json()

  // Step 3: Poll for result
  return this.pollTranscriptWithSpeakers(id, onProgress)
}
```

**Speaker diarization output format:**
```javascript
{
  text: "Full transcript text...",
  utterances: [
    { speaker: "A", text: "Hello everyone", start: 0, end: 1500, confidence: 0.95 },
    { speaker: "B", text: "Hi, thanks for joining", start: 1600, end: 3200, confidence: 0.92 },
    // ...
  ],
  words: [
    { text: "Hello", speaker: "A", start: 0, end: 400, confidence: 0.98 },
    // ...
  ],
  speakers_detected: 2,
  audio_duration: 120.5
}
```

#### 6. Connection Management

**Keepalive (prevent idle timeout):**
```javascript
startKeepalive() {
  this.keepaliveInterval = setInterval(() => {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      this.stopKeepalive()
      return
    }

    // Send 50ms of silence (minimum required: 50-1000ms)
    // 800 samples at 16kHz = 50ms
    const silentFrame = new Int16Array(800)
    this.ws.send(silentFrame.buffer)
    console.log('💓 Keepalive sent')
  }, 30000) // Every 30 seconds
}

stopKeepalive() {
  if (this.keepaliveInterval) {
    clearInterval(this.keepaliveInterval)
    this.keepaliveInterval = null
  }
}
```

**Reconnection with exponential backoff:**
```javascript
async attemptReconnect(audioStream, callbacks) {
  this.reconnectAttempts++

  // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 30s)
  const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000)

  console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/5)...`)

  await new Promise(r => setTimeout(r, delay))

  // Cleanup old connection
  this.cleanup()

  // Reconnect
  await this.startRealtimeTranscription(audioStream, callbacks)
  this.reconnectAttempts = 0
  console.log('✅ Reconnection successful!')
}

// Only reconnect for network errors, not intentional closes
isRecoverableClose(code) {
  // 1006 = Abnormal closure (network error)
  // 1000 = Normal closure (user stopped, timeout)
  // 1001 = Going away (tab closing)
  // 3005 = Session expired
  return code === 1006
}
```

#### 7. Mobile Considerations (iOS)

**Wake lock (keep screen on):**
```javascript
async requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      this.wakeLock = await navigator.wakeLock.request('screen')
      console.log('🔒 Wake lock acquired')

      this.wakeLock.addEventListener('release', () => {
        console.log('🔓 Wake lock released')
      })
    } catch (err) {
      console.warn('Wake lock failed:', err)
    }
  }
}

async releaseWakeLock() {
  if (this.wakeLock) {
    await this.wakeLock.release()
    this.wakeLock = null
  }
}
```

**Handle app going to background:**
```javascript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden && isRecording) {
      // Auto-save transcript when app goes to background
      autoSave('background')
    }
  }

  const handlePageHide = () => {
    if (isRecording) {
      // Emergency save before page unloads
      autoSave('page_hide')
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('pagehide', handlePageHide)

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('pagehide', handlePageHide)
  }
}, [isRecording])
```

#### 8. Crash Recovery

**Persist transcript chunks to IndexedDB:**
```javascript
class StreamingTranscriptBuffer {
  constructor() {
    this.db = null
    this.sessionId = null
  }

  async createSession() {
    this.sessionId = `transcript_${Date.now()}_${Math.random().toString(36).slice(2)}`
    await this.saveSession({ id: this.sessionId, status: 'recording', chunks: [] })
    return this.sessionId
  }

  async appendChunk(text, isFinal) {
    const chunk = {
      text,
      isFinal,
      timestamp: Date.now()
    }
    // Append to IndexedDB session
    await this.addChunkToSession(this.sessionId, chunk)
  }

  async finalizeSession() {
    await this.updateSessionStatus(this.sessionId, 'completed')
  }

  async recoverOrphanedSessions() {
    // Find sessions with status='recording' that weren't finalized
    const orphaned = await this.getSessionsByStatus('recording')
    return orphaned.map(session => ({
      id: session.id,
      chunks: session.chunks,
      createdAt: session.createdAt
    }))
  }
}
```

#### 9. Stop Recording

```javascript
stopRealtimeTranscription() {
  // Disable reconnection
  this.reconnectionEnabled = false

  if (this.ws?.readyState === WebSocket.OPEN) {
    // Send terminate message
    this.ws.send(JSON.stringify({ terminate_session: true }))

    // Close after short delay
    setTimeout(() => this.ws?.close(), 100)
  }

  this.cleanup()
}

cleanup() {
  this.stopKeepalive()

  if (this.processor) {
    this.processor.disconnect()
    this.processor = null
  }

  if (this.source) {
    this.source.disconnect()
    this.source = null
  }

  if (this.audioContext?.state !== 'closed') {
    this.audioContext.close()
    this.audioContext = null
  }

  this.ws = null
  this.isStreaming = false
}
```

#### Quick Reference: AssemblyAI Message Types

| Type | Description |
|------|-------------|
| `Begin` | Session started, contains `id` and `expires_at` |
| `Turn` | Transcript data with `transcript`, `end_of_turn`, `turn_order` |
| `Termination` | Session ended, contains `reason` |

#### Quick Reference: WebSocket Close Codes

| Code | Meaning | Action |
|------|---------|--------|
| 1000 | Normal closure | Don't reconnect |
| 1001 | Going away (tab closing) | Don't reconnect |
| 1006 | Abnormal (network error) | **Reconnect** |
| 3005 | Session expired | Don't reconnect |
| 4xxx | Application error | Don't reconnect |

---

### AI Analysis Prompt (Claude API)

Use this prompt for analyzing meeting transcripts:

```
You are an expert meeting notes assistant. Create comprehensive, thematically-organized notes capturing ALL important information.

**Meeting Content:**
"""
${text}
"""

**Instructions:** Return a JSON object with these fields:

{
  "summary": "3-4 sentences: (1) Meeting purpose, (2) Key outcomes, (3) Most important decision/insight, (4) Critical next step",

  "themes": [
    {
      "topic": "Descriptive topic name",
      "keyPoints": [
        "Detailed point - WHO said it, WHAT was discussed, WHY it matters",
        "Include quotes, numbers, dates, percentages when mentioned",
        "Capture concerns and reasoning behind them"
      ],
      "context": "Why this topic was discussed"
    }
  ],

  "decisions": [
    {"decision": "What was decided", "madeBy": "Who decided", "rationale": "Why", "implications": "What it means"}
  ],

  "actionItems": [
    {"task": "Specific task", "owner": "Name or TBD", "deadline": "Date or TBD", "priority": "high/medium/low", "context": "Why it matters"}
  ],

  "openItems": [
    {"item": "Question or concern", "type": "question/blocker/risk", "owner": "Who addresses it", "urgency": "How soon"}
  ],

  "nextSteps": "2-3 sentences on immediate actions and when team reconnects"
}

**Critical:** Capture EVERYTHING important. Include specific names, numbers, quotes. Group by themes. Don't over-summarize.

Return ONLY valid JSON, no markdown code blocks.
```

**Expected Output Structure:**
```typescript
interface AIAnalysisResult {
  summary: string                    // 3-4 sentence executive summary

  themes: {                          // Thematically organized discussion
    topic: string                    // Topic name
    keyPoints: string[]              // Detailed points with WHO/WHAT/WHY
    context: string                  // Why topic was discussed
  }[]

  decisions: {                       // Decisions made
    decision: string
    madeBy: string
    rationale: string
    implications: string
  }[]

  actionItems: {                     // Tasks to complete
    task: string
    owner: string                    // Name or "TBD"
    deadline: string                 // Date or "TBD"
    priority: 'high' | 'medium' | 'low'
    context: string                  // Why it matters
  }[]

  openItems: {                       // Unresolved questions/blockers
    item: string
    type: 'question' | 'blocker' | 'risk'
    owner: string
    urgency: string
  }[]

  nextSteps: string                  // Immediate actions summary
}
```

---

### iOS PWA Considerations

1. **Lazy Firebase imports**:
```javascript
// DON'T do this at module level
import { getFirestore } from 'firebase/firestore'

// DO this
const getFirestoreModule = async () => {
  const { getFirestore } = await import('firebase/firestore')
  return getFirestore
}
```

2. **Audio recording**:
```javascript
// Request microphone with specific constraints for iOS
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    sampleRate: 16000
  }
})
```

3. **Wake lock** (keep screen on during recording):
```javascript
let wakeLock = null
try {
  wakeLock = await navigator.wakeLock.request('screen')
} catch (err) {
  // Wake lock not supported or failed
}
```

### Dexie Setup

```javascript
import Dexie from 'dexie'

export const db = new Dexie('MeetingFlowDB')

db.version(1).stores({
  meetings: 'id, date, *stakeholderIds, deleted, updatedAt',
  stakeholders: 'id, name, category, deleted, updatedAt',
  categories: 'id, name'
})

// Example CRUD
export const saveMeeting = async (meeting) => {
  const now = new Date().toISOString()
  await db.meetings.put({
    ...meeting,
    updatedAt: now,
    version: (meeting.version || 0) + 1
  })
}

export const getMeetings = async () => {
  return db.meetings
    .where('deleted')
    .notEqual(true)
    .reverse()
    .sortBy('date')
}
```

---

## QUESTIONS TO CONSIDER

Before building, clarify:

1. **Auth requirement?**
   - Anonymous local-only?
   - Google sign-in for sync?
   - Email/password?

2. **Monetization?**
   - Free with limits?
   - Paid API keys user-provided?
   - Subscription model?

3. **Team features?**
   - Single user only?
   - Shared meetings?
   - Organization support?

4. **Hosting?**
   - GitHub Pages (static)?
   - Vercel/Netlify?
   - Custom domain?

---

Now, please help me design the architecture and start implementing Phase 1 MVP. Let's begin with:
1. Project setup (Vite + React + Tailwind + PWA)
2. Database schema (Dexie)
3. Core components structure
4. Meeting CRUD implementation

Focus on clean, simple code. Avoid over-engineering. Build incrementally.
```

---

## FEATURE CHECKLIST

Use this checklist when rebuilding to ensure feature parity:

### Core Meeting Features
- [ ] Create meeting with title and date
- [ ] Edit meeting details
- [ ] Soft delete meeting (recoverable)
- [ ] Hard delete meeting
- [ ] List meetings with sorting (by date)
- [ ] Search meetings by title/content
- [ ] Filter meetings by stakeholder
- [ ] Filter meetings by date range
- [ ] Meeting priority levels (low/medium/high)
- [ ] Meeting status (upcoming/in-progress/completed)

### Content Capture
- [ ] Digital notes editor
- [ ] Auto-save notes while typing
- [ ] Photo capture from camera
- [ ] Photo upload from gallery
- [ ] OCR text extraction from photos
- [ ] Image gallery view in meeting
- [ ] Audio recording start/stop/pause
- [ ] Real-time transcript display
- [ ] Speaker diarization
- [ ] Tab audio capture (for Zoom/Meet)
- [ ] Recording crash recovery
- [ ] Audio level visualization

### Stakeholder Management
- [ ] Create stakeholder
- [ ] Edit stakeholder
- [ ] Delete stakeholder
- [ ] List stakeholders with search
- [ ] Stakeholder categories
- [ ] Custom category creation
- [ ] Color-coded category badges
- [ ] Link stakeholders to meeting
- [ ] View meetings by stakeholder
- [ ] Relationship health tracking
- [ ] Last contact date tracking

### AI Features
- [ ] Analyze transcript with Claude
- [ ] Generate summary
- [ ] Extract key points
- [ ] Extract action items
- [ ] Action item status tracking
- [ ] Assignee detection

### Storage & Sync
- [ ] Save to IndexedDB (Dexie)
- [ ] Sync to Firestore
- [ ] Manual sync trigger
- [ ] Sync status indicator
- [ ] Offline support
- [ ] Conflict detection
- [ ] Last-write-wins resolution

### Export
- [ ] Export meeting as PDF
- [ ] Export meeting as JSON
- [ ] Export all data as JSON backup
- [ ] Bulk export multiple meetings

### PWA
- [ ] Installable on iOS home screen
- [ ] Installable on Android
- [ ] Works offline
- [ ] Service worker caching
- [ ] App manifest with icons
- [ ] Update notification

### Settings
- [ ] Claude API key input
- [ ] OCR API key input
- [ ] Sync device linking
- [ ] Data management (clear all)
- [ ] Storage usage display

### UI/UX
- [ ] Responsive mobile layout
- [ ] Responsive desktop layout
- [ ] Touch-friendly buttons
- [ ] Loading spinners
- [ ] Error messages
- [ ] Success confirmations
- [ ] Empty states
- [ ] Keyboard navigation

---

## QUICK START COMMAND

```bash
# Create new project
npm create vite@latest meetingflow-v2 -- --template react

# Install dependencies
cd meetingflow-v2
npm install dexie dexie-react-hooks firebase lucide-react react-router-dom uuid date-fns react-dropzone
npm install -D tailwindcss postcss autoprefixer vite-plugin-pwa workbox-precaching workbox-routing workbox-strategies

# Setup Tailwind
npx tailwindcss init -p

# Start development
npm run dev
```

---

## CURRENT APP STATISTICS (FOR REFERENCE)

From the existing codebase:
- **40+ React components**
- **23+ service files**
- **8 major feature areas**
- **15 external integrations**
- **~50,000 lines of code** (estimated)

A clean rebuild should aim for:
- **15-20 components** (MVP)
- **5-7 services** (core functionality)
- **3-4 feature areas** (Phase 1)
- **~5,000-10,000 lines** (clean implementation)

---

## FINAL ADVICE

1. **Start with a working app, not a perfect architecture**
2. **Ship early, iterate often**
3. **Test on actual iOS device from day 1**
4. **Keep sync simple - manual button is fine**
5. **Don't migrate old data - start fresh**
6. **Document as you build, not after**

Good luck with the rebuild!
