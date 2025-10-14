# 🚨 CRITICAL DATA RECOVERY GUIDE

## Current Situation
All meetings were accidentally deleted from your live app. All Google Drive backups show 0 meetings (they were overwritten with empty data).

## Recovery Options (Try in this order)

---

### ✅ Option 1: Check Desktop LocalForage (BEST CHANCE!)

Your desktop app might have older data in IndexedDB/localforage. Run this in your **DESKTOP browser** console:

```javascript
// CHECK LOCALFORAGE FOR BACKUP DATA
(async function() {
  console.log('🔍 Checking localforage for backup data...')

  try {
    // Try to load localforage
    const localforage = window.localforage || (await import('https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js')).default

    // Check for meetings
    const meetings = await localforage.getItem('meetingflow_meetings')
    console.log('📊 LocalForage meetings:', meetings?.length || 0)

    if (meetings && meetings.length > 0) {
      console.log('✅ FOUND BACKUP DATA!', meetings.length, 'meetings')
      console.log('Sample:', meetings.slice(0, 2).map(m => ({ title: m.title, date: m.date })))

      // Save to localStorage
      localStorage.setItem('meetingflow_meetings', JSON.stringify(meetings))
      console.log('💾 Copied to localStorage!')

      alert(`✅ RECOVERED ${meetings.length} MEETINGS FROM LOCALFORAGE!\n\nRefresh the page (F5) to see them.`)
    } else {
      console.log('❌ No meetings found in localforage')
    }

    // Also check stakeholders and categories
    const stakeholders = await localforage.getItem('meetingflow_stakeholders')
    const categories = await localforage.getItem('meetingflow_stakeholder_categories')

    if (stakeholders) {
      localStorage.setItem('meetingflow_stakeholders', JSON.stringify(stakeholders))
      console.log('✅ Recovered', stakeholders.length, 'stakeholders')
    }

    if (categories) {
      localStorage.setItem('meetingflow_stakeholder_categories', JSON.stringify(categories))
      console.log('✅ Recovered', categories.length, 'categories')
    }

  } catch (error) {
    console.error('❌ Error checking localforage:', error)
  }
})()
```

---

### ✅ Option 2: Check Mobile Device (IF BROWSER STILL OPEN!)

**CRITICAL:** If you still have your mobile browser open with the app, DO NOT CLOSE IT!

On your **MOBILE device**, open the app and run this console script:

```javascript
// EXPORT MOBILE DATA
(function() {
  console.log('📱 Checking mobile localStorage...')

  const meetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
  console.log('Found', meetings.length, 'meetings on mobile')

  if (meetings.length > 0) {
    // Create export data
    const exportData = {
      meetings: meetings,
      stakeholders: JSON.parse(localStorage.getItem('meetingflow_stakeholders') || '[]'),
      categories: JSON.parse(localStorage.getItem('meetingflow_stakeholder_categories') || '[]'),
      exportedAt: new Date().toISOString(),
      source: 'mobile'
    }

    // Create downloadable file
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meetingflow-mobile-backup-${Date.now()}.json`
    a.click()

    console.log('✅ Downloaded backup file!')
    alert(`✅ Downloaded backup with ${meetings.length} meetings!\n\nSend this file to your desktop and import it.`)
  } else {
    console.log('❌ No meetings on mobile')
  }
})()
```

Then import the file on desktop using this script:

```javascript
// IMPORT MOBILE BACKUP FILE (paste the JSON content as 'data' variable)
(function() {
  // Paste your JSON file contents here
  const data = /* PASTE JSON HERE */

  localStorage.setItem('meetingflow_meetings', JSON.stringify(data.meetings))
  localStorage.setItem('meetingflow_stakeholders', JSON.stringify(data.stakeholders))
  localStorage.setItem('meetingflow_stakeholder_categories', JSON.stringify(data.categories))

  console.log('✅ Imported', data.meetings.length, 'meetings!')
  alert('✅ Import complete! Refresh (F5)')
})()
```

---

### ✅ Option 3: Check Browser Session Storage

Sometimes data persists in session storage:

```javascript
// CHECK SESSION STORAGE
(function() {
  console.log('🔍 Checking session storage...')

  for (let key in sessionStorage) {
    if (key.includes('meeting')) {
      console.log('Found:', key, sessionStorage.getItem(key)?.length, 'chars')
    }
  }

  // Try to find any backup keys
  const backupKeys = Object.keys(localStorage).filter(k => k.includes('backup') || k.includes('transcript'))
  console.log('Backup keys found:', backupKeys)

  backupKeys.forEach(key => {
    console.log(key, ':', localStorage.getItem(key))
  })
})()
```

---

### ✅ Option 4: Recover Assembly AI Transcripts (PARTIAL RECOVERY)

This will only recover the 2 specific meetings you lost during the crash:

**Use the quick-restore-transcripts.html file:**

1. Open: `quick-restore-transcripts.html`
2. Click "RESTORE THESE 2 MEETINGS NOW"
3. Copy the generated script
4. Paste in your app console
5. Refresh

Or use this direct console script:

```javascript
// RECOVER FROM ASSEMBLY AI
(async function() {
  const transcriptIds = [
    '4f8c4e19-44b1-4c99-b9bb-8549d4faf3ad',
    '2cad96ef-4bf1-481f-9de9-2c0a22da0e27'
  ]

  const apiKey = '95b4727b94534ba492e273b2af713159'

  console.log('🔄 Recovering from Assembly AI...')

  const meetings = []

  for (const id of transcriptIds) {
    try {
      const res = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { authorization: apiKey }
      })
      const transcript = await res.json()

      const speakers = new Set(transcript.utterances?.map(u => u.speaker) || [])
      const formattedTranscript = transcript.utterances?.map(u =>
        `[Speaker ${u.speaker}]: ${u.text}`
      ).join('\n\n') || transcript.text

      meetings.push({
        id: crypto.randomUUID(),
        title: `Recovered Meeting - ${new Date().toLocaleDateString()}`,
        date: new Date().toISOString().split('T')[0],
        audioTranscript: formattedTranscript,
        transcript: formattedTranscript,
        originalInputs: {
          audioTranscript: formattedTranscript,
          manualText: '',
          ocrText: ''
        },
        wordCount: transcript.text?.split(' ').length || 0,
        speakerCount: speakers.size,
        duration: transcript.audio_duration,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          recovered: true,
          assemblyAIId: id
        }
      })

      console.log('✅ Recovered:', id)
    } catch (error) {
      console.error('❌ Failed:', id, error)
    }
  }

  if (meetings.length > 0) {
    const existing = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
    localStorage.setItem('meetingflow_meetings', JSON.stringify([...meetings, ...existing]))
    console.log('✅ Recovered', meetings.length, 'meetings!')
    alert(`✅ Recovered ${meetings.length} meetings!\n\nRefresh (F5)`)
  }
})()
```

---

### ✅ Option 5: Check Browser History/DevTools

1. Open Chrome DevTools → Application → IndexedDB
2. Look for any MeetingFlow-related databases
3. Check Storage → Local Storage → look for old entries
4. Check Network tab history for recent sync uploads (might show data in request payload)

---

### ✅ Option 6: Check Google Drive Files Manually

Even though the scan showed 0 meetings, let's manually download and inspect the files:

```javascript
// DOWNLOAD ALL GOOGLE DRIVE FILES FOR MANUAL INSPECTION
(async function() {
  const accessToken = prompt('Enter Google Drive access token:')
  const folderId = '14BWVk13-gkWYcXp-qgiiZFFo9Yf6Oh_B'

  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=parents in '${folderId}'&fields=files(id,name,size,modifiedTime)`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  )

  const { files } = await listRes.json()
  console.log('Files found:', files)

  for (const file of files) {
    const contentRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    )
    const content = await contentRes.text()

    // Download file
    const blob = new Blob([content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()

    console.log('Downloaded:', file.name)
  }

  alert('All files downloaded! Check your downloads folder.')
})()
```

---

## What NOT to Do

- ❌ Don't run any more deletion scripts
- ❌ Don't sync to cloud until you've recovered data (it will overwrite with empty state)
- ❌ Don't close your mobile browser if it's still open
- ❌ Don't clear browser cache/data

---

## Next Steps

1. **IMMEDIATELY** try Option 1 (localforage check) on your desktop
2. If that fails, try Option 2 (mobile device) if your mobile browser is still open
3. Fall back to Option 4 (Assembly AI) for partial recovery
4. Contact me with results

---

## Prevention for Future

Once recovered, we'll implement:
1. Multiple backup layers (localStorage + localforage + Google Drive)
2. Soft-delete with 30-day retention
3. Explicit backup/restore UI
4. Daily auto-backups
5. Export functionality before any bulk operations
