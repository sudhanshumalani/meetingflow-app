# 🚨 EMERGENCY TRANSCRIPT RECOVERY

Your transcript can likely be recovered! Assembly AI keeps transcripts on their servers.

## IMMEDIATE ACTIONS (Do This Now!)

### Option 1: Check localStorage Backup

Open your browser console on the **MOBILE DEVICE** where you recorded:

```javascript
// Check for automatic backup
const backup = localStorage.getItem('latest_transcript_backup')
if (backup) {
  const data = JSON.parse(backup)
  console.log('✅ FOUND BACKUP!', data)
  console.log('Words:', data.text.split(' ').length)
  console.log('Speakers:', data.speakers_detected)
  console.log('Full text:', data.text)

  // Download as text file
  const blob = new Blob([data.text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'recovered-transcript.txt'
  a.click()
} else {
  console.log('❌ No backup found')
}
```

### Option 2: Recover from Assembly AI Servers

1. **Find the Transcript ID:**

   On your mobile device browser, open DevTools Console and search for:
   ```
   Speaker diarization job created:
   ```

   Copy the ID that follows (it looks like: `abc123def456`)

2. **Or check localStorage for the ID:**

   ```javascript
   const transcriptId = localStorage.getItem('latest_assemblyai_transcript_id')
   console.log('Transcript ID:', transcriptId)
   ```

3. **Recover the transcript:**

   ```javascript
   // Replace 'YOUR_TRANSCRIPT_ID' with the actual ID
   const transcriptId = 'YOUR_TRANSCRIPT_ID'
   const apiKey = 'YOUR_ASSEMBLYAI_API_KEY' // From your .env file

   fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
     headers: { authorization: apiKey }
   })
     .then(res => res.json())
     .then(transcript => {
       console.log('✅ RECOVERED!', transcript)
       console.log('Text:', transcript.text)
       console.log('Speakers:', transcript.utterances)

       // Download as file
       const blob = new Blob([transcript.text], { type: 'text/plain' })
       const url = URL.createObjectURL(blob)
       const a = document.createElement('a')
       a.href = url
       a.download = 'recovered-transcript.txt'
       a.click()
     })
   ```

### Option 3: Use the Recovery Tool

1. Pull the latest code from GitHub (includes recovery tools)
2. Navigate to `/recovery` route (or use the script above)

## What Went Wrong

The transcript data was only stored in React state (memory) and not persisted to storage. When the error occurred, the data was lost from memory.

## What's Been Fixed

1. ✅ **Automatic localStorage backup** - All transcripts are now saved immediately
2. ✅ **Transcript ID caching** - Assembly AI transcript IDs are saved for recovery
3. ✅ **Recovery tools** - Standalone recovery page and utility functions
4. ✅ **Better error handling** - Errors won't lose data anymore

## If Console Logs Are Cleared

Check the Network tab in DevTools:
1. Filter by: `assemblyai.com`
2. Look for requests to `/v2/transcript/`
3. The transcript ID is in the URL of those requests

## Assembly AI Data Retention

Assembly AI keeps transcripts for a limited time (typically 30-60 days). **Act quickly!**

## Need Help?

The transcript ID is the key to recovery. If you can find it anywhere (console logs, network tab, localStorage), your data can be recovered.
