/**
 * Meeting Export Script
 *
 * Run this in the browser console while on the MeetingFlow app to export
 * all your meetings, stakeholders, and categories as a JSON file.
 *
 * Usage:
 * 1. Open MeetingFlow app in browser
 * 2. Open DevTools (F12)
 * 3. Go to Console tab
 * 4. Copy and paste this entire script
 * 5. Press Enter to run
 * 6. A JSON file will be downloaded
 */

(async function exportAllData() {
  console.log('📦 Starting data export...');

  const dbRequest = indexedDB.open('MeetingFlowDB');

  dbRequest.onerror = () => {
    console.error('❌ Failed to open database');
  };

  dbRequest.onsuccess = async (event) => {
    const db = event.target.result;
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '2.0',
      meetings: [],
      meetingBlobs: [],
      stakeholders: [],
      categories: []
    };

    // Helper to get all from a store
    const getAllFromStore = (storeName) => {
      return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(storeName)) {
          console.warn(`⚠️ Store '${storeName}' not found`);
          resolve([]);
          return;
        }
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    };

    try {
      // Export meetings (excluding deleted)
      const allMeetings = await getAllFromStore('meetings');
      exportData.meetings = allMeetings.filter(m => !m.deleted);
      console.log(`📝 Meetings: ${exportData.meetings.length} (${allMeetings.length - exportData.meetings.length} deleted excluded)`);

      // Export meeting blobs (transcripts, analysis, etc.)
      const allBlobs = await getAllFromStore('meetingBlobs');
      // Only include blobs for non-deleted meetings
      const activeMeetingIds = new Set(exportData.meetings.map(m => m.id));
      exportData.meetingBlobs = allBlobs.filter(b => activeMeetingIds.has(b.meetingId));
      console.log(`📎 Meeting blobs: ${exportData.meetingBlobs.length}`);

      // Export stakeholders (excluding deleted)
      const allStakeholders = await getAllFromStore('stakeholders');
      exportData.stakeholders = allStakeholders.filter(s => !s.deleted);
      console.log(`👥 Stakeholders: ${exportData.stakeholders.length} (${allStakeholders.length - exportData.stakeholders.length} deleted excluded)`);

      // Export categories (excluding deleted)
      const allCategories = await getAllFromStore('stakeholderCategories');
      exportData.categories = allCategories.filter(c => !c.deleted);
      console.log(`🏷️ Categories: ${exportData.categories.length}`);

      // Summary
      console.log('\n📊 Export Summary:');
      console.log(`   Meetings: ${exportData.meetings.length}`);
      console.log(`   Meeting Blobs: ${exportData.meetingBlobs.length}`);
      console.log(`   Stakeholders: ${exportData.stakeholders.length}`);
      console.log(`   Categories: ${exportData.categories.length}`);

      // Calculate size
      const jsonStr = JSON.stringify(exportData, null, 2);
      const sizeKB = (new Blob([jsonStr]).size / 1024).toFixed(2);
      console.log(`   Total Size: ${sizeKB} KB`);

      // Download file
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meetingflow-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('\n✅ Export complete! Check your downloads folder.');

    } catch (err) {
      console.error('❌ Export failed:', err);
    }
  };
})();

/**
 * BONUS: Export with ALL data (including deleted)
 * Uncomment and run this if you want to include deleted items
 */
/*
(async function exportAllDataIncludingDeleted() {
  // Same as above but without the .filter(x => !x.deleted) calls
  // Useful for full backup before migration
})();
*/
