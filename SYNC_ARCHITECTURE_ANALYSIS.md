# MeetingFlow Sync Architecture Analysis

## Executive Summary: ROOT CAUSE IDENTIFIED

**The core problem is architectural fragmentation.** The app has THREE separate data storage systems that are not properly integrated:

1. **localStorage** - Used by AppContext for reading meetings (CURRENT PRIMARY)
2. **localforage (IndexedDB via MeetingFlowSync)** - Used by sync as a fallback
3. **Dexie (IndexedDB via MeetingFlowDB)** - NEW system, only used for migration and analyzer queries

**The sync function writes to localStorage and localforage, but iOS Safari's localStorage is unreliable and often empty on cold start. AppContext reads from localStorage first, sees 0 meetings, and displays that immediately.**

---

## Detailed Architecture Analysis

### 1. Data Flow on App Startup (Current Broken Flow)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          APP STARTUP FLOW (BROKEN)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. App.jsx mounts                                                          │
│     └── initializeDexieService()  ← Opens MeetingFlowDB (Dexie)             │
│     └── migrateToDexie()          ← One-time: copies localStorage → Dexie   │
│                                                                             │
│  2. AppContext.jsx useEffect                                                │
│     └── loadData()                                                          │
│         ├── localStorage.getItem('meetingflow_meetings')  ← READS HERE      │
│         │   └── iOS: Often returns [] or "[]" on cold start!                │
│         │                                                                   │
│         ├── await getSyncStorage() (localforage: MeetingFlowSync)           │
│         │   └── Checks if IndexedDB has more data                           │
│         │   └── BUG: If localStorage returns valid [] first, this is       │
│         │       compared against [] and says "no more data"                 │
│         │                                                                   │
│         └── dispatch(LOAD_DATA) with localStorage data (0 meetings)         │
│                                                                             │
│  3. Home.jsx renders                                                        │
│     └── meetings = useApp().meetings  ← Gets 0 from AppContext              │
│     └── displayMeetings = meetings    ← Shows 0 meetings                    │
│                                                                             │
│  4. USER SEES: "0 meetings"                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Data Flow on Manual Sync (Works Correctly)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        MANUAL SYNC FLOW (WORKS)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User clicks "Sync" button                                               │
│     └── Home.jsx: handleQuickSync()                                         │
│         └── performFullSync() from AppContext                               │
│                                                                             │
│  2. performFullSync() in AppContext.jsx (line 1868)                         │
│     ├── Fetches from Firestore: 34 meetings                                 │
│     ├── Merges with local data                                              │
│     ├── Saves to BOTH:                                                      │
│     │   ├── localStorage.setItem('meetingflow_meetings', ...)               │
│     │   └── syncStorage.setItem('meetings', ...)  (localforage)             │
│     │                                                                       │
│     └── loadData()  ← Reloads AppContext state                              │
│         └── Now localStorage has 34 meetings                                │
│         └── dispatch(LOAD_DATA) with 34 meetings                            │
│                                                                             │
│  3. Home.jsx re-renders                                                     │
│     └── meetings = useApp().meetings  ← Gets 34 from AppContext             │
│                                                                             │
│  4. USER SEES: "34 meetings"                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Data Flow on App Refresh (Back to Broken)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        APP REFRESH (BROKEN AGAIN)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  iOS Safari Behavior:                                                       │
│  - localStorage data may be evicted or unavailable on cold start            │
│  - IndexedDB (localforage) may retain data longer                           │
│  - Dexie (MeetingFlowDB) has data from migration                            │
│                                                                             │
│  On Refresh:                                                                │
│  1. loadData() reads localStorage → [] (empty or evicted)                   │
│  2. Checks localforage → may have 34 meetings                               │
│  3. BUG: Comparison logic may fail if localStorage parsing succeeded        │
│  4. dispatch(LOAD_DATA) with 0 meetings                                     │
│                                                                             │
│  USER SEES: "0 meetings" until manual sync again                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Files and Their Roles

### Storage Layer 1: localStorage (AppContext Primary)
- **File**: `src/contexts/AppContext.jsx`
- **Keys Used**:
  - `meetingflow_meetings`
  - `meetingflow_stakeholders`
  - `meetingflow_stakeholder_categories`
  - `meetingflow_deleted_items`
- **Read by**: `loadData()` function (line 990)
- **Written by**: `performFullSync()`, save effects
- **Problem**: iOS Safari may evict or not persist localStorage

### Storage Layer 2: localforage (Sync Fallback)
- **File**: `src/contexts/AppContext.jsx`
- **Instance Name**: `MeetingFlowSync`
- **Store Name**: `sync_data`
- **Keys Used**:
  - `meetings`
  - `stakeholders`
  - `categories`
- **Read by**: `loadData()` as secondary source
- **Written by**: `performFullSync()` after cloud sync
- **Problem**: Not the primary source; only checked as fallback

### Storage Layer 3: Dexie (New, Underutilized)
- **File**: `src/db/meetingFlowDB.js`
- **Database Name**: `MeetingFlowDB`
- **Tables**: meetings, meetingBlobs, stakeholders, stakeholderCategories, outbox, analysisIndex, syncMeta
- **Read by**: Analyzer Dashboard (useDexieQueries.js hooks)
- **Written by**: Migration only (migrateToDexie)
- **Problem**: NOT used by AppContext or sync! Only for analyzer.

---

## The Three Databases Explained

| Database | Technology | Created In | Used For | AppContext Uses? | Sync Writes To? |
|----------|------------|------------|----------|------------------|-----------------|
| localStorage | Browser API | Native | Primary data store | ✅ YES (primary) | ✅ YES |
| MeetingFlowSync | localforage/IndexedDB | AppContext.jsx | Fallback when localStorage full | ⚠️ Secondary | ✅ YES |
| MeetingFlowDB | Dexie/IndexedDB | meetingFlowDB.js | Analyzer queries, future primary | ❌ NO | ❌ NO |

**This is the root cause!**

1. Manual sync writes to localStorage and MeetingFlowSync (localforage)
2. But NOT to MeetingFlowDB (Dexie)
3. AppContext reads from localStorage first
4. On iOS, localStorage can be empty on cold start
5. Even if MeetingFlowSync has data, the fallback logic may not work correctly
6. Dexie has data from migration but is NEVER read by AppContext

---

## Why iOS is Worse Than Desktop

1. **localStorage Eviction**: iOS Safari aggressively evicts localStorage, especially:
   - After 7 days of no interaction
   - When device storage is low
   - On cold starts after the app was fully closed

2. **PWA Storage Behavior**: Even with `navigator.storage.persist()`:
   - Safari doesn't fully honor persist requests
   - Data can still be lost between sessions

3. **IndexedDB More Reliable**: IndexedDB (what Dexie and localforage use) is generally more persistent than localStorage on iOS

---

## Why Your Current Architecture Fails

### Problem 1: AppContext Doesn't Read from Dexie
```javascript
// AppContext.jsx loadData() - line 1037
meetings = JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]')
// ^ This is the ONLY primary source. Dexie is never consulted.
```

### Problem 2: Sync Doesn't Write to Dexie
```javascript
// AppContext.jsx performFullSync() - line 2117-2126
const syncStorage = await getSyncStorage()
await syncStorage.setItem('meetings', strippedMeetings)  // localforage
localStorage.setItem('meetingflow_meetings', meetingsJson)  // localStorage
// ^ Dexie is never written to during sync!
```

### Problem 3: Migration is One-Time Only
```javascript
// App.jsx - line 116-132
const needsMigration = await isMigrationNeeded()
if (needsMigration) {
  await migrateToDexie(...)
}
// ^ This only runs ONCE. After that, Dexie is never updated by sync.
```

### Problem 4: Home.jsx Reads from AppContext, Not Dexie
```javascript
// Home.jsx - line 119
const { meetings, ... } = useApp()
const displayMeetings = meetings // From AppContext, not Dexie
```

---

## Recommended Fix: Make Dexie the Single Source of Truth

### Option A: Quick Fix (Minimal Changes)
Make AppContext read from Dexie instead of localStorage:

1. **Change loadData()** to read from Dexie:
```javascript
const loadData = async () => {
  const dexieMeetings = await db.meetings.toArray()
  if (dexieMeetings.length > 0) {
    dispatch({ type: 'LOAD_DATA', payload: { meetings: dexieMeetings, ... } })
  } else {
    // Fall back to localStorage/localforage
  }
}
```

2. **Change performFullSync()** to write to Dexie:
```javascript
// After merging and saving to localStorage:
for (const meeting of strippedMeetings) {
  await saveMeeting(meeting, { queueSync: false })  // dexieService
}
```

### Option B: Full Fix (Recommended for Long-Term)
Migrate fully to Dexie architecture:

1. **Make Dexie the primary read source** for all meeting data
2. **Use useLiveQuery hooks** in Home.jsx instead of AppContext
3. **Write to Dexie on every save/sync**
4. **Remove localStorage dependency** for meetings
5. **Keep localStorage only for settings/preferences**

---

## Immediate Action Items

1. **In AppContext.jsx loadData()** (line 990):
   - Read from Dexie FIRST: `db.meetings.toArray()`
   - Only fall back to localStorage if Dexie is empty

2. **In AppContext.jsx performFullSync()** (line 2117):
   - After saving to localStorage/localforage, also save to Dexie:
   - `await bulkSaveMeetings(strippedMeetings, { queueSync: false })`

3. **Verify migration runs** on first iOS load:
   - Check that `migrateToDexie()` successfully copies data
   - Add logging to confirm Dexie has data

4. **Add startup Dexie check**:
   - On app load, log `db.meetings.count()` to verify data exists

---

## Testing Checklist

- [ ] On iOS Safari, cold start shows all meetings
- [ ] After sync, meetings persist through refresh
- [ ] Dexie database contains all meetings (check via debug console)
- [ ] localStorage failure doesn't break the app
- [ ] Analyzer Dashboard shows correct meeting counts

---

## Debugging Commands

Add to browser console:

```javascript
// Check Dexie data
window.getDexieStats()  // Shows meeting counts in Dexie

// Check localStorage data
JSON.parse(localStorage.getItem('meetingflow_meetings') || '[]').length

// Check localforage data
localforage.createInstance({name:'MeetingFlowSync',storeName:'sync_data'})
  .getItem('meetings').then(m => console.log('localforage:', m?.length))

// Force Dexie read
import('./db/meetingFlowDB.js').then(async m => {
  console.log('Dexie meetings:', await m.default.meetings.count())
})
```

---

## Summary

| What | Current State | Should Be |
|------|---------------|-----------|
| Primary Read Source | localStorage | Dexie |
| Sync Writes To | localStorage + localforage | Dexie + localStorage (backup) |
| iOS Cold Start Data | 0 (localStorage empty) | 34 (from Dexie) |
| Data Consistency | 3 DBs out of sync | 1 primary (Dexie) with backup |
