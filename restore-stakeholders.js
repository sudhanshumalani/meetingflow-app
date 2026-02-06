/**
 * Stakeholder Recovery Script
 *
 * Run this in the browser console while on the MeetingFlow app to restore
 * all stakeholders that were incorrectly marked as deleted.
 *
 * Usage:
 * 1. Open MeetingFlow app in browser
 * 2. Open DevTools (F12)
 * 3. Go to Console tab
 * 4. Copy and paste this entire script
 * 5. Press Enter to run
 */

(async function restoreDeletedStakeholders() {
  console.log('🔄 Starting stakeholder recovery...');

  // Open Dexie database
  const dbRequest = indexedDB.open('MeetingFlowDB');

  dbRequest.onerror = () => {
    console.error('❌ Failed to open database');
  };

  dbRequest.onsuccess = async (event) => {
    const db = event.target.result;

    // Check if stakeholders table exists
    if (!db.objectStoreNames.contains('stakeholders')) {
      console.error('❌ Stakeholders table not found');
      return;
    }

    const transaction = db.transaction(['stakeholders'], 'readwrite');
    const store = transaction.objectStore('stakeholders');

    // Get all stakeholders
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = async () => {
      const allStakeholders = getAllRequest.result;
      const deletedStakeholders = allStakeholders.filter(s => s.deleted === true);
      const activeStakeholders = allStakeholders.filter(s => !s.deleted);

      console.log('📊 Current state:');
      console.log(`   Total stakeholders: ${allStakeholders.length}`);
      console.log(`   Active (not deleted): ${activeStakeholders.length}`);
      console.log(`   Marked as deleted: ${deletedStakeholders.length}`);

      if (deletedStakeholders.length === 0) {
        console.log('✅ No deleted stakeholders to restore!');
        return;
      }

      console.log('\n📋 Stakeholders to restore:');
      deletedStakeholders.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.name || 'Unknown'} (${s.email || s.company || s.id.slice(0, 8)})`);
      });

      // Restore each stakeholder
      let restored = 0;
      const restoreTransaction = db.transaction(['stakeholders'], 'readwrite');
      const restoreStore = restoreTransaction.objectStore('stakeholders');

      for (const stakeholder of deletedStakeholders) {
        const restoredStakeholder = {
          ...stakeholder,
          deleted: false,
          deletedAt: undefined,
          updatedAt: new Date().toISOString(),
          _restoredAt: new Date().toISOString()
        };

        // Remove undefined values
        Object.keys(restoredStakeholder).forEach(key => {
          if (restoredStakeholder[key] === undefined) {
            delete restoredStakeholder[key];
          }
        });

        try {
          await new Promise((resolve, reject) => {
            const putRequest = restoreStore.put(restoredStakeholder);
            putRequest.onsuccess = resolve;
            putRequest.onerror = reject;
          });
          restored++;
          console.log(`   ✅ Restored: ${stakeholder.name || stakeholder.id.slice(0, 8)}`);
        } catch (err) {
          console.error(`   ❌ Failed to restore: ${stakeholder.name}`, err);
        }
      }

      console.log(`\n🎉 Recovery complete! Restored ${restored} of ${deletedStakeholders.length} stakeholders.`);
      console.log('🔄 Please refresh the page to see restored stakeholders.');
    };

    getAllRequest.onerror = () => {
      console.error('❌ Failed to read stakeholders');
    };
  };
})();
