# 🔄 MeetingFlow Multi-Device Sync Setup Guide

## 📱💻 Complete Cross-Device Synchronization

This guide will help you set up MeetingFlow sync across your **iPad**, **iPhone**, and **Windows Desktop** using Google Drive.

---

## 🎯 What You'll Need

### **Required Items:**
- ✅ Google account (the same one for all devices)
- ✅ Internet connection on all devices
- ✅ Web browser on each device

### **No Additional Apps Needed:**
- ❌ No mobile apps to download
- ❌ No desktop software to install
- ✅ Everything works through your web browser

---

## 🔑 Step 1: Google OAuth Setup (One-Time Only)

⚠️ **IMPORTANT**: You only need to do this once. The same credentials work for all devices.

### **1.1 Create Google OAuth Credentials**

1. **Go to Google Cloud Console**: https://console.cloud.google.com/
2. **Sign in** with your Google account
3. **Create a New Project**:
   - Click "Select a project" → "New Project"
   - Name: "MeetingFlow Sync"
   - Click "Create"

4. **Enable Google Drive API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Drive API"
   - Click on it → Click "Enable"

5. **Create OAuth Credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Application type: **Web application**
   - Name: "MeetingFlow Web App"

6. **Add Authorized Redirect URIs**:
   Add **BOTH** of these URLs (critical for iOS compatibility):
   ```
   https://sudhanshumalani.github.io/meetingflow-app/auth/google/callback
   https://sudhanshumalani.github.io/auth/google/callback
   ```
   ⚠️ **Critical**: Add both URLs exactly as shown above
   - First URL: For regular browser access
   - Second URL: For iOS/Android standalone app access

7. **Copy Your Client ID**:
   - After creation, copy the **Client ID** (looks like: `123456789-abc123.apps.googleusercontent.com`)
   - ⚠️ **Keep this safe** - you'll need it for GitHub setup

### **1.2 Add Client ID to GitHub**

1. **Go to your GitHub repository**: https://github.com/sudhanshumalani/meetingflow-app
2. **Navigate to Settings** → **Secrets and variables** → **Actions**
3. **Click "New repository secret"**:
   - **Name**: `VITE_GOOGLE_CLIENT_ID`
   - **Secret**: Paste your Google Client ID
   - Click "Add secret"

4. **Wait for deployment** (2-3 minutes for GitHub Actions to rebuild)

---

## 🖥️ Step 2: Windows Desktop Setup

### **2.1 Access the App**
1. **Open your preferred browser** (Chrome, Edge, Firefox)
2. **Go to**: https://sudhanshumalani.github.io/meetingflow-app/
3. **Bookmark this page** for easy access

### **2.2 Enable Google Drive Sync**
1. **Click the Settings icon** (⚙️) in the top-right
2. **Go to "Cross-Device Sync" tab**
3. **Click "Google Drive"**
4. **Click "Connect with Google"**
5. **Sign in** with your Google account
6. **Grant permissions** when prompted
7. **Click "TEST"** - should show "✅ Connection successful"

### **2.3 Create Your First Meeting**
1. **Go back to Home** (🏠 icon)
2. **Create a test meeting** with some notes
3. **Notice the sync indicator** in the top-right showing sync status

---

## 📱 Step 3: iPad Setup

### **3.1 Safari Browser Setup**
1. **Open Safari** on your iPad
2. **Go to**: https://sudhanshumalani.github.io/meetingflow-app/
3. **Add to Home Screen** (for app-like experience):
   - Tap the Share button (⬆️)
   - Tap "Add to Home Screen"
   - Name it "MeetingFlow"
   - Tap "Add"

### **3.2 Enable Sync**
1. **Open the app** (from home screen or Safari)
2. **Tap Settings** (⚙️)
3. **Tap "Cross-Device Sync"**
4. **Tap "Google Drive"**
5. **Tap "Connect with Google"**
6. **Sign in** with the **same Google account** used on desktop
7. **Grant permissions**
8. **Tap "TEST"** - should show "✅ Connection successful"

### **3.3 Verify Sync**
1. **Go to Home**
2. **Your desktop meetings should appear automatically**
3. **Create a new meeting** - it should sync to desktop within minutes

---

## 📱 Step 4: iPhone Setup

### **4.1 Safari Browser Setup**
1. **Open Safari** on your iPhone
2. **Go to**: https://sudhanshumalani.github.io/meetingflow-app/
3. **Add to Home Screen**:
   - Tap Share button (⬆️)
   - Tap "Add to Home Screen"
   - Name: "MeetingFlow"
   - Tap "Add"

### **4.2 Enable Sync**
1. **Open MeetingFlow** from home screen
2. **Tap Settings** (⚙️)
3. **Tap "Cross-Device Sync"**
4. **Tap "Google Drive"**
5. **Tap "Connect with Google"**
6. **Sign in** with the **same Google account**
7. **Grant permissions**
8. **Tap "TEST"** - should show "✅ Connection successful"

### **4.3 Verify Cross-Device Sync**
1. **All your meetings from desktop and iPad should appear**
2. **Create a meeting on iPhone**
3. **Check other devices** - should sync automatically

---

## ✅ Step 5: Verification & Testing

### **5.1 Test Sync Across All Devices**

**On Desktop:**
1. Create a meeting called "Desktop Test"
2. Add some notes and stakeholders

**On iPad:**
1. Refresh the page or wait 1-2 minutes
2. "Desktop Test" should appear
3. Create "iPad Test" meeting

**On iPhone:**
1. Both "Desktop Test" and "iPad Test" should appear
2. Create "iPhone Test" meeting

**Final Check:**
- All three test meetings should appear on all devices
- Notes and stakeholders should sync completely

### **5.2 Understanding Sync Behavior**

**✅ What Syncs:**
- Meeting details (title, date, time)
- Meeting notes and transcripts
- Stakeholder information
- Meeting status and categories

**⏱️ Sync Timing:**
- **Automatic sync**: Every 5 minutes when online
- **Manual sync**: Use the sync button in settings
- **Real-time**: Changes sync within 1-2 minutes

**📶 Offline Behavior:**
- Changes made offline are queued
- Sync resumes when connection is restored
- Conflicts are resolved automatically (newer wins)

---

## 🔧 Troubleshooting

### **"Setup Required" Error**
- **Check**: GitHub secret is added correctly
- **Wait**: 2-3 minutes after adding the secret
- **Refresh**: Browser cache (Ctrl+Shift+R / Cmd+Shift+R)

### **"Connection Failed" Error**
- **Verify**: Using the same Google account on all devices
- **Check**: Google Drive API is enabled
- **Ensure**: Redirect URI is exactly correct

### **Sync Not Working**
- **Test Connection**: Click TEST button in settings
- **Check Internet**: Ensure all devices are online
- **Manual Sync**: Click sync button in settings
- **Re-authenticate**: Disconnect and reconnect Google Drive

### **Missing Meetings**
- **Wait**: Up to 5 minutes for automatic sync
- **Manual Sync**: Use the sync button
- **Check Conflicts**: Look for conflict resolution dialogs

### **iOS "404 This isn't a GitHub Pages site" Error**
This happens when the app is added to home screen on iOS:

**Solution**:
1. **Add both redirect URIs** in Google OAuth (Step 1.6 above)
2. **Refresh the deployed app**: Wait 2-3 minutes after pushing changes
3. **Clear Safari cache**: Settings → Safari → Clear History and Website Data
4. **Re-add to Home Screen**: Remove old app icon, re-add from Safari
5. **Alternative**: Use Safari browser directly instead of home screen app

**Why this happens**: iOS standalone apps handle URLs differently than browser apps

---

## 🎉 You're All Set!

### **What You've Achieved:**
✅ **Seamless Cross-Device Sync**: All your meeting data syncs automatically
✅ **15GB Free Storage**: Using your Google Drive storage
✅ **Automatic Backups**: Your data is safely stored in the cloud
✅ **Offline Support**: Works even without internet, syncs when reconnected
✅ **Real-time Updates**: Changes appear on other devices within minutes

### **Daily Usage:**
- **Just use MeetingFlow normally** on any device
- **Sync happens automatically** in the background
- **All your data stays up-to-date** across devices
- **No manual intervention needed**

### **Security Notes:**
🔒 **Your data is secure**:
- OAuth2 authentication (no passwords stored)
- Data stored in your private Google Drive
- Encrypted transmission between devices
- You control all access permissions

---

## 📞 Support

If you encounter any issues:
1. **Check the troubleshooting section above**
2. **Verify all steps were completed correctly**
3. **Try disconnecting and reconnecting Google Drive sync**
4. **Clear browser cache and try again**

**Remember**: The same Google account must be used on all devices for sync to work properly.

---

**🎯 Pro Tip**: Bookmark or save this guide for future reference when setting up additional devices!