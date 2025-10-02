# AssemblyAI Integration Setup Guide

Complete setup guide for AssemblyAI transcription with Cloudflare Worker.

## 🎯 What You're Building

A serverless transcription system that works on:
- ✅ iOS Safari PWA (in-person meetings via microphone)
- ✅ Windows Desktop (Zoom/YouTube via tab audio capture)
- ✅ No server management required
- ✅ Secure API key handling

## 📋 Prerequisites

1. AssemblyAI API key (you have this!)
2. Free Cloudflare account (no credit card needed)

## 🚀 Quick Start (5 Minutes)

### Step 1: Install Wrangler CLI

```bash
npm install -g wrangler
```

### Step 2: Deploy Cloudflare Worker

```bash
# Navigate to worker directory
cd cloudflare-worker

# Login to Cloudflare (opens browser - sign up free)
npx wrangler login

# Add your AssemblyAI API key as a secret
npx wrangler secret put ASSEMBLYAI_API_KEY
# Paste your API key when prompted

# Deploy the worker
npx wrangler deploy
```

**Save the URL!** You'll see something like:
```
https://assemblyai-token-proxy.YOUR-USERNAME.workers.dev
```

### Step 3: Configure Your App

Go back to the main project directory:

```bash
cd ..
```

Edit your `.env` file:

```bash
# Add the Cloudflare Worker URL
VITE_ASSEMBLYAI_TOKEN_URL=https://assemblyai-token-proxy.YOUR-USERNAME.workers.dev

# Add your API key (needed for tab audio upload/polling)
VITE_ASSEMBLYAI_API_KEY=your_actual_api_key_here
```

Edit your `.env.production` file with the same values.

### Step 4: Test It

```bash
npm run dev
```

Open http://localhost:5173/meetingflow-app and:
1. Click on a meeting
2. Select "Microphone Only" mode
3. Click record and speak
4. You should see real-time transcription!

### Step 5: Deploy to GitHub Pages

```bash
npm run build
git add .
git commit -m "Add AssemblyAI with Cloudflare Worker integration"
git push origin main
```

## 🎉 You're Done!

Your app now has:
- ✅ Real-time transcription on iOS PWA
- ✅ Tab audio transcription on desktop
- ✅ Secure API key (never exposed in frontend)
- ✅ Free Cloudflare Worker (100k requests/day)
- ✅ 333 hours free transcription ($50 credit)

## 💰 Cost Breakdown

**Free Tier:**
- First 333 hours: FREE
- Cloudflare Worker: FREE (100k requests/day)

**After Free Tier:**
- $0.15 per hour of transcription
- Example: 50 hours/month = $7.50/month

## 🔒 Security

### Why Cloudflare Worker?

**Without Worker (❌ Insecure):**
```
User Browser → AssemblyAI API (with exposed API key)
```
Anyone can steal your API key from DevTools!

**With Worker (✅ Secure):**
```
User Browser → Cloudflare Worker → AssemblyAI API
              (gets temp token)   (validates token)
```
API key is protected, users only get temporary 60-min tokens.

## 🛠️ How It Works

### Real-time Transcription (Microphone)
1. Your app requests a temporary token from Cloudflare Worker
2. Worker uses your API key to generate token from AssemblyAI
3. Your app connects to AssemblyAI WebSocket with temp token
4. Audio streams in real-time, transcripts come back instantly

### Tab Audio Transcription (Desktop)
1. User selects a browser tab to record
2. Audio is captured using MediaRecorder API
3. When stopped, audio is uploaded to AssemblyAI
4. AssemblyAI processes and returns transcript
5. Progress indicator shows transcription status

## 📱 Platform-Specific Features

### iOS Safari PWA
- ✅ Microphone real-time transcription
- ✅ Wake Lock (screen stays on during recording)
- ✅ Background auto-save
- ✅ Persistent transcript accumulation

### Windows Desktop
- ✅ Everything from iOS, plus:
- ✅ Tab audio capture (YouTube, Zoom, etc.)
- ✅ Hybrid mode (mic + tab simultaneously)

## 🐛 Troubleshooting

### "AssemblyAI not configured" error

**Solution:** Make sure both URLs are set in your `.env`:
```bash
VITE_ASSEMBLYAI_TOKEN_URL=https://your-worker.workers.dev
VITE_ASSEMBLYAI_API_KEY=your_api_key
```

### "Failed to get token from Cloudflare Worker"

**Check:**
1. Is the worker deployed? Test by visiting the URL in browser
2. Did you set the API key secret? Run: `npx wrangler secret put ASSEMBLYAI_API_KEY`
3. Is CORS enabled? (It should be in the provided worker.js)

### Tab audio not working on iOS

**Expected behavior:** Tab audio (getDisplayMedia) is not supported on iOS Safari. This is a browser limitation. Use microphone mode on mobile.

### Transcription is slow

**For real-time (mic):** Should be ~300ms latency. Check your internet connection.

**For tab audio:** Transcription happens after recording stops. Typical: 30-60 seconds for a 5-minute recording.

## 📚 Additional Resources

- [AssemblyAI Docs](https://www.assemblyai.com/docs)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Deployment Guide](./cloudflare-worker/DEPLOYMENT_GUIDE.md)

## 🆘 Need Help?

Check the logs:
```bash
# Cloudflare Worker logs
cd cloudflare-worker
npx wrangler tail

# Browser console (F12 in browser)
Look for messages starting with 🎯 or ❌
```

## 🎨 Customization

### Change Transcription Language

Edit `src/services/assemblyAIService.js`:

```javascript
body: JSON.stringify({
  audio_url: upload_url,
  language_code: 'es' // Spanish, 'fr' for French, etc.
})
```

### Add Speaker Diarization (Who is speaking)

```javascript
body: JSON.stringify({
  audio_url: upload_url,
  speaker_labels: true
})
```

### Enable Custom Vocabulary

```javascript
body: JSON.stringify({
  audio_url: upload_url,
  word_boost: ['AssemblyAI', 'MeetingFlow', 'your', 'custom', 'words']
})
```

See [AssemblyAI Features](https://www.assemblyai.com/docs/features) for more options.
