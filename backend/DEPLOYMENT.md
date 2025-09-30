# MeetingFlow Transcription Backend - Render Deployment Guide

This guide walks you through deploying the Whisper transcription backend to Render.com (100% free tier).

## 📋 Prerequisites

- GitHub account
- Render account (free at https://render.com)
- Git installed locally

## 🚀 Deployment Steps

### Step 1: Prepare Backend for Git

1. Create a `.gitignore` file in the `backend/` directory:

```bash
cd backend
```

Create `.gitignore`:
```
node_modules/
whisper-bin/
models/
uploads/
*.log
.DS_Store
.env
```

2. Initialize Git repository (if not already done):

```bash
git init
git add .
git commit -m "Initial commit - Whisper transcription backend"
```

### Step 2: Push to GitHub

1. Create a new GitHub repository:
   - Go to https://github.com/new
   - Name it: `meetingflow-transcription-backend`
   - Make it **public** (required for Render free tier)
   - Don't initialize with README (we already have code)

2. Push your code:

```bash
git remote add origin https://github.com/YOUR_USERNAME/meetingflow-transcription-backend.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy to Render

1. **Sign up/Login to Render:**
   - Go to https://render.com
   - Sign up with GitHub (easiest option)

2. **Create New Web Service:**
   - Click "New +" button → "Web Service"
   - Connect your GitHub repository: `meetingflow-transcription-backend`
   - Click "Connect"

3. **Configure Service:**

   **Basic Settings:**
   - **Name:** `meetingflow-transcription` (or your preferred name)
   - **Region:** Choose closest to your users (e.g., Oregon USA)
   - **Branch:** `main`
   - **Runtime:** `Node`

   **Build & Deploy:**
   - **Build Command:**
     ```
     npm install && bash scripts/setup-whisper-render.sh
     ```
   - **Start Command:**
     ```
     npm start
     ```

   **Plan:**
   - Select **Free** tier

4. **Environment Variables:**

   Scroll down to "Environment Variables" section and add:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` |
   | `ALLOWED_ORIGINS` | Your frontend URLs (comma-separated) |

   Example for `ALLOWED_ORIGINS`:
   ```
   https://meetingflow-app.netlify.app,https://meetingflow-app.vercel.app,http://localhost:5173
   ```

5. **Persistent Disk (Important!):**

   - Scroll to "Disks" section
   - Click "Add Disk"
   - **Name:** `whisper-data`
   - **Mount Path:** `/opt/render/project/src/whisper-bin`
   - **Size:** `1 GB` (free tier)

   This ensures the Whisper model (141MB) isn't re-downloaded on every deploy.

6. **Create Web Service:**
   - Click "Create Web Service"
   - Render will start building and deploying
   - **First deploy takes 5-10 minutes** (downloading Whisper binary + model)

### Step 4: Monitor Deployment

1. Watch the deployment logs in real-time
2. Look for these success messages:
   ```
   🔧 Setting up Whisper.cpp for Render...
   📥 Downloading whisper.cpp binary...
   ✅ Binary found at: ./whisper-bin/main
   📥 Downloading Whisper model...
   ✅ Model downloaded: ggml-base.en.bin
   ✅ Whisper.cpp setup complete!

   =================================================
   🎙️  MeetingFlow Transcription Backend
   =================================================
   HTTP Server: https://meetingflow-transcription.onrender.com
   WebSocket Server: wss://meetingflow-transcription.onrender.com
   =================================================
   ```

3. Your backend URL will be: `https://YOUR-SERVICE-NAME.onrender.com`

### Step 5: Update Frontend Configuration

1. Open your MeetingFlow frontend `.env` file
2. Update the transcription backend URL:

```env
# Production backend URL (use wss:// for secure WebSocket)
VITE_TRANSCRIPTION_WS=wss://meetingflow-transcription.onrender.com
```

3. Redeploy your frontend to Netlify/Vercel

### Step 6: Test the Deployment

1. Open your MeetingFlow app
2. Navigate to a meeting
3. Switch to "Audio Recording" mode
4. Click "Start Recording"
5. Speak a test sentence
6. Click "Stop Recording"
7. Verify transcript appears

## ⚠️ Important Notes

### Free Tier Limitations

- **Spins down after 15 minutes of inactivity**
- First request after spin-down takes 30-60 seconds (cold start)
- 750 hours/month free compute
- No credit card required

### Cold Start Workaround

To keep your service warm, you can:

1. Use a service like UptimeRobot to ping your health endpoint every 10 minutes:
   ```
   https://meetingflow-transcription.onrender.com/health
   ```

2. Or accept the 30-second cold start (recommended for low traffic)

### CORS Configuration

Make sure your frontend domain is in the `ALLOWED_ORIGINS` environment variable on Render:

```
https://your-frontend.netlify.app,https://your-frontend.vercel.app
```

## 🔧 Troubleshooting

### Build Fails: "whisper binary not found"

- Check that `scripts/setup-whisper-render.sh` has execute permissions
- Verify the script is in the repository
- Check build logs for download errors

### WebSocket Connection Fails

- Ensure you're using `wss://` (not `ws://`) for HTTPS frontend
- Check CORS: your frontend domain must be in `ALLOWED_ORIGINS`
- Verify service is running (not spun down)

### Transcription Returns Empty

- Check backend logs for Whisper errors
- Ensure disk is properly mounted at `/opt/render/project/src/whisper-bin`
- Verify model file exists: should show "Model loaded from: ./models/ggml-base.en.bin"

## 📊 Monitoring

### View Logs

1. Go to Render dashboard
2. Click your service
3. Click "Logs" tab
4. Real-time logs show all transcription activity

### Check Health

Visit: `https://YOUR-SERVICE.onrender.com/health`

Should return:
```json
{
  "status": "ok",
  "service": "MeetingFlow Transcription Backend",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 3600
}
```

## 🔄 Updating Your Deployment

To deploy changes:

```bash
git add .
git commit -m "Update transcription service"
git push origin main
```

Render will automatically rebuild and redeploy (takes 2-3 minutes after first deploy).

## 💰 Cost Estimate

**100% FREE** with these specs:
- Node.js runtime
- 512 MB RAM
- 0.1 CPU
- 1 GB persistent disk
- Unlimited bandwidth (fair use)

Perfect for personal use and small teams!

## 🎉 Success!

Your transcription backend is now running 24/7 in the cloud, and your MeetingFlow app can transcribe meetings from any device without keeping your laptop on!

## 📞 Support

If you encounter issues:
1. Check Render logs first
2. Verify environment variables
3. Test with `whisper-test.html` locally to isolate issues
4. Check GitHub Issues for similar problems
