# Whisper.cpp Integration Guide

Complete guide for integrating the self-hosted Whisper.cpp transcription backend with MeetingFlow.

---

## Overview

This integration provides **100% free, self-hosted transcription** using Whisper.cpp with realistic, research-backed platform capabilities.

### Platform Capabilities

| Platform | System Audio | Microphone | Best For |
|----------|-------------|-----------|----------|
| **Windows/Mac (Chrome/Edge)** | ✅ | ✅ | **Zoom meetings** |
| **iOS Safari/PWA** | ❌ | ✅ | **In-person meetings** |
| **Android** | ❌ | ✅ | **In-person meetings** |

### Key Features

✅ **Desktop**: Capture Zoom/Meet audio via `getDisplayMedia()`
✅ **Mobile**: Capture microphone for in-person meetings
✅ **iOS Background**: Recording continues when screen is locked
✅ **Real-time**: WebSocket streaming with 1-3 second latency
✅ **Free**: No API costs, self-hosted infrastructure

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (React)                       │
│                                                             │
│  ┌─────────────────┐      ┌──────────────────────────┐    │
│  │ WhisperTranscription │  │ TranscriptionStreamService │    │
│  │    Component         │──│   - Audio capture         │    │
│  │                      │  │   - WebSocket client      │    │
│  └─────────────────┘      │   - iOS workaround        │    │
│                           └──────────────────────────┘    │
│                                      │                     │
└──────────────────────────────────────┼─────────────────────┘
                                       │ WebSocket
                                       │ (audio chunks)
                                       │
┌──────────────────────────────────────▼─────────────────────┐
│                    BACKEND (Node.js)                       │
│                                                             │
│  ┌──────────────┐   ┌─────────────────┐   ┌────────────┐ │
│  │   server.js  │──→│ AudioProcessor  │──→│  Whisper   │ │
│  │   (WebSocket)│   │   (FFmpeg)      │   │  Service   │ │
│  └──────────────┘   └─────────────────┘   └────────────┘ │
│                                                 │          │
│                                                 ▼          │
│                                          ggml-base.en.bin  │
└─────────────────────────────────────────────────────────────┘
```

---

## Setup Instructions

### Part 1: Backend Setup

#### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

#### 2. Download Whisper Model

```bash
npm run download-model
```

This downloads `ggml-base.en.bin` (~142 MB) from HuggingFace.

#### 3. Install FFmpeg

**Windows:**
```bash
choco install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt-get install ffmpeg
```

#### 4. Start Backend Server

```bash
npm start
```

Server runs on `http://localhost:8080`

#### 5. Verify Backend

Open browser: http://localhost:8080/health

Expected response:
```json
{
  "status": "ok",
  "service": "MeetingFlow Transcription Backend",
  "timestamp": "2025-01-15T12:00:00.000Z"
}
```

---

### Part 2: Frontend Setup

#### 1. Update Environment Variables

Create or update `.env`:

```env
VITE_TRANSCRIPTION_WS=ws://localhost:8080
```

For production (Render.com):
```env
VITE_TRANSCRIPTION_WS=wss://meetingflow-transcription.onrender.com
```

#### 2. Import Component

In your main app file (e.g., `App.jsx`):

```javascript
import WhisperTranscription from './components/WhisperTranscription';
import { useState } from 'react';

function App() {
  const [transcript, setTranscript] = useState('');

  return (
    <div className="app">
      <h1>MeetingFlow</h1>

      <WhisperTranscription
        enabled={true}
        onTranscriptUpdate={(text) => {
          setTranscript(text);
          console.log('New transcript:', text);
        }}
      />

      {/* Your existing components */}
    </div>
  );
}
```

#### 3. Start Frontend

```bash
npm run dev
```

---

## Usage Examples

### Desktop: Zoom Meeting Transcription

1. **Start Backend:** `npm start` in `backend/` directory
2. **Open App:** Go to `http://localhost:5173`
3. **Click "Start Recording"**
4. **Select Window/Screen:**
   - Choose your Zoom window
   - ✅ **CHECK "Share audio" checkbox**
   - Click "Share"
5. **Recording:** Transcription appears in real-time
6. **Stop:** Click "Stop" button

### Mobile: In-Person Meeting

1. **Open PWA:** Install app to home screen (optional)
2. **Click "Start Recording"**
3. **Allow Microphone:** Grant permission when prompted
4. **Lock Screen (iOS):** Recording continues in background
5. **Unlock:** View real-time transcript
6. **Stop:** Click "Stop" button

---

## Component API

### WhisperTranscription Component

```javascript
<WhisperTranscription
  enabled={true}                    // Show/hide component
  onTranscriptUpdate={(text) => {}} // Callback for transcript updates
/>
```

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Show/hide component |
| `onTranscriptUpdate` | `function` | `null` | Callback with full transcript text |

**Callback Signature:**
```javascript
onTranscriptUpdate(text: string) => void
```

---

## Service Classes

### DeviceDetector

Platform detection utility:

```javascript
import DeviceDetector from './services/DeviceDetector';

// Check capabilities
const caps = DeviceDetector.getCapabilities();
// {
//   platform: 'iOS',
//   browser: 'Safari',
//   isMobile: true,
//   supportsSystemAudio: false,
//   supportsMicrophone: true,
//   recommendedMode: 'microphone'
// }

// Get recommended mode
const mode = DeviceDetector.getRecommendedMode();
// 'system-audio' (desktop) or 'microphone' (mobile)

// Get user message
const message = DeviceDetector.getUseCaseMessage();
// '🖥️ Perfect for Zoom meetings - System audio will be captured'
```

### TranscriptionStreamService

Low-level transcription service:

```javascript
import TranscriptionStreamService from './services/TranscriptionStreamService';

const service = new TranscriptionStreamService('ws://localhost:8080');

// Register callbacks
service.onTranscript((text, isFinal) => {
  console.log('Transcript:', text);
});

service.onStatus((message) => {
  console.log('Status:', message);
});

service.onError((error) => {
  console.error('Error:', error);
});

// Start recording
await service.startRecording('auto'); // or 'system-audio', 'microphone'

// Stop recording
service.stopRecording();

// Check status
const status = service.getStatus();
```

---

## iOS Background Recording

### How It Works

iOS suspends PWAs when the screen locks or app is backgrounded. To keep recording:

1. **Silent Audio Loop:** Play inaudible audio continuously
2. **Must Be User-Initiated:** Triggered by button click
3. **Keeps App Alive:** Prevents iOS from suspending PWA

### Implementation Details

```javascript
// In TranscriptionStreamService.js
async initializeiOSBackgroundSupport() {
  if (!DeviceDetector.isiOS()) return;

  this.silentAudio = new Audio();
  this.silentAudio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10...';
  this.silentAudio.loop = true;

  await this.silentAudio.play(); // Keeps PWA alive
}
```

### User Experience

- ✅ User clicks "Start Recording" (triggers silent audio)
- ✅ User locks screen → Recording continues
- ✅ User switches apps → Recording continues
- ✅ User unlocks screen → Transcript shows all captured audio

---

## Deployment

### Deploy Backend to Render.com

1. **Push to GitHub:**
   ```bash
   git add backend/
   git commit -m "Add Whisper backend"
   git push
   ```

2. **Create Render Service:**
   - Go to https://render.com
   - New → Web Service
   - Connect repository
   - Use these settings:
     - **Build Command:** `npm install && npm run download-model`
     - **Start Command:** `npm start`
     - **Environment:** `NODE_ENV=production`
     - **Disk:** Add persistent disk (1 GB) at `/app/models`

3. **Copy WebSocket URL:**
   - Example: `wss://meetingflow-transcription.onrender.com`

4. **Update Frontend `.env`:**
   ```env
   VITE_TRANSCRIPTION_WS=wss://meetingflow-transcription.onrender.com
   ```

5. **Rebuild Frontend:**
   ```bash
   npm run build
   ```

### Free Tier Limitations

Render.com free tier:
- ✅ 750 hours/month
- ⚠️ Sleeps after 15 min inactivity
- ⚠️ Cold start: ~30 seconds

**Solution:** Add "keep-alive" ping in frontend or upgrade to $7/month.

---

## Testing Checklist

### Desktop Testing

- [ ] Backend server starts without errors
- [ ] Health endpoint returns 200 OK
- [ ] Frontend connects to WebSocket
- [ ] "Start Recording" button works
- [ ] Screen selection shows "Share audio" checkbox
- [ ] Zoom audio is captured and transcribed
- [ ] Real-time transcription (1-3 sec latency)
- [ ] Stop button ends recording cleanly

### iOS Testing

- [ ] App loads on iOS Safari
- [ ] "Start Recording" button works
- [ ] Microphone permission granted
- [ ] Recording starts successfully
- [ ] Lock screen → Recording continues
- [ ] Switch apps → Recording continues
- [ ] Unlock → Transcript shows all audio
- [ ] Stop button ends recording

### Android Testing

- [ ] App loads on Android Chrome
- [ ] Microphone permission granted
- [ ] Recording starts successfully
- [ ] Transcription appears in real-time

---

## Troubleshooting

### Backend Won't Start

**Error:** `Whisper model not found`

**Solution:**
```bash
cd backend
npm run download-model
```

---

**Error:** `FFmpeg not found`

**Solution:** Install FFmpeg (see setup instructions)

---

### Frontend Can't Connect

**Error:** `WebSocket connection failed`

**Solution:**
1. Check backend is running: `http://localhost:8080/health`
2. Check WebSocket URL in `.env`
3. Check CORS settings in `backend/server.js`

---

### No Audio Captured (Desktop)

**Problem:** Transcription is empty

**Solution:**
1. ✅ **CHECK "Share audio" when selecting screen/window**
2. Ensure you selected the correct window (Zoom)
3. Check browser console for errors

---

### iOS Background Recording Stops

**Problem:** Recording stops when screen locks

**Solution:**
1. Ensure silent audio is playing (check console)
2. Grant microphone permission
3. Try re-starting recording

---

### Poor Transcription Quality

**Problem:** Inaccurate transcriptions

**Solution:**
1. **Upgrade model:** Use `small.en` or `medium.en`
2. **Improve audio:** Reduce background noise
3. **Check audio quality:** Ensure 16kHz sampling rate

---

## Performance Optimization

### Model Selection

| Model | Size | Speed | Accuracy | Recommended |
|-------|------|-------|----------|-------------|
| tiny.en | 77 MB | Fastest | Good | Testing only |
| **base.en** | **142 MB** | **Fast** | **Very Good** | **✅ Default** |
| small.en | 466 MB | Medium | Excellent | High accuracy |
| medium.en | 1.5 GB | Slow | Excellent | Production |

To change model:

1. Download model:
   ```bash
   cd backend/models
   wget https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin
   ```

2. Update `.env`:
   ```env
   WHISPER_MODEL_PATH=./models/ggml-small.en.bin
   ```

3. Restart backend

### Reduce Latency

**Current:** 2-second chunks (8 × 250ms)

**Faster (1-second chunks):**

In `backend/server.js`, change:
```javascript
if (audioChunks.length >= 8) {  // Change to 4
```

**Trade-off:** Less context = lower accuracy

---

## Advanced Usage

### Custom Backend URL

```javascript
import TranscriptionStreamService from './services/TranscriptionStreamService';

const service = new TranscriptionStreamService('wss://your-custom-backend.com');
```

### Multiple Transcription Sessions

```javascript
const session1 = new TranscriptionStreamService();
const session2 = new TranscriptionStreamService();

await session1.startRecording('system-audio');
await session2.startRecording('microphone');
```

### Transcript Post-Processing

```javascript
<WhisperTranscription
  onTranscriptUpdate={(text) => {
    // Remove filler words
    const cleaned = text.replace(/\b(um|uh|like)\b/gi, '');

    // Capitalize sentences
    const formatted = cleaned.replace(/(\. |^)([a-z])/g,
      (match, p1, p2) => p1 + p2.toUpperCase());

    console.log(formatted);
  }}
/>
```

---

## Security Considerations

### Production Checklist

- [ ] Use HTTPS/WSS in production
- [ ] Configure CORS to your domain only
- [ ] Add rate limiting (prevent abuse)
- [ ] Add authentication (JWT/API key)
- [ ] Enable request logging
- [ ] Set up monitoring/alerts

### Example: Add CORS Restrictions

In `backend/server.js`:

```javascript
const cors = require('cors');

app.use(cors({
  origin: 'https://your-domain.com',
  credentials: true
}));
```

---

## Cost Analysis

### Self-Hosted (Render.com Free)

- Backend: **$0/month** (free tier, 750 hours)
- Model: **$0** (open-source Whisper.cpp)
- Storage: **$0** (1 GB free disk)
- **Total: $0/month** ✅

### Render.com Paid (No Sleep)

- Backend: **$7/month** (Starter tier)
- Always-on, no cold starts
- **Total: $7/month**

### Alternative: Cloud APIs

- AssemblyAI: **$0.25/hour** ($15 for 60 hours)
- Deepgram: **$0.30/hour** ($18 for 60 hours)
- OpenAI Whisper API: **$0.36/hour** ($21.60 for 60 hours)

**Self-hosted saves $180-$260/year** for 60 hours/month usage.

---

## Limitations

### Platform Limitations (Cannot Be Overcome)

❌ **iOS cannot capture Zoom audio** (Apple restriction)
❌ **Mobile browsers cannot capture system audio** (security restriction)
✅ **Desktop can capture both system audio and microphone**
✅ **Mobile can capture microphone for in-person meetings**

### Whisper Limitations

- **Real-time:** 1-3 second latency (not instant)
- **Accuracy:** 90-95% for clear audio, lower for noisy/accented speech
- **Languages:** English only with `*.en` models (multilingual available)
- **Speakers:** No speaker diarization (can't identify who spoke)

---

## Future Enhancements

### Potential Features

- [ ] Speaker diarization (identify speakers)
- [ ] Punctuation restoration
- [ ] Automatic language detection
- [ ] Export to SRT/VTT subtitle formats
- [ ] Multi-language support
- [ ] Whisper.cpp GPU acceleration
- [ ] Redis for session persistence
- [ ] PostgreSQL for transcript storage

---

## Support

### Resources

- **Backend README:** `backend/README.md`
- **GitHub Issues:** Report bugs and request features
- **Whisper.cpp Docs:** https://github.com/ggerganov/whisper.cpp

### Common Questions

**Q: Can I use this commercially?**
A: Yes, MIT license. Free for personal and commercial use.

**Q: Do I need a GPU?**
A: No, CPU is sufficient. GPU can speed up transcription.

**Q: Can I capture internal audio on mobile?**
A: No, mobile browsers don't support system audio capture.

**Q: Does this work offline?**
A: Yes, backend can run locally without internet.

---

## Credits

- **Whisper.cpp:** Georgi Gerganov
- **OpenAI Whisper:** Original model
- **nodejs-whisper:** Node.js wrapper
- **MeetingFlow:** Cross-platform integration

---

**Last Updated:** January 2025
**Version:** 1.0.0
