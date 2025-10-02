require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const WhisperService = require('./services/WhisperService');
const AudioProcessor = require('./services/AudioProcessor');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware - CORS configuration with allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`❌ CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MeetingFlow Transcription Backend',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API info endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'MeetingFlow Transcription API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      websocket: 'ws://localhost:' + PORT
    },
    features: [
      'Real-time audio transcription',
      'Desktop system audio capture (Zoom meetings)',
      'Mobile microphone capture (in-person meetings)',
      'iOS background recording support'
    ]
  });
});

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log('=================================================');
  console.log('🎙️  MeetingFlow Transcription Backend');
  console.log('=================================================');
  console.log(`HTTP Server: http://localhost:${PORT}`);
  console.log(`WebSocket Server: ws://localhost:${PORT}`);
  console.log('=================================================');
});

// WebSocket server with origin verification
const wss = new WebSocket.Server({
  server,
  verifyClient: (info) => {
    const origin = info.origin || info.req.headers.origin;
    console.log(`🔍 WebSocket connection attempt from origin: ${origin || 'none'}`);
    console.log(`Headers:`, info.req.headers);

    // Allow connections with no origin (direct connections, mobile apps)
    if (!origin) {
      console.log('✅ Allowing connection with no origin');
      return true;
    }

    // Check if origin is in allowed list
    const isAllowed = allowedOrigins.some(allowed => {
      // Remove trailing slashes for comparison
      const normalizedOrigin = origin.replace(/\/$/, '');
      const normalizedAllowed = allowed.replace(/\/$/, '');
      return normalizedOrigin === normalizedAllowed || normalizedOrigin.startsWith(normalizedAllowed);
    });

    if (isAllowed) {
      console.log(`✅ Allowing connection from: ${origin}`);
      return true;
    }

    console.log(`❌ Rejecting connection from: ${origin}`);
    console.log(`Allowed origins:`, allowedOrigins);
    return false;
  }
});

wss.on('connection', async (ws, req) => {
  const sessionId = uuidv4();
  const clientIp = req.socket.remoteAddress;

  console.log(`\n🔌 Client connected: ${sessionId} (${clientIp})`);

  const whisperService = new WhisperService();
  const audioProcessor = new AudioProcessor(sessionId);

  let isInitialized = false;
  let processingQueue = [];
  let isProcessing = false;

  // Initialize Whisper service
  try {
    await whisperService.initialize();
    isInitialized = true;

    ws.send(JSON.stringify({
      type: 'ready',
      sessionId: sessionId,
      message: 'Transcription service ready'
    }));
  } catch (error) {
    console.error('Failed to initialize Whisper:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Failed to initialize transcription service: ' + error.message
    }));
    ws.close();
    return;
  }

  // Process queue one at a time to avoid OOM
  const processQueue = async () => {
    if (isProcessing || processingQueue.length === 0) {
      return;
    }

    isProcessing = true;
    const audioData = processingQueue.shift();

    try {
      const audioPath = await audioProcessor.saveAudio(audioData);
      const transcript = await whisperService.transcribe(audioPath);

      if (transcript && transcript.trim().length > 0) {
        ws.send(JSON.stringify({
          type: 'transcript',
          text: transcript,
          timestamp: Date.now()
        }));
        console.log(`✅ Transcript sent: "${transcript.substring(0, 50)}..."`);
      } else {
        console.log('⚠️ No speech detected in this segment');
      }

      await audioProcessor.cleanup(audioPath);
    } catch (error) {
      console.error('Processing error:', error);
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Transcription failed: ' + error.message
        }));
      }
    } finally {
      isProcessing = false;
      // Process next item in queue
      if (processingQueue.length > 0) {
        setImmediate(() => processQueue());
      }
    }
  };

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === 'audio') {
        // Queue audio for sequential processing (avoid OOM from parallel Whisper processes)
        const audioData = Buffer.from(message.data, 'base64');
        console.log(`📝 Queued audio segment: ${(audioData.length / 1024).toFixed(2)} KB (queue: ${processingQueue.length + 1})`);

        processingQueue.push(audioData);
        processQueue(); // Start processing if not already running
      } else if (message.type === 'stop') {
        console.log('🛑 Recording stopped by client');
      } else if (message.type === 'ping') {
        // Keep-alive ping
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('Message handling error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  ws.on('close', () => {
    console.log(`❌ Client disconnected: ${sessionId}`);
    // Delay cleanup to allow any in-flight transcriptions to complete
    setTimeout(() => {
      audioProcessor.cleanupAll();
    }, 10000); // Wait 10 seconds before cleanup
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for ${sessionId}:`, error);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});
