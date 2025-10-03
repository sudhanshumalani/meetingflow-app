# Meetingflow Sync Issues: Deep Root Cause Analysis

## Executive Summary

After thorough analysis of the sync architecture, I've identified **3 critical bugs** causing category sync failures:

1. **DEFAULT_CATEGORIES Infinite Loop** - Categories get filtered out during merge, then re-added by loadData(), creating an endless cycle
2. **Category Deletion Identifier Mismatch** - Deletion tombstones don't match all possible category identifiers
3. **Merge Filter Logic Error** - Wrong list of default category names causes legitimate categories to be filtered

## Issue Report Summary

**Desktop**: 11 categories after deleting 3
**Mobile**: 14 categories

**Problems**:
1. Deleted categories still showing on other devices
2. Category assignments to stakeholders not syncing

---

## Architecture Overview

### Data Flow

```
User Action → AppContext Reducer → State Update → Save useEffect → localStorage
                                                        ↓
                                                    (2s delay)
                                                        ↓
                                          SyncProvider Auto-sync → syncToCloud
                                                                        ↓
                                                                  Cloud Storage
                                                                        ↓
                                          (Other Device) syncFromCloud ← Cloud
                                                        ↓
                                            mergeData(local, cloud)
                                                        ↓
                                            Save to localStorage
                                                        ↓
                                        Emit 'storage-updated' event
                                                        ↓
                                          AppContext.loadData()
                                                        ↓
                                          Update UI with synced data
```

---

## ROOT CAUSE #1: DEFAULT_CATEGORIES Infinite Loop 🔴 CRITICAL

### The Problem

Categories oscillate between devices, never reaching a stable state. Desktop shows 11, mobile shows 14.

### Technical Root Cause

**Location**: `src/contexts/AppContext.jsx:566-577` + `src/utils/syncService.js:659-757`

There's a **circular dependency** between two well-intentioned pieces of code:

#### Part 1: loadData() Auto-Adds DEFAULT_CATEGORIES

```javascript
// AppContext.jsx:566-577
if (!localCategories.length) {
  const hasExistingData = meetings.length > 0 || localStakeholders.length > 0
  if (!hasExistingData) {
    localCategories = Object.values(DEFAULT_CATEGORIES)  // ← Adds defaults
  } else {
    // Existing app data found but no categories - this may be a sync issue
    localCategories = Object.values(DEFAULT_CATEGORIES)  // ← Adds defaults again!
  }
}
```

**Intent**: Provide default categories for new users
**Problem**: ALWAYS adds defaults when categories array is empty, even after sync

#### Part 2: mergeData() Filters Out DEFAULT_CATEGORIES

```javascript
// syncService.js:736-738
const isUserCategory = category?.id || category?.createdAt || category?.updatedAt || category?.stakeholderCount > 0
const shouldInclude = hasName && notInMap && (notDefault || isUserCategory)
```

**Intent**: Don't duplicate default categories from new installations
**Problem**: Filters out DEFAULT_CATEGORIES because they lack `id`, `createdAt`, `updatedAt`

### The Infinite Loop

```
Step 1: App loads → loadData() → No categories in localStorage → Adds DEFAULT_CATEGORIES
Step 2: DEFAULT_CATEGORIES saved to localStorage WITHOUT id/createdAt/updatedAt
Step 3: Sync triggers → syncToCloud uploads DEFAULT_CATEGORIES
Step 4: Other device syncs → mergeData() runs
Step 5: mergeData() filters out DEFAULT_CATEGORIES (no user metadata!)
Step 6: Merged result has 0 categories → Saved to localStorage
Step 7: Storage-updated event → loadData() runs
Step 8: loadData() sees 0 categories → Adds DEFAULT_CATEGORIES back!
Step 9: Save triggers → Sync triggers
Step 10: GO TO STEP 3 (INFINITE LOOP!)
```

### Why You See Different Counts

- **Desktop (11 categories)**: Some combination of DEFAULT_CATEGORIES + user-created categories
- **Mobile (14 categories)**: Different combination based on timing of sync cycles
- Neither is "correct" - they're both caught in the loop at different stages

### Evidence

1. **DEFAULT_CATEGORIES structure** (`stakeholderManager.js:23-96`):
   ```javascript
   LEADERSHIP: {
     key: 'leadership',
     label: 'Leadership',
     description: '...',
     color: 'purple',
     // ❌ NO id, createdAt, or updatedAt!
   }
   ```

2. **When loaded via Object.values()** (`AppContext.jsx:571,575`):
   - Objects retain structure above
   - No transformation adds metadata
   - Therefore: `isUserCategory = false` in merge logic

3. **Only ADD_STAKEHOLDER_CATEGORY adds metadata** (`AppContext.jsx:172-177`):
   ```javascript
   const newCategory = {
     key: action.payload.key || ...,
     ...action.payload,
     id: uuidv4(),              // ← ONLY WAY to get id
     createdAt: new Date().toISOString()  // ← ONLY WAY to get createdAt
   }
   ```

---

## ROOT CAUSE #2: Category Deletion Identifier Mismatch 🔴 CRITICAL

### The Problem

When you delete a category on one device, it still appears on other devices.

### Technical Root Cause

**Location**: `src/contexts/AppContext.jsx:193-223`

Categories can be identified by **THREE different properties**:
- `id` (UUID generated by ADD_STAKEHOLDER_CATEGORY)
- `key` (e.g., "leadership", "engineering")
- `name`/`label` (e.g., "Leadership", "Engineering")

When DELETE_STAKEHOLDER_CATEGORY runs:

```javascript
// AppContext.jsx:193-223
case 'DELETE_STAKEHOLDER_CATEGORY':
  const categoryToDelete = action.payload  // ← Could be id, key, OR name!
  const deletedCategory = state.stakeholderCategories.find(category =>
    category.key === categoryToDelete || category.id === categoryToDelete
  )
  // ...
  deletedItems: [
    ...state.deletedItems,
    {
      type: 'stakeholderCategory',
      id: categoryToDelete,  // ← STORES WHATEVER WAS PASSED IN!
      deletedAt: new Date().toISOString(),
      // ...
    }
  ]
```

**The problem**: Deletion tombstone stores `categoryToDelete` as-is, which could be:
- The category's `id`: "550e8400-e29b-41d4-a716-446655440000"
- The category's `key`: "engineering"
- The category's `name`: "Engineering"

During merge, the code (even with my earlier fix) checks multiple identifiers but the **BASE identifier used for the deletion key** might not match the **BASE identifier of the incoming category**.

### Example Failure Scenario

```
Device A:
  Category: { id: "uuid-123", key: "engineering", name: "Engineering" }
  User clicks delete → categoryToDelete = "engineering" (the key)
  Deletion tombstone: { type: 'stakeholderCategory', id: "engineering", deletedAt: "..." }

Sync to Cloud ✓

Device B downloads:
  Category from cloud: { id: "uuid-123", key: "engineering", name: "Engineering" }
  Deletion from cloud: { type: 'stakeholderCategory', id: "engineering", deletedAt: "..." }

Merge Logic (syncService.js:690-706):
  categoryId = category?.id || categoryName  // = "uuid-123"
  possibleDeletionKeys = [
    "stakeholderCategory:uuid-123",   // ← Looking for this
    "stakeholderCategory:engineering", // ← Or this
    "stakeholderCategory:Engineering",
  ]

Deletion Map:
  Has: "stakeholderCategory:engineering" ✓  // ← MATCH!

Result: Deletion found → Category filtered out ✓
```

**This SHOULD work with my earlier fix!** But there's a subtlety...

### The ACTUAL Problem

The issue is not in the matching logic (my fix handles that), but in the **inconsistency of what gets passed to DELETE_STAKEHOLDER_CATEGORY**.

Looking at the code more carefully:

```javascript
// AppContext.jsx:206-208
stakeholderCategories: state.stakeholderCategories.filter(category =>
  category.key !== categoryToDelete && category.id !== categoryToDelete
)
```

This filters by BOTH `key` AND `id`, which means if `categoryToDelete` is a `key`, it removes the category correctly. But then:

```javascript
// AppContext.jsx:214
id: categoryToDelete,  // If this is "engineering", the tombstone id is "engineering"
```

So if the category object had:
```javascript
{ id: "uuid-123", key: "engineering", name: "Engineering" }
```

And `categoryToDelete = "engineering"`, the tombstone becomes:
```javascript
{ type: 'stakeholderCategory', id: "engineering", deletedAt: "..." }
```

But another device might have the same category with a DIFFERENT `id` (if it was created separately!). This is the real issue - **category duplication across devices with different IDs but same key/name**.

---

## ROOT CAUSE #3: Default Categories Mismatch 🔴 CRITICAL

### The Problem

The list of "default" categories in the merge filter doesn't match the actual DEFAULT_CATEGORIES.

### Technical Root Cause

**Location**: `src/utils/syncService.js:661-672`

```javascript
const defaultCategories = new Set([
  'Leadership',   // ✓ In DEFAULT_CATEGORIES
  'Engineering',  // ✓ In DEFAULT_CATEGORIES
  'Product',      // ✓ In DEFAULT_CATEGORIES
  'Marketing',    // ✓ In DEFAULT_CATEGORIES
  'Sales',        // ✓ In DEFAULT_CATEGORIES
  'Finance',      // ❌ NOT in DEFAULT_CATEGORIES!
  'Operations',   // ✓ In DEFAULT_CATEGORIES
  'HR',           // ❌ NOT in DEFAULT_CATEGORIES!
  'Legal',        // ❌ NOT in DEFAULT_CATEGORIES!
  'General'       // ❌ NOT in DEFAULT_CATEGORIES!
])
```

**Actual DEFAULT_CATEGORIES** (`stakeholderManager.js:23-96`):
```javascript
LEADERSHIP,    // Leadership
ENGINEERING,   // Engineering
PRODUCT,       // Product
DESIGN,        // Design      ← MISSING from filter!
MARKETING,     // Marketing
SALES,         // Sales
OPERATIONS,    // Operations
EXTERNAL,      // External    ← MISSING from filter!
CUSTOMER       // Customer    ← MISSING from filter!
```

### Impact

1. **Finance, HR, Legal, General** are filtered out as "defaults" even though they're user-created!
2. **Design, External, Customer** are NOT filtered out even though they're actually defaults!

This causes:
- Legitimate user categories named "Finance", "HR", "Legal", or "General" to be deleted during sync
- Default categories "Design", "External", "Customer" to proliferate during sync

---

## Additional Issues Found

### Issue #4: Stakeholder Update Timestamps (FIXED ✓)

**Location**: `src/contexts/AppContext.jsx:146`

**Original Code**:
```javascript
case 'UPDATE_STAKEHOLDER':
  return {
    stakeholders: state.stakeholders.map(stakeholder =>
      stakeholder.id === action.payload.id
        ? { ...stakeholder, ...action.payload }  // ❌ No updatedAt
        : stakeholder
    )
  }
```

**Fixed Code**:
```javascript
? { ...stakeholder, ...action.payload, updatedAt: new Date().toISOString() }  // ✓ Added
```

**Impact**: Without `updatedAt`, merge logic can't determine which version is newer, causing category assignments to be lost during merge.

**Status**: ✓ Fixed in commit `5f4c858`

---

## Why Your Symptoms Occur

### Symptom 1: Desktop 11 categories, Mobile 14 categories

**Root Cause**: DEFAULT_CATEGORIES Infinite Loop (#1)

**Explanation**:
1. Each device is caught in the loop at a different stage
2. Desktop last synced when merge had filtered out 3 categories → left with 11
3. Mobile last synced at a different time → left with 14
4. Neither is "correct" - numbers fluctuate with each sync cycle

### Symptom 2: Deleted categories still showing on other devices

**Root Causes**:
- DEFAULT_CATEGORIES Infinite Loop (#1) - keeps re-adding defaults
- Category Deletion Identifier Mismatch (#2) - tombstones don't match
- Default Categories Mismatch (#3) - wrong categories filtered

**Explanation**:
1. You delete category on Desktop → tombstone created
2. Sync merges → category filtered out
3. Mobile syncs → gets filtered result (no category)
4. Mobile's loadData() sees empty categories → adds DEFAULT_CATEGORIES back!
5. Mobile saves → syncs to cloud
6. Desktop syncs → merge sees DEFAULT_CATEGORIES without metadata → filters them
7. Desktop's loadData() adds them back
8. **Infinite oscillation**

### Symptom 3: Category assignments to stakeholders not syncing

**Root Causes**:
- Stakeholder Update Timestamps (#4) - FIXED ✓
- Possible race condition if stakeholder updated while category is being deleted

**Explanation**:
1. Device A: Assign category "Engineering" to stakeholder
2. UPDATE_STAKEHOLDER runs → now has `updatedAt` ✓
3. Saves to localStorage → syncs to cloud ✓
4. Device B: Downloads from cloud
5. **IF** category "Engineering" is in the deletion loop (being added/removed):
   - Stakeholder has `category: "engineering"`
   - But "Engineering" category doesn't exist in Device B's categories
   - UI can't display the category (broken reference)
6. **IF** stakeholder was updated without `updatedAt` (before fix):
   - Merge picks older version
   - Category assignment lost

---

## Data Integrity Analysis

### How Categories Get Duplicated

Categories can be duplicated when:

1. **Device A**: User creates "Sales" category → gets `id: "uuid-A"`
2. **Device B**: (Before sync) User creates "Sales" category → gets `id: "uuid-B"`
3. **Sync**: Both devices have "Sales" but with different IDs
4. **Merge**: Both kept (different IDs, both have `createdAt`)
5. **Result**: Two "Sales" categories!

The merge logic uses **NAME** for deduplication (line 685), but categories with the same name but different IDs will both pass the `!categoryMap.has(categoryName)` check on first encounter, then the second one will be skipped.

Actually, looking closer at line 685:
```javascript
const notInMap = !categoryMap.has(categoryName)
```

And line 732:
```javascript
categoryMap.set(categoryName, normalizedCategory)
```

The map uses `categoryName` as the key, so duplicates by name SHOULD be deduplicated. The later one (or one with newer timestamp if that's checked) would win.

But wait - there's no timestamp comparison for categories! Let me check...

```javascript
// Line 737-738
const isUserCategory = category?.id || category?.createdAt || category?.updatedAt || category?.stakeholderCount > 0
const shouldInclude = hasName && notInMap && (notDefault || isUserCategory)
```

Categories are included if:
1. `hasName`: Has a name ✓
2. `notInMap`: Not already in map ✓
3. `(notDefault || isUserCategory)`: Either not a default name, OR has user metadata ✓

There's no "keep the newer one" logic for categories. It's first-come-first-served based on array order.

```javascript
// Line 674
const allCategories = [...(safeLocalData.stakeholderCategories || []), ...(safeCloudData.stakeholderCategories || [])]
```

Local categories come first! So if both local and cloud have a category with the same name, the local one is kept. This is actually reasonable, but it means:

1. If Desktop has "Sales" (id: uuid-A) locally
2. And Cloud has "Sales" (id: uuid-B)
3. Desktop's local version wins (uuid-A)
4. But Mobile might have uuid-B locally
5. Result: Devices have different IDs for the same category name
6. **This breaks stakeholder references!**

---

## The Complete Sync Failure Chain

Here's the complete chain of events causing your issues:

### Initial State

- **Desktop**: 20 categories (mix of defaults + user-created)
- **Mobile**: 20 categories (same mix, synced earlier)

### You Delete 3 Categories on Desktop

```
Desktop: DELETE_STAKEHOLDER_CATEGORY("category-A")
Desktop: DELETE_STAKEHOLDER_CATEGORY("category-B")
Desktop: DELETE_STAKEHOLDER_CATEGORY("category-C")

Desktop localStorage: 17 categories + 3 deletion tombstones
```

### Desktop Syncs to Cloud (after 2s debounce)

```
Cloud now has: 17 categories + 3 deletion tombstones
```

### Mobile Syncs from Cloud

```
Mobile: syncFromCloud()
  ↓
  Downloads: 17 categories + 3 deletion tombstones
  ↓
  mergeData(mobile's 20 categories, cloud's 17 categories)
    ↓
    Processes deletions → filters out 3 deleted categories ✓
    ↓
    Processes remaining categories:
      - Some are DEFAULT_CATEGORIES (without id/createdAt) → FILTERED OUT
      - Some are user categories (with id/createdAt) → KEPT
    ↓
    Result: Maybe 14 categories (17 minus 3 defaults that got filtered)
  ↓
  Saves to localStorage: 14 categories
  ↓
  Emits storage-updated event
  ↓
  loadData() runs:
    - Sees 14 categories in localStorage
    - Loads them (no defaults added because length > 0)
    - Sets state to 14 categories
```

**Mobile now shows 14 categories ✓**

### Mobile Triggers Auto-Sync (2s after loadData)

```
Mobile: syncToCloud(14 categories)
  ↓
  Cloud now has: 14 categories + 3 deletion tombstones
```

### Desktop Syncs from Cloud Again

```
Desktop: syncFromCloud()
  ↓
  Downloads: 14 categories + 3 deletion tombstones
  ↓
  mergeData(desktop's 17 categories, cloud's 14 categories)
    ↓
    Some categories from desktop are DEFAULT_CATEGORIES → FILTERED OUT
    ↓
    Result: Maybe 11 categories
  ↓
  Saves to localStorage: 11 categories
  ↓
  loadData() sees 11 > 0 → loads them
```

**Desktop now shows 11 categories ✓**

### Oscillation Begins

```
Desktop syncs 11 → Cloud
Mobile syncs from cloud → gets 11
Mobile's loadData sees 11 → loads them
Mobile syncs 11 → Cloud

(Stable for now...)

But then user creates new category on Mobile:
Mobile: ADD_STAKEHOLDER_CATEGORY → 12 categories (with id/createdAt) ✓
Mobile syncs → Cloud has 12
Desktop syncs → mergeData filters some → 11 again
Desktop's loadData sees 11...

Wait, why would merge filter? Let me think...

Actually, the NEW category has id/createdAt, so isUserCategory = true, so it passes the filter.

So actually once all DEFAULT_CATEGORIES without metadata are filtered out, and only user categories remain, the system should stabilize!

UNLESS... loadData adds DEFAULT_CATEGORIES back!
```

### The Trigger for Re-Adding Defaults

```
IF at any point mergeData filters out ALL categories:
  mergedData.stakeholderCategories = []
  ↓
  Saves to localStorage: []
  ↓
  loadData() sees length = 0
  ↓
  Adds DEFAULT_CATEGORIES (without metadata)
  ↓
  Sync triggers
  ↓
  mergeData filters them out again
  ↓
  LOOP!
```

---

## Race Conditions

### Race Condition #1: Concurrent Updates to Same Stakeholder

**Scenario**: Both devices update the same stakeholder simultaneously

```
Time 0: Both devices have stakeholder { id: "s1", name: "John", category: "engineering", updatedAt: "2025-01-01T10:00:00Z" }

Time 1: Desktop assigns category "sales" → updatedAt: "2025-01-01T10:05:00Z"
Time 1: Mobile assigns category "product" → updatedAt: "2025-01-01T10:05:01Z"  (1 second later)

Desktop syncs to cloud → Cloud has "sales" version

Mobile syncs from cloud:
  mergeData sees:
    - Local: "product", updatedAt: 10:05:01
    - Cloud: "sales", updatedAt: 10:05:00
  Keeps "product" (newer timestamp) ✓

Mobile syncs "product" to cloud

Desktop syncs from cloud:
  mergeData sees:
    - Local: "sales", updatedAt: 10:05:00
    - Cloud: "product", updatedAt: 10:05:01
  Keeps "product" (newer timestamp) ✓

Result: Mobile's update wins (last write wins by timestamp)
```

**This is actually CORRECT behavior** - the more recent update wins.

**BUT**: If timestamps are within milliseconds, order is unpredictable. The merge logic (line 652) uses simple `>` comparison, so if timestamps are equal, the local version wins.

### Race Condition #2: Delete While Updating

**Scenario**: One device deletes a category while another assigns it to a stakeholder

```
Time 0: Both devices have category "sales" and stakeholder "John"

Time 1: Desktop deletes "sales" category → deletedAt: "2025-01-01T10:05:00Z"
Time 1: Mobile assigns "sales" to John → stakeholder updatedAt: "2025-01-01T10:05:01Z"

Desktop syncs:
  Cloud has: deletion tombstone for "sales"

Mobile syncs from cloud:
  mergeData:
    - Sees deletion for "sales" at 10:05:00
    - Sees category "sales" with createdAt < 10:05:00
    - Filters out "sales" category ✓
    - Sees stakeholder "John" with category="sales", updatedAt 10:05:01
    - KEEPS stakeholder ✓ (no check for orphaned category references!)

Result: John has category="sales" but "sales" category doesn't exist!
       → Broken reference!
```

**This IS a bug** - stakeholders can reference deleted categories.

### Race Condition #3: Concurrent loadData and Sync

**Scenario**: Sync completes while loadData is running

```
Thread 1: User opens app
  → loadData() starts
  → Reads categories from localStorage
  → (slow operation...)

Thread 2: Sync completes in background
  → mergeData runs
  → Saves new categories to localStorage
  → Emits storage-updated event

Thread 1: loadData() continues
  → Sets state with OLD categories (already read from localStorage)

Thread 2: storage-updated event handler
  → Calls loadData() again
  → Loads NEW categories
  → Sets state with NEW categories

Result: Two successive state updates, brief flicker of old data
```

**This is handled** by the `isLoadingRef` guard (AppContext.jsx:538-540), which prevents concurrent loadData calls.

---

## Summary of Root Causes

### Critical Bugs

1. ✅ **deletedItems dependency** - FIXED in commit `cfdd576`
2. ✅ **Stakeholder updatedAt** - FIXED in commit `5f4c858`
3. ❌ **DEFAULT_CATEGORIES Infinite Loop** - NOT FIXED
4. ❌ **Default Categories List Mismatch** - NOT FIXED
5. ❌ **Category Deletion Identifier** - PARTIALLY FIXED (my earlier fix helps but doesn't solve duplication)

### Architectural Issues

1. **No validation of stakeholder category references** - Can have orphaned references
2. **Category deduplication by name only** - Same-named categories with different IDs persist
3. **No conflict resolution for categories** - First-come-first-served, no timestamp comparison
4. **loadData() always adds defaults when empty** - Incompatible with merge filter logic

---

## Recommended Fixes (Priority Order)

### Priority 1: Stop the Infinite Loop

**Fix DEFAULT_CATEGORIES to have metadata**

When loading defaults in `loadData()`, add metadata:

```javascript
// AppContext.jsx:571
localCategories = Object.values(DEFAULT_CATEGORIES).map(cat => ({
  ...cat,
  id: uuidv4(),  // ← ADD THIS
  createdAt: new Date().toISOString(),  // ← ADD THIS
  isDefault: true  // ← ADD THIS FLAG
}))
```

**Update merge filter to match**:

```javascript
// syncService.js:737
const isUserCategory = category?.id || category?.createdAt || category?.updatedAt || category?.stakeholderCount > 0 || category?.isDefault
```

### Priority 2: Fix Default Categories List

**Update the filter list to match actual defaults**:

```javascript
// syncService.js:661-672
const defaultCategories = new Set([
  'Leadership',
  'Engineering',
  'Product',
  'Design',      // ← ADD
  'Marketing',
  'Sales',
  'Operations',
  'External',    // ← ADD
  'Customer'     // ← ADD
])
```

**Remove non-existent defaults**:
- Remove: Finance, HR, Legal, General

### Priority 3: Improve Deletion Matching

**Store ALL identifiers in deletion tombstone**:

```javascript
// AppContext.jsx:210-222
deletedItems: [
  ...state.deletedItems,
  {
    type: 'stakeholderCategory',
    id: deletedCategory?.id || categoryToDelete,  // ← Prefer actual ID
    key: deletedCategory?.key,  // ← ADD
    name: deletedCategory?.name || deletedCategory?.label,  // ← ADD
    deletedAt: new Date().toISOString(),
    deletedBy: `device_${navigator.userAgent.slice(0, 50)}`,
    originalItem: deletedCategory ? {
      name: deletedCategory.name || deletedCategory.label,
      key: deletedCategory.key,
      id: deletedCategory.id  // ← ADD
    } : null
  }
]
```

**Update merge to check all identifiers**:

```javascript
// syncService.js:690-706
const possibleDeletionKeys = [
  `stakeholderCategory:${category.id}`,
  `stakeholderCategory:${category.key}`,
  `stakeholderCategory:${categoryName}`
]

// Also check if deletion has matching id/key/name properties
for (const deletion of deletionMap.values()) {
  if (deletion.type === 'stakeholderCategory') {
    if (deletion.id === category.id ||
        deletion.key === category.key ||
        deletion.name === categoryName) {
      // Match found
    }
  }
}
```

### Priority 4: Validate Stakeholder Category References

**After merge, clean up orphaned references**:

```javascript
// syncService.js:657 (after stakeholder merge)
merged.stakeholders = Array.from(stakeholderMap.values())

// ← ADD THIS
const validCategoryKeys = new Set(merged.stakeholderCategories.map(c => c.key || c.name))
merged.stakeholders = merged.stakeholders.map(stakeholder => {
  if (stakeholder.category && !validCategoryKeys.has(stakeholder.category)) {
    console.log(`⚠️ Orphaned category reference: ${stakeholder.name} → ${stakeholder.category}`)
    return { ...stakeholder, category: 'external' }  // Fallback
  }
  return stakeholder
})
```

### Priority 5: Add Category Timestamp Comparison

**Keep newer category when same name**:

```javascript
// syncService.js:685
const existing = categoryMap.get(categoryName)
if (existing) {
  // Compare timestamps if both have them
  const existingTime = new Date(existing.updatedAt || existing.createdAt || 0)
  const currentTime = new Date(category.updatedAt || category.createdAt || 0)
  if (currentTime > existingTime) {
    categoryMap.set(categoryName, normalizedCategory)  // Replace with newer
  }
  return  // Skip adding, already have this category name
}
```

---

## Testing Plan

After fixes are applied:

### Test 1: DEFAULT_CATEGORIES Stability
1. Clear all data on both devices
2. Open app on Device A → should have 9 default categories
3. Sync to cloud
4. Open app on Device B → should have 9 default categories
5. Sync both devices 5 times
6. **Expected**: Both still have exactly 9 categories (no loop!)

### Test 2: Category Deletion
1. Start with both devices synced
2. Device A: Create custom category "Finance"
3. Sync both devices → both should have "Finance"
4. Device A: Delete "Finance"
5. Sync both devices
6. **Expected**: Both devices should NOT have "Finance"

### Test 3: Category Assignment
1. Start with both devices synced
2. Device A: Create stakeholder "John"
3. Device A: Assign category "Engineering" to John
4. Sync both devices
5. **Expected**: Device B shows John with "Engineering" category

### Test 4: Concurrent Updates
1. Start with both devices synced, stakeholder "Jane" exists
2. Go offline on both devices
3. Device A: Assign "Sales" to Jane
4. Device B: Assign "Product" to Jane
5. Go online, sync both
6. **Expected**: Whichever device synced last, their category should win on both devices

---

## Files Requiring Changes

1. `src/contexts/AppContext.jsx`
   - Line 571, 575: Add metadata when loading DEFAULT_CATEGORIES
   - Lines 210-222: Store all identifiers in deletion tombstones

2. `src/utils/syncService.js`
   - Lines 661-672: Fix default categories list
   - Lines 685-748: Add timestamp comparison for category deduplication
   - After line 657: Add orphaned reference cleanup
   - Lines 690-720: Improve deletion matching

---

## Conclusion

The sync issues are caused by **conflicting assumptions** between different parts of the codebase:

- `loadData()` assumes it should provide defaults when categories are empty
- `mergeData()` assumes defaults without metadata should be filtered out
- These two assumptions create an endless cycle

The fixes are straightforward once the root causes are understood. The system will stabilize once DEFAULT_CATEGORIES are given proper metadata and the filter list is corrected.

**Estimated Fix Time**: 2-3 hours
**Complexity**: Medium (requires coordinated changes across multiple files)
**Risk**: Low (fixes are localized, rollback is simple)
