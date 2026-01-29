# MeetingFlow App - Sync & Delete Architecture Documentation

**Purpose:** This document describes the current sync and delete architecture for cross-device sync between Desktop and iOS. Created for review by AI systems (Perplexity, ChatGPT) to identify issues with delete sync not working properly.

**Current Issue:** When a meeting is deleted on Desktop, it shows deleted locally. But on mobile, the deleted meeting still appears. When manually syncing mobile then desktop, the deleted meeting reappears on desktop.

---

## 1. FILES INVOLVED IN SYNC/DELETE LOGIC

### Core Context & State Management
- `src/contexts/AppContext.jsx` - Primary app state, sync orchestration, soft delete
- `src/contexts/SyncProvider.jsx` - Sync wrapper (mostly disabled, using Firestore)

### Storage Layer - Dexie (IndexedDB)
- `src/db/meetingFlowDB.js` - Database schema, metadata/blob separation
- `src/db/dexieService.js` - CRUD operations, soft delete functions
- `src/db/outboxService.js` - Offline queue (exists but not currently used)

### Cloud Sync - Firestore
- `src/utils/firestoreService.js` - Firebase SDK (Desktop/real-time subscriptions)
- `src/utils/firestoreRestService.js` - REST API (iOS fallback)

### React Hooks
- `src/hooks/useMeetings.js` - Dexie live queries with soft delete filtering

---

## 2. STORAGE LAYERS

### A. Dexie (IndexedDB) - PRIMARY LOCAL STORAGE

**Schema:**
```
meetings: 'id, date, projectId, lastAccessedAt, localState, version, *stakeholderIds'
  - Metadata only (~1-5 KB per meeting)
  - Includes: deleted (boolean), deletedAt, updatedAt

meetingBlobs: '[meetingId+type], meetingId, type'
  - Transcript, analysis, notes, images
  - Stored separately for performance
```

**Soft Delete in Dexie:**
```javascript
// dexieService.js - softDeleteMeeting()
await db.meetings.update(meetingId, {
  deleted: true,
  deletedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
})
// Meeting data KEPT in database, just marked deleted
```

### B. Firestore - CLOUD STORAGE

**Collections:** `meetings`, `stakeholders`, `stakeholderCategories`

**What's Synced:**
- All metadata (title, date, duration, etc.)
- Text content (transcript, AI analysis, notes)
- `deleted` flag and `updatedAt` timestamp
- NOT synced: audio blobs, large images (>100KB)

**Document Structure:**
```javascript
{
  id: string,
  userId: string,        // Device identifier
  deleted: boolean,      // Soft delete flag
  updatedAt: string,     // ISO timestamp for conflict resolution
  lastModified: serverTimestamp(),
  // + text content fields
}
```

### C. localStorage - CONFIG ONLY

Only stores: `meetingflow_firestore_user_id` (device UUID)
NO meeting data in localStorage (removed in Phase 3)

---

## 3. DATA FLOW FOR OPERATIONS

### A. DELETE MEETING (The Problematic Flow)

**Trigger:** `deleteMeeting(meetingId)` in AppContext

**Current Implementation:**
```
1. acquireInteractionLock('deleteMeeting')
2. dispatch DELETE_MEETING → removes from React state
3. softDeleteMeetingInDexie() → sets deleted=true in local Dexie
4. getFullMeeting(meetingId) → fetch the meeting we just soft-deleted
5. firestoreService.saveMeeting({...meeting, deleted: true}) → sync to cloud
6. releaseInteractionLock() after 1 second
```

**Code (AppContext.jsx, lines 1499-1545):**
```javascript
deleteMeeting: async (meetingId) => {
  acquireInteractionLock('deleteMeeting')

  try {
    // 1. Remove from UI
    dispatch({ type: 'DELETE_MEETING', payload: meetingId })

    // 2. Soft delete in Dexie
    await softDeleteMeetingInDexie(meetingId, { queueSync: false })

    // 3. Sync to Firestore
    if (ENABLE_FIRESTORE) {
      const firestoreService = await getFirestoreService()
      const deletedMeeting = await getFullMeeting(meetingId)
      if (deletedMeeting) {
        await firestoreService.saveMeeting(stripBinaryOnly({
          ...deletedMeeting,
          deleted: true,
          updatedAt: new Date().toISOString()
        }))
      }
    }
  } finally {
    setTimeout(() => releaseInteractionLock(), 1000)
  }
}
```

### B. FIRESTORE SUBSCRIPTION (How Other Devices Receive Updates)

**Setup (AppContext.jsx, lines 1065-1111):**
```javascript
firestoreService.subscribeMeetings((firestoreMeetings) => {
  // Skip if sync/interaction in progress
  if (isSyncInProgress() || isUserInteractionInProgress()) return

  // Filter out deleted meetings
  const activeMeetings = firestoreMeetings.filter(m => !m.deleted)

  // Merge with local data
  const localMeetings = currentMeetingsRef.current || []
  const mergedMeetings = mergeMeetingsData(localMeetings, activeMeetings)

  // Update React state (active only)
  dispatch({ type: 'SET_MEETINGS', payload: mergedMeetings })

  // Save ALL to Dexie (including deleted)
  bulkSaveMeetings(firestoreMeetings, { queueSync: false })
})
```

**CRITICAL: The Firestore Query in firestoreService.js (lines 333-386):**
```javascript
subscribeMeetings(callback) {
  const q = query(
    collection(db, 'meetings'),
    where('userId', '==', this.userId),
    where('deleted', '==', false)  // <-- FILTERS OUT deleted=true items!
  )

  return onSnapshot(q, (snapshot) => {
    const meetings = snapshot.docs.map(doc => doc.data())
    callback(meetings)
  })
}
```

### C. MANUAL SYNC - performFullSync()

**Flow (AppContext.jsx, lines 1719-1983):**
```
1. acquireSyncLock()
2. Fetch from Firestore: getMeetings(), getStakeholders(), getCategories()
3. Load from Dexie: getAllMeetingMetadata(), getFullMeeting(), etc.
4. Filter both by !deleted
5. Merge with timestamp comparison (mergeByIdWithTracking)
6. Upload local changes to Firestore
7. Save merged data to Dexie
8. loadData() to refresh React state
9. releaseSyncLock()
```

**getMeetings() in firestoreService.js (lines 175-205):**
```javascript
async getMeetings() {
  const q = query(
    collection(db, 'meetings'),
    where('userId', '==', this.userId)
    // NOTE: No where('deleted', '==', false) here!
    // Gets ALL meetings including deleted
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => doc.data())
}
```

### D. LOAD DATA (Initial App Load)

**Flow (AppContext.jsx, lines 893-1005):**
```
1. Load from Dexie (primary source)
2. Filter by !deleted
3. Dispatch LOAD_DATA to React state
4. If Dexie empty and user logged in, trigger auto-sync
```

---

## 4. TIMING AND LOCKS

### Sync Lock (Full sync protection)
```javascript
let isSyncLocked = false
const SYNC_LOCK_TIMEOUT = 60000 // 60 seconds

acquireSyncLock() // Called at start of performFullSync
releaseSyncLock() // Called at end

isSyncInProgress() // Checked by subscriptions
```

### Interaction Lock (Delete protection)
```javascript
let isUserInteracting = false
const INTERACTION_LOCK_TIMEOUT = 10000 // 10 seconds

acquireInteractionLock('deleteMeeting') // Called at start of delete
releaseInteractionLock() // Called after 1 second

isUserInteractionInProgress() // Checked by subscriptions
```

### When Subscriptions Skip Updates
```javascript
if (isSyncInProgress() || isUserInteractionInProgress()) {
  return // Don't process this subscription update
}
```

---

## 5. MERGE LOGIC

### mergeMeetingsData() (AppContext.jsx, lines 1195-1260)

**Purpose:** Merge cloud meetings with local meetings

**Rules:**
1. Cloud is authoritative for existence
2. New local meetings get 5-minute grace period
3. Preserve local binary data when cloud is newer
4. Timestamp-based conflict resolution (updatedAt)

```javascript
function mergeMeetingsData(localMeetings, cloudMeetings) {
  const cloudIds = new Set(cloudMeetings.map(m => m.id))
  const result = []

  // Start with cloud meetings (authoritative)
  for (const cloudMeeting of cloudMeetings) {
    const local = localMeetings.find(m => m.id === cloudMeeting.id)
    if (local) {
      // Preserve local binary data, use newer metadata
      result.push(cloudIsNewer ? {...cloudMeeting, ...localBinaryFields} : local)
    } else {
      result.push(cloudMeeting)
    }
  }

  // Add local-only meetings if within grace period
  for (const localMeeting of localMeetings) {
    if (!cloudIds.has(localMeeting.id)) {
      const age = Date.now() - new Date(localMeeting.createdAt).getTime()
      if (age < 5 * 60 * 1000) { // 5 minutes
        result.push(localMeeting) // Keep new local meeting
      }
      // Else: deleted from another device, don't keep
    }
  }

  return result
}
```

### mergeByIdWithTracking() (AppContext.jsx, lines 706-775)

**Purpose:** Used in performFullSync for bidirectional merge

**Returns:**
- `merged`: Combined data
- `toUpload`: Local items newer than cloud
- `toDownload`: Cloud items newer than local

---

## 6. IDENTIFIED ISSUES / QUESTIONS

### Issue 1: Subscription Query Filters Deleted Items
The `subscribeMeetings()` query has `where('deleted', '==', false)`, meaning:
- Devices NEVER receive deleted=true meetings via subscriptions
- A device that deleted a meeting sends deleted=true to Firestore
- Other devices' subscriptions don't see this update (filtered out)
- The meeting just "disappears" from the subscription, but:
  - It still exists in local Dexie on other devices
  - mergeMeetingsData() might keep it due to grace period logic

### Issue 2: getMeetings() vs subscribeMeetings() Inconsistency
- `getMeetings()` (manual sync) returns ALL meetings including deleted
- `subscribeMeetings()` (real-time) only returns deleted=false
- This creates different behavior between manual sync and real-time

### Issue 3: Merge Logic May Resurrect Deleted Meetings
In mergeMeetingsData():
- If a meeting exists locally but not in cloud subscription (because deleted=true is filtered)
- And it's older than 5 minutes
- It should be removed... BUT
- If manual sync runs, getMeetings() returns it with deleted=true
- The filter happens after: `filteredCloudMeetings = cloudMeetings.filter(m => !m.deleted)`
- So deleted meetings are excluded from merge
- But then bulkSaveMeetings saves the merged result WITHOUT the deleted meeting
- This might lose the deleted=true flag in local Dexie?

### Issue 4: No Explicit Delete Propagation
When Device A deletes:
1. Sets deleted=true in Firestore
2. Device B subscription doesn't receive it (filtered by deleted=false)
3. Device B still has the meeting in local Dexie
4. When Device B does manual sync:
   - Gets deleted=true meeting from Firestore
   - Filters it out before merge
   - Saves merge result to Dexie
   - But what happens to the local copy with deleted=false?

### Issue 5: Auto-Sync Disabled
From console log: "automatic startup sync disabled for data safety"
- Real-time subscriptions may not be working as expected
- Manual sync is required for full synchronization

---

## 7. CONSOLE LOG ANALYSIS

From user's console:
```
42 meetings in local Dexie
41 meetings received from cloud
```

This suggests:
- 1 meeting exists locally that doesn't exist in cloud (deleted elsewhere?)
- OR 1 meeting has deleted=true in Firestore and is filtered out

---

## 8. SUMMARY OF DATA FLOW

```
DELETE ON DEVICE A:
  A: dispatch DELETE_MEETING (UI hidden)
  A: Dexie.update(deleted=true)
  A: Firestore.save(deleted=true)

SUBSCRIPTION ON DEVICE B:
  B: subscription query has where('deleted', '==', false)
  B: DOES NOT RECEIVE the deleted=true document
  B: Meeting still shows in local Dexie
  B: Meeting still shows in UI

MANUAL SYNC ON DEVICE B:
  B: getMeetings() returns ALL including deleted=true
  B: Filter: cloudMeetings.filter(!deleted) removes it
  B: Merge: meeting not in filtered cloud data
  B: If meeting > 5 min old, should be removed from local
  B: bulkSaveMeetings saves merged result
  B: But local Dexie still has the meeting?

MANUAL SYNC ON DEVICE A (after B synced):
  A: getMeetings() returns data including what B uploaded
  A: If B didn't properly handle the delete...
  A: The meeting might come back?
```

---

## 9. QUESTIONS FOR REVIEW

1. Should `subscribeMeetings()` query include deleted=true items so other devices can mark them deleted locally?

2. In `mergeMeetingsData()`, when a meeting exists locally but not in cloud (after filtering), should we check Firestore for deleted=true explicitly?

3. Should soft delete in Dexie also trigger a separate "delete record" in Firestore rather than just updating the document?

4. Is the 5-minute grace period causing deleted meetings to be "kept" when they shouldn't be?

5. Should there be a "deleted items" collection in Firestore that tracks deletions explicitly?

6. Is the interaction lock (1 second) sufficient, or could race conditions still occur?
