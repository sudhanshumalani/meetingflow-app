# MeetingFlow - GitHub Pages Deployment Guide

## Quick Setup

1. **Push to GitHub Repository**
   ```bash
   git add .
   git commit -m "Prepare for GitHub Pages deployment"
   git push origin main
   ```

2. **Enable GitHub Pages**
   - Go to repository Settings → Pages
   - Source: GitHub Actions
   - The workflow will automatically deploy on push to main

3. **Update N8N Endpoints**
   - Edit .env.production with your actual N8N webhook URLs
   - Commit and push changes

## Local Testing

```bash
# Test production build locally
npm run build:prod
npm run preview
```

## Access Your App
Your app will be available at: https://[username].github.io/meetingflow-app/

## Environment Variables
Update .env.production with your production N8N endpoints before deployment.

