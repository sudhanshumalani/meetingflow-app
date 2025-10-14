# 🔄 COMPREHENSIVE ASSEMBLY AI RECOVERY GUIDE

## Overview

This guide will help you recover **ALL** your meetings from Assembly AI servers. Assembly AI keeps transcripts for 30-60 days, and this process will find and recover everything that's still available.

---

## ✅ What This Process Does

1. **Scans your entire Assembly AI account** for all transcripts
2. **Finds both types of transcripts:**
   - Pre-recorded audio (uploaded files)
   - Streaming transcripts (real-time recording)
3. **Shows you what's available** with details (date, duration, word count)
4. **Lets you select** which ones to recover
5. **Converts them properly** to MeetingFlow format
6. **Generates an import script** to restore them in your app

---

## 📋 Step-by-Step Recovery Process

### **STEP 1: Open the Recovery Tool**

1. Locate the file: `comprehensive-assembly-recovery.html`
2. Double-click to open it in your browser
3. You should see a page titled "Comprehensive Assembly AI Recovery"

**✅ Checkpoint:** You should see the recovery interface with an API key field and scan button.

---

### **STEP 2: Enter Your API Key**

1. The API key should already be filled in: `95b4727b94534ba492e273b2af713159`
2. If not, get it from your `.env` file (look for `VITE_ASSEMBLYAI_API_KEY`)
3. Verify the key is entered correctly

**✅ Checkpoint:** API key field shows your Assembly AI key.

---

### **STEP 3: Choose Recovery Options**

Select one of these options:

- **"All available transcripts"** ← **RECOMMENDED** (gets everything)
- "Last 30 days only" (faster, but might miss older meetings)
- "Last 7 days only" (fastest, but only recent meetings)

**💡 Recommendation:** Choose "All available transcripts" to get the maximum recovery.

**✅ Checkpoint:** Radio button is selected for your chosen option.

---

### **STEP 4: Scan Assembly AI**

1. Click the big blue button: **"SCAN ALL ASSEMBLY AI TRANSCRIPTS"**
2. Wait while it scans (this may take 30-60 seconds)
3. Watch the progress log:
   - "Fetching page 1..."
   - "Found X transcripts on page 1"
   - "SCAN COMPLETE!"

**What's happening:** The tool is calling Assembly AI's API to list ALL transcripts from your account, including:
- Pre-recorded audio uploads
- Live streaming transcriptions
- All completed, processing, and failed transcripts

**✅ Checkpoint:** You should see "SCAN COMPLETE!" message with a count of transcripts found.

---

### **STEP 5: Review Found Transcripts**

You'll now see a list of all available transcripts with:
- Transcript number and ID
- Date and time created
- Duration (seconds)
- Word count
- Number of audio channels
- Whether it has speaker diarization

**Example:**
```
☑️ Transcript 1
   ID: 4f8c4e19-44b1-4c99-b9bb-8549d4faf3ad
   Date: 10/13/2025, 3:45:23 PM    Duration: 180s
   📝 1,234 words    🎤 1 channel(s)    👥 Speaker diarization
```

**✅ Checkpoint:** You can see all your available transcripts listed with details.

---

### **STEP 6: Select Transcripts to Recover**

**Option A: Recover Everything (Recommended)**
1. Click the **"Select All"** button
2. All checkboxes will be checked
3. You'll see "Selected: X transcripts" at the bottom

**Option B: Select Specific Transcripts**
1. Check the box next to each transcript you want to recover
2. The count will update as you select
3. You can use "Clear Selection" to start over

**💡 Tip:** Unless you have a specific reason not to, select ALL transcripts to maximize recovery.

**✅ Checkpoint:** "Selected: X transcripts" shows the number you've selected.

---

### **STEP 7: Recover Selected Transcripts**

1. Click the big green button: **"RECOVER SELECTED MEETINGS"**
2. A confirmation dialog will appear asking if you want to recover X transcripts
3. Click **"OK"** to proceed
4. Watch the progress log:
   - "[1/5] Processing abc123..."
   - "  ✅ Recovered: 1,234 words, 3 speakers"
   - "[2/5] Processing def456..."
   - etc.

**What's happening:** The tool is:
1. Downloading the FULL transcript data from Assembly AI for each selected transcript
2. Converting it to proper MeetingFlow meeting format with:
   - Title (based on date/time)
   - Speaker-formatted transcript
   - Word count, duration, confidence scores
   - Proper field mapping for your app
3. Packaging everything into an import script

**⏱️ Time:** This takes about 2-5 seconds per transcript. For 10 transcripts, expect ~30 seconds.

**✅ Checkpoint:** You should see "RECOVERY COMPLETE!" with success/failure counts.

---

### **STEP 8: Review Recovery Results**

You'll now see:

1. **Green success box** showing all recovered meetings with:
   - Meeting title
   - Word count, speaker count, duration, date
   - Full list of what was recovered

2. **Red error box** (if any failed) showing:
   - Which transcripts failed
   - Why they failed

3. **Blue import script box** with:
   - JavaScript code to import the meetings
   - Two buttons: "Copy to Clipboard" and "Download Script"

**✅ Checkpoint:** You can see the list of recovered meetings and the import script.

---

### **STEP 9: Copy the Import Script**

**Option A: Copy to Clipboard (Recommended)**
1. Click the **"📋 Copy to Clipboard"** button
2. You'll see an alert confirming it was copied
3. Keep this clipboard contents safe until step 11

**Option B: Download Script File**
1. Click the **"💾 Download Script"** button
2. A `.js` file will download
3. You can open this file later to copy the contents

**✅ Checkpoint:** Script is copied to clipboard or downloaded.

---

### **STEP 10: Open Your MeetingFlow App**

1. Open your browser
2. Go to: https://sudhanshumalani.github.io/meetingflow-app
3. Wait for the app to load completely
4. **Do NOT refresh or navigate away yet**

**✅ Checkpoint:** Your MeetingFlow app is loaded and showing (currently 0 or few meetings).

---

### **STEP 11: Open Browser Console**

1. Press **F12** (or right-click → Inspect)
2. Click the **"Console"** tab
3. You should see a JavaScript console with a `>` prompt

**Alternative keys:**
- Windows/Linux: `F12` or `Ctrl+Shift+J`
- Mac: `Cmd+Option+J`

**✅ Checkpoint:** Browser console is open and ready for input.

---

### **STEP 12: Paste and Execute Import Script**

1. Click in the console where you see the `>` prompt
2. **Paste** the script (Ctrl+V or Cmd+V)
3. Press **Enter**
4. Watch the console output:
   - "🔄 Importing X recovered meetings from Assembly AI..."
   - "Current meetings in app: Y"
   - "✅ Imported: Meeting - 10/13/2025..."
   - "✅ Imported: Meeting - 10/12/2025..."
   - etc.
   - "📊 IMPORT COMPLETE!"
   - "  ✅ Imported: X"
   - "  ⏭️ Skipped (duplicates): Y"
   - "  📝 Total meetings now: Z"

5. An alert will popup confirming the import

**What's happening:** The script is:
1. Reading your recovered meetings data
2. Getting existing meetings from localStorage
3. Checking for duplicates (by Assembly AI ID)
4. Adding new meetings to the beginning of the list
5. Saving everything back to localStorage
6. Triggering a storage event to update the app

**✅ Checkpoint:** You see "IMPORT COMPLETE!" in console and alert confirms import.

---

### **STEP 13: Refresh the App**

1. Press **F5** (or click refresh button)
2. Wait for the app to reload
3. Your recovered meetings should now appear!

**✅ Checkpoint:** You can now see all your recovered meetings in the app!

---

### **STEP 14: Verify Recovery**

1. Count the meetings in your app
2. It should match the "Imported" count from step 12
3. Click on a few meetings to verify:
   - The transcript displays correctly
   - Speaker labels are shown
   - Dates look correct
   - Content is readable

**✅ Checkpoint:** All recovered meetings are visible and readable in your app.

---

### **STEP 15: Sync to Cloud (IMPORTANT!)**

**⚠️ CRITICAL:** Now that you have your data back, sync it to Google Drive immediately!

1. In your app, go to **Settings**
2. Scroll to **Cross-Device Sync**
3. Click **"Sync to Cloud"** button
4. Wait for sync to complete
5. Verify: "✅ Synced successfully"

**Why this is important:** This ensures your recovered meetings are backed up to Google Drive, so you won't lose them again.

**✅ Checkpoint:** Sync complete, data now backed up to Google Drive.

---

## 🎉 Recovery Complete!

You should now have:
- ✅ All available transcripts recovered from Assembly AI
- ✅ Properly formatted meetings in your app
- ✅ Data backed up to Google Drive
- ✅ Peace of mind

---

## 📊 Understanding the Results

### What Gets Recovered

For each transcript, you get:
- **Full transcript text** with speaker labels
- **Meeting metadata:** date, duration, word count, speaker count
- **Original Assembly AI data:** utterances, words, confidence scores
- **Recovery information:** marked as "recovered" with Assembly AI ID

### What About Duplicates?

The import script is smart:
- It checks if a meeting already exists (by Assembly AI ID)
- If found, it skips (doesn't create duplicates)
- Only new meetings are imported

---

## ❌ Troubleshooting

### Problem: "No completed transcripts found"

**Possible causes:**
1. Transcripts were deleted from Assembly AI servers
2. Transcripts are outside retention period (30-60 days)
3. Wrong API key
4. No audio was ever uploaded to Assembly AI

**Solutions:**
- Try "All available transcripts" option
- Check your API key is correct
- Verify you're using the right Assembly AI account
- Check Assembly AI dashboard: https://www.assemblyai.com/app/transcripts

---

### Problem: "API Error: 401 Unauthorized"

**Cause:** Invalid API key

**Solution:**
1. Check your `.env` file for correct API key
2. Verify you copied the entire key (no spaces)
3. Make sure you're using the Assembly AI key (not Google Drive key)

---

### Problem: "Some transcripts failed to recover"

**Possible causes:**
- Transcript is still processing
- Transcript had an error status
- Network issue during download

**Solution:**
- Note which transcript IDs failed
- Wait a few minutes and try again
- Check Assembly AI dashboard for transcript status

---

### Problem: "Import script doesn't work in console"

**Possible causes:**
- Script was truncated during copy
- Console has an error
- Browser security settings

**Solution:**
1. Try downloading the script instead (Step 9 Option B)
2. Open the file in a text editor
3. Copy from the file
4. Paste in console again
5. Make sure there are no errors before pressing Enter

---

### Problem: "Meetings imported but no transcript visible"

**Cause:** This should not happen with the new recovery tool (it properly maps transcript fields)

**Solution:**
1. Click on a recovered meeting
2. Press F12 → Console
3. Check what fields the meeting has:
   ```javascript
   const meetings = JSON.parse(localStorage.getItem('meetingflow_meetings'))
   console.log(meetings[0]) // Check first meeting structure
   ```
4. Verify it has `originalInputs.audioTranscript`

---

## 📝 Post-Recovery Checklist

After successful recovery:

- [ ] Verified all meetings appear in app
- [ ] Clicked on several meetings to confirm transcripts display
- [ ] Synced to Google Drive successfully
- [ ] Tested sync on mobile device
- [ ] Created a manual export backup (Settings → Export Data)

---

## 🛡️ Preventing Future Data Loss

### Immediate Actions:

1. **Enable Auto-Sync**
   - Settings → Cross-Device Sync → Enable
   - Set to sync every 5 minutes

2. **Regular Manual Backups**
   - Weekly: Settings → Export Data → Download JSON
   - Store backups in safe location

3. **Verify Sync Works**
   - Test on multiple devices
   - Check Google Drive folder has recent files

### Coming Soon (Recommended Improvements):

1. Multiple backup layers (localStorage + localforage + Google Drive)
2. Soft-delete with 30-day retention (instead of hard delete)
3. Explicit backup/restore UI
4. Daily auto-backups
5. Pre-deletion backup prompts

---

## 🆘 Still Need Help?

If you're stuck at any step or encounter issues:

1. Check which step you're on
2. Note any error messages (screenshot helps)
3. Check the browser console for errors (F12 → Console)
4. Contact support with:
   - Which step you're stuck on
   - Error messages
   - Number of transcripts found/recovered
   - Browser being used

---

## 📚 Technical Details

### Assembly AI Transcript Types

**Pre-recorded Audio:**
- Uploaded audio files (MP3, WAV, etc.)
- Full file transcribed at once
- Usually has `audio_url` field

**Streaming:**
- Real-time transcription via WebSocket
- Transcribed as audio streams in
- May have different metadata

Both types are recovered the same way and converted to identical meeting formats.

### API Endpoints Used

1. **List transcripts:** `GET https://api.assemblyai.com/v2/transcript`
   - Returns paginated list of all transcripts
   - Includes metadata (date, duration, status)

2. **Get transcript:** `GET https://api.assemblyai.com/v2/transcript/{id}`
   - Returns full transcript details
   - Includes text, utterances, words, confidence

### Data Retention

Assembly AI keeps transcripts for:
- **Standard:** 30 days
- **Pro/Enterprise:** 60-90 days (check your plan)

After this period, transcripts are permanently deleted from their servers.

---

## 🎓 Understanding the Recovery Tool

The `comprehensive-assembly-recovery.html` tool is a standalone HTML file that:

1. **Runs entirely in your browser** (no server needed)
2. **Calls Assembly AI API directly** using your API key
3. **Processes data locally** (nothing sent to external servers)
4. **Generates JavaScript** that you paste in your app
5. **Is safe to use** (you can inspect the code)

The tool uses Assembly AI's official REST API to:
- List all transcripts in your account
- Filter by date range if desired
- Download full transcript data
- Convert to MeetingFlow format
- Generate import script

---

**Good luck with your recovery! This should get all your meetings back.** 🎉
