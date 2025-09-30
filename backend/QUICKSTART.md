# Quick Start Guide

Get the Whisper transcription backend running in 5 minutes.

---

## Prerequisites

- Node.js 18+ installed
- FFmpeg installed (see below)

---

## Step 1: Install FFmpeg

### Windows
```bash
choco install ffmpeg
```

### macOS
```bash
brew install ffmpeg
```

### Linux
```bash
sudo apt-get install ffmpeg
```

Verify installation:
```bash
ffmpeg -version
```

---

## Step 2: Install Dependencies

```bash
cd backend
npm install
```

---

## Step 3: Download Whisper Model

```bash
npm run download-model
```

This downloads `ggml-base.en.bin` (~142 MB). Takes 1-2 minutes.

---

## Step 4: Start Server

```bash
npm start
```

Expected output:
```
=================================================
🎙️  MeetingFlow Transcription Backend
=================================================
HTTP Server: http://localhost:8080
WebSocket Server: ws://localhost:8080
=================================================
✓ Whisper model loaded from: backend/models/ggml-base.en.bin
```

---

## Step 5: Test Backend

Open browser: **http://localhost:8080/health**

Expected response:
```json
{
  "status": "ok",
  "service": "MeetingFlow Transcription Backend"
}
```

✅ **Backend is ready!**

---

## Step 6: Update Frontend

In project root, create/update `.env`:

```env
VITE_TRANSCRIPTION_WS=ws://localhost:8080
```

---

## Step 7: Start Frontend

```bash
# In project root (not backend/)
npm run dev
```

---

## Step 8: Test Transcription

1. Open app: http://localhost:5173
2. Import the WhisperTranscription component (see WHISPER_INTEGRATION.md)
3. Click "Start Recording"
4. Speak into microphone
5. See real-time transcription!

---

## Troubleshooting

### "Whisper model not found"
Run: `npm run download-model`

### "FFmpeg not found"
Install FFmpeg (see Step 1)

### "Port 8080 in use"
Change port in `backend/.env`:
```env
PORT=3001
```

### WebSocket connection failed
- Check backend is running: http://localhost:8080/health
- Check `.env` has correct URL

---

## Next Steps

- Read full documentation: `WHISPER_INTEGRATION.md`
- Deploy to Render.com: See `backend/README.md`
- Test on mobile: Install PWA and test iOS background recording

---

## Quick Commands

```bash
# Development mode (auto-restart)
npm run dev

# Production mode
npm start

# Re-download model
npm run download-model

# Check health
curl http://localhost:8080/health
```

---

**Need help?** See `WHISPER_INTEGRATION.md` for detailed troubleshooting.
