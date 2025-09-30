# MeetingFlow Transcription Backend

Cross-platform transcription service powered by **Whisper.cpp** for real-time audio transcription.

## Features

✅ **Desktop (Windows/Mac)**: Capture Zoom/Meet audio via system audio
✅ **Mobile (iOS/Android)**: Capture in-person meetings via microphone
✅ **iOS Background Recording**: Continues when screen is locked
✅ **100% Free**: Self-hosted Whisper.cpp, no API costs
✅ **Real-time Streaming**: WebSocket-based audio streaming

---

## Quick Start

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Download Whisper Model

```bash
npm run download-model
```

This downloads the `ggml-base.en.bin` model (~142 MB) to `backend/models/`.

### 3. Start Server

```bash
npm start
```

The server will start on `http://localhost:8080`.

### 4. Test Connection

Open your browser:
- Health check: http://localhost:8080/health
- WebSocket: ws://localhost:8080

---

## Project Structure

```
backend/
├── server.js                 # Main WebSocket server
├── services/
│   ├── WhisperService.js    # Whisper.cpp integration
│   └── AudioProcessor.js    # Audio format conversion
├── models/
│   └── ggml-base.en.bin     # Whisper model (downloaded)
├── temp/                     # Temporary audio files
├── scripts/
│   └── downloadModel.js     # Model download script
├── package.json
├── render.yaml              # Render.com deployment config
└── .env                     # Environment variables
```

---

## Environment Variables

Create `.env` file:

```env
PORT=8080
NODE_ENV=development
WHISPER_MODEL_PATH=./models/ggml-base.en.bin
```

---

## API Documentation

### HTTP Endpoints

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "service": "MeetingFlow Transcription Backend",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "uptime": 123.456
}
```

### WebSocket Protocol

#### Connection
```javascript
const ws = new WebSocket('ws://localhost:8080');
```

#### Send Audio Chunk
```json
{
  "type": "audio",
  "data": "base64-encoded-audio-data"
}
```

#### End Recording
```json
{
  "type": "end"
}
```

#### Keep-Alive Ping
```json
{
  "type": "ping"
}
```

#### Server Responses

**Ready:**
```json
{
  "type": "ready",
  "sessionId": "uuid",
  "message": "Transcription service ready"
}
```

**Transcript:**
```json
{
  "type": "transcript",
  "text": "Hello, this is a test.",
  "timestamp": 1642252800000
}
```

**Complete:**
```json
{
  "type": "complete",
  "message": "Recording session ended"
}
```

**Error:**
```json
{
  "type": "error",
  "message": "Error description"
}
```

---

## Platform Capabilities

| Platform | System Audio | Microphone | Use Case |
|----------|-------------|-----------|----------|
| **Windows/Mac (Chrome/Edge)** | ✅ | ✅ | Zoom meetings |
| **iOS Safari/PWA** | ❌ | ✅ | In-person meetings |
| **Android** | ❌ | ✅ | In-person meetings |

### Desktop System Audio Capture

**How it works:**
- Uses `getDisplayMedia()` to capture screen/window audio
- Perfect for recording Zoom, Meet, Teams meetings
- User selects window and checks "Share audio"

**Supported Browsers:**
- Chrome 74+
- Edge 79+
- Firefox (limited support)

### Mobile Microphone Capture

**How it works:**
- Uses `getUserMedia()` to capture microphone
- Perfect for in-person meetings, interviews
- iOS: Background recording with silent audio workaround

---

## Deployment

### Render.com (Free Tier)

1. Push code to GitHub
2. Create new Web Service on Render.com
3. Connect repository
4. Use `backend/render.yaml` for configuration
5. Deploy

**Important:**
- Enable persistent disk for models (1 GB)
- Set environment variable: `NODE_ENV=production`
- Build command: `npm install && npm run download-model`
- Start command: `npm start`

### Alternative: Railway, Fly.io, DigitalOcean

Similar setup process. Ensure:
- Node.js 18+
- 1 GB disk space for model
- FFmpeg installed (usually pre-installed)

---

## Requirements

### System Requirements
- Node.js 18+
- FFmpeg (for audio conversion)
- 1 GB disk space (for Whisper model)
- 512 MB RAM minimum

### Installing FFmpeg

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

---

## Troubleshooting

### Model Not Found Error

**Problem:** `Whisper model not found`

**Solution:**
```bash
npm run download-model
```

### FFmpeg Not Found Error

**Problem:** `FFmpeg not installed`

**Solution:** Install FFmpeg using instructions above.

### Port Already in Use

**Problem:** `Port 8080 is already in use`

**Solution:** Change port in `.env`:
```env
PORT=3001
```

### WebSocket Connection Failed

**Problem:** Frontend can't connect

**Solution:** Check that:
1. Backend server is running
2. Correct WebSocket URL in frontend
3. No firewall blocking port 8080

---

## Development

### Run in Development Mode

```bash
npm run dev
```

Uses `nodemon` for auto-restart on file changes.

### Test with cURL

```bash
# Health check
curl http://localhost:8080/health

# API info
curl http://localhost:8080
```

### Test with Postman/Thunder Client

Use WebSocket client to connect to `ws://localhost:8080` and send test messages.

---

## Performance

### Model Comparison

| Model | Size | Speed | Accuracy | Recommended |
|-------|------|-------|----------|-------------|
| tiny.en | 77 MB | Fastest | Good | Testing only |
| **base.en** | **142 MB** | **Fast** | **Very Good** | **✅ Default** |
| small.en | 466 MB | Medium | Excellent | High accuracy needed |
| medium.en | 1.5 GB | Slow | Excellent | Production (high accuracy) |

### Processing Speed

- **base.en**: ~2-3x real-time (2 seconds audio → ~1 second processing)
- Batch size: 2 seconds of audio (8 chunks × 250ms)
- Latency: 1-3 seconds from speech to transcript

---

## Security Considerations

1. **HTTPS/WSS**: Use secure connections in production
2. **CORS**: Configure CORS for your frontend domain
3. **Rate Limiting**: Add rate limiting for production
4. **Authentication**: Add JWT/API key authentication if needed
5. **File Cleanup**: Automatic cleanup of temporary audio files

---

## License

MIT License - Free for personal and commercial use.

---

## Support

For issues or questions:
- GitHub Issues: [meetingflow-app/issues]
- Documentation: See frontend integration guide

---

## Credits

- **Whisper.cpp**: Georgi Gerganov (https://github.com/ggerganov/whisper.cpp)
- **nodejs-whisper**: Transcription service wrapper
- **OpenAI Whisper**: Original model by OpenAI
