# Cloudflare Worker Deployment Guide

This guide will help you deploy the AssemblyAI token proxy in under 5 minutes.

## Prerequisites

- Your AssemblyAI API key (you already have this!)
- A GitHub or email account (for Cloudflare signup)

## Step 1: Install Cloudflare CLI (Wrangler)

Open a terminal and run:

```bash
npm install -g wrangler
```

## Step 2: Login to Cloudflare

```bash
npx wrangler login
```

This will open your browser. You can:
- Sign up with GitHub (recommended - 1 click)
- Sign up with email (free)

No credit card required!

## Step 3: Navigate to Worker Directory

```bash
cd cloudflare-worker
```

## Step 4: Add Your AssemblyAI API Key

Run this command and paste your API key when prompted:

```bash
npx wrangler secret put ASSEMBLYAI_API_KEY
```

When prompted, paste your AssemblyAI API key (it won't be visible while typing - that's normal).

## Step 5: Deploy the Worker

```bash
npx wrangler deploy
```

You'll see output like:

```
✨ Successfully published your worker!
🌍 Your worker is live at:
   https://assemblyai-token-proxy.YOUR-USERNAME.workers.dev
```

**SAVE THIS URL!** You'll need it in the next step.

## Step 6: Update Your .env File

Copy the worker URL you just got, then go back to the main project directory:

```bash
cd ..
```

Open `.env` file and add:

```bash
VITE_ASSEMBLYAI_TOKEN_URL=https://assemblyai-token-proxy.YOUR-USERNAME.workers.dev
```

Replace `YOUR-USERNAME` with the actual URL from step 5.

## Step 7: Update .env.production

Open `.env.production` and add the same line:

```bash
VITE_ASSEMBLYAI_TOKEN_URL=https://assemblyai-token-proxy.YOUR-USERNAME.workers.dev
```

## That's It! 🎉

Your Cloudflare Worker is now:
- ✅ Deployed and running
- ✅ Secured with your API key
- ✅ Auto-scaling (handles any load)
- ✅ FREE (100,000 requests/day)

## Testing Your Worker

You can test it in your browser by visiting:

```
https://assemblyai-token-proxy.YOUR-USERNAME.workers.dev
```

You should see a JSON response with a `token` field.

## Troubleshooting

**Problem:** `wrangler: command not found`

**Solution:**
```bash
npm install -g wrangler
# or use npx
npx wrangler login
```

---

**Problem:** `Error: Not authorized`

**Solution:** Run `npx wrangler login` again

---

**Problem:** `Error: Unknown variable ASSEMBLYAI_API_KEY`

**Solution:** Run `npx wrangler secret put ASSEMBLYAI_API_KEY` again

---

## Need Help?

- Cloudflare Workers Docs: https://developers.cloudflare.com/workers/
- Wrangler CLI Docs: https://developers.cloudflare.com/workers/wrangler/

## Security Notes

- ✅ Your API key is NEVER exposed in frontend code
- ✅ Stored securely in Cloudflare's encrypted environment
- ✅ Worker only generates temporary tokens (expire in 60 minutes)
- ✅ CORS enabled only for your domains (can be restricted further if needed)

## Managing Your Worker

**View logs:**
```bash
npx wrangler tail
```

**Update worker code:**
```bash
npx wrangler deploy
```

**Update API key:**
```bash
npx wrangler secret put ASSEMBLYAI_API_KEY
```

**Delete worker:**
```bash
npx wrangler delete
```
