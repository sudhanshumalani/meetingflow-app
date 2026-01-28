# Phase 2: Full Dexie Migration Implementation Plan

## Overview

Phase 1 (completed) implemented a Dexie-first loading strategy where AppContext reads from Dexie first, then falls back to localforage/localStorage. This fixes the iOS cold start issue.

Phase 2 migrates the app to use **Dexie's reactive `useLiveQuery()` hooks** directly in components, eliminating the need for AppContext to manage meeting data state and ensuring real-time reactivity.

---

## Goals

1. **Eliminate double-state**: Components read directly from Dexie, not via AppContext
2. **Real-time reactivity**: Changes to Dexie automatically re-render components
3. **Simpler architecture**: Remove localStorage/localforage for meeting data
4. **Better performance**: No need to reload entire state on changes

---

## Implementation Steps

### Step 1: Create Dexie Query Hooks for Home.jsx

**File to create**: `src/hooks/useMeetings.js`

```javascript
import { useLiveQuery } from 'dexie-react-hooks'
import db from '../db/meetingFlowDB'

// Hook to get all meetings (sorted by date, newest first)
export function useMeetings() {
  return useLiveQuery(
    () => db.meetings
      .orderBy('date')
      .reverse()
      .filter(m => !m.deleted)
      .toArray(),
    [], // deps
    [] // default value
  )
}

// Hook to get a single meeting by ID
export function useMeeting(meetingId) {
  return useLiveQuery(
    () => meetingId ? db.meetings.get(meetingId) : null,
    [meetingId],
    null
  )
}

// Hook to get meetings with full blob data (for editing)
export function useFullMeeting(meetingId) {
  return useLiveQuery(async () => {
    if (!meetingId) return null
    const meeting = await db.meetings.get(meetingId)
    if (!meeting) return null

    const blob = await db.meetingBlobs.get(meetingId)
    return { ...meeting, ...(blob || {}) }
  }, [meetingId], null)
}

// Hook to get meetings count
export function useMeetingsCount() {
  return useLiveQuery(
    () => db.meetings.where('deleted').notEqual(true).count(),
    [],
    0
  )
}

// Hook to get stakeholders
export function useStakeholders() {
  return useLiveQuery(
    () => db.stakeholders.toArray(),
    [],
    []
  )
}

// Hook to get stakeholder categories
export function useStakeholderCategories() {
  return useLiveQuery(
    () => db.stakeholderCategories.toArray(),
    [],
    []
  )
}
```

### Step 2: Update Home.jsx to Use Dexie Hooks

**File**: `src/views/Home.jsx`

Replace:
```javascript
const { meetings, ... } = useApp()
const displayMeetings = meetings
```

With:
```javascript
import { useMeetings, useStakeholders, useStakeholderCategories } from '../hooks/useMeetings'

// Inside component:
const meetings = useMeetings()
const stakeholders = useStakeholders()
const stakeholderCategories = useStakeholderCategories()

// Handle loading state
if (meetings === undefined) {
  return <LoadingSpinner />
}
```

### Step 3: Update MeetingDetail.jsx to Use Dexie Hooks

**File**: `src/views/MeetingDetail.jsx`

Replace:
```javascript
const { meetings, updateMeeting, ... } = useApp()
const meeting = meetings.find(m => m.id === meetingId)
```

With:
```javascript
import { useFullMeeting } from '../hooks/useMeetings'
import { saveMeeting } from '../db/dexieService'

// Inside component:
const meeting = useFullMeeting(meetingId)

// For updates, use dexieService directly:
const handleSave = async (changes) => {
  await saveMeeting({ ...meeting, ...changes })
  // No need to call updateMeeting - useLiveQuery auto-updates!
}
```

### Step 4: Update NewMeeting.jsx to Use Dexie

**File**: `src/views/NewMeeting.jsx`

Replace:
```javascript
const { addMeeting, ... } = useApp()

const handleSubmit = async (meetingData) => {
  await addMeeting(meetingData)
}
```

With:
```javascript
import { saveMeeting } from '../db/dexieService'

const handleSubmit = async (meetingData) => {
  const id = uuidv4()
  await saveMeeting({ ...meetingData, id, createdAt: new Date().toISOString() })
  navigate('/')
}
```

### Step 5: Update Delete Operations

**Files**: `Home.jsx`, `MeetingDetail.jsx`

Replace:
```javascript
const { deleteMeeting, ... } = useApp()
await deleteMeeting(meetingId)
```

With:
```javascript
import { deleteMeeting } from '../db/dexieService'

await deleteMeeting(meetingId)
// useLiveQuery auto-updates the UI!
```

### Step 6: Simplify AppContext

**File**: `src/contexts/AppContext.jsx`

After components use Dexie hooks directly, remove from AppContext:
- `meetings` from state
- `stakeholders` from state
- `stakeholderCategories` from state
- `LOAD_DATA` action for meetings/stakeholders
- `addMeeting`, `updateMeeting`, `deleteMeeting` functions
- `loadData()` logic for meetings (keep for settings only)

Keep in AppContext:
- User authentication state
- Sync functions (performFullSync, etc.)
- Settings/preferences
- Toast notifications
- Loading/error states

### Step 7: Update Sync to Write to Dexie Only

**File**: `src/contexts/AppContext.jsx` - `performFullSync()`

Current (Phase 1):
```javascript
// Writes to Dexie, localforage, and localStorage
await bulkSaveMeetings(...)
await syncStorage.setItem('meetings', ...)
localStorage.setItem('meetingflow_meetings', ...)
```

Phase 2:
```javascript
// Write to Dexie only (primary source of truth)
await bulkSaveMeetings(...)
// Remove localforage and localStorage writes for meetings
```

### Step 8: Remove localStorage for Meeting Data

After all components use Dexie:

1. Remove `localStorage.setItem('meetingflow_meetings', ...)`
2. Remove `localStorage.setItem('meetingflow_stakeholders', ...)`
3. Remove `localStorage.setItem('meetingflow_stakeholder_categories', ...)`
4. Keep localStorage only for:
   - `meetingflow_deleted_items` (tombstones)
   - User settings/preferences
   - Auth tokens

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useMeetings.js` | **CREATE** | New Dexie query hooks |
| `src/views/Home.jsx` | MODIFY | Use useMeetings() instead of useApp() |
| `src/views/MeetingDetail.jsx` | MODIFY | Use useFullMeeting() and saveMeeting() |
| `src/views/NewMeeting.jsx` | MODIFY | Use saveMeeting() directly |
| `src/contexts/AppContext.jsx` | MODIFY | Remove meeting state, simplify |
| `src/components/MeetingCard.jsx` | MINOR | May need prop updates |
| `src/components/analyzer/*.jsx` | NO CHANGE | Already uses Dexie hooks |

---

## Migration Strategy

### Approach: Incremental Migration

1. **Add hooks first**: Create `useMeetings.js` without breaking existing code
2. **Migrate one view at a time**: Start with Home.jsx, then MeetingDetail, then NewMeeting
3. **Keep AppContext fallback**: During migration, AppContext still works
4. **Remove AppContext meeting state last**: Only after all views migrated

### Testing Checklist

After each step:
- [ ] App loads without errors
- [ ] Meetings display correctly
- [ ] New meeting creation works
- [ ] Meeting edit/update works
- [ ] Meeting delete works
- [ ] Sync from cloud works
- [ ] iOS Safari cold start shows meetings
- [ ] App refresh preserves meetings
- [ ] Analyzer Dashboard still works

---

## Estimated Scope

| Step | Files Changed | Risk Level |
|------|--------------|------------|
| Step 1 | 1 new file | Low |
| Step 2 | 1 file | Medium |
| Step 3 | 1 file | Medium |
| Step 4 | 1 file | Low |
| Step 5 | 2 files | Low |
| Step 6 | 1 file | High |
| Step 7 | 1 file | Medium |
| Step 8 | 1 file | Low |

**Total**: ~6-8 files modified, 1 new file created

---

## Rollback Plan

If issues occur:
1. Phase 1 code still works (Dexie-first loading)
2. localStorage/localforage still contain data
3. Can revert to AppContext-based loading by reverting commits

---

## Dependencies

- `dexie-react-hooks` (already installed)
- `dexie` (already installed)
- Existing `src/db/dexieService.js` functions

---

## Notes

- Analyzer Dashboard already uses Dexie hooks (useDexieQueries.js) - this is the pattern to follow
- The existing `useDexieQueries.js` file can be merged with the new `useMeetings.js` or kept separate
- Consider adding error boundaries around components using useLiveQuery
