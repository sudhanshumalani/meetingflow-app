# 📱 **Quick Testing Reference**

## 🚀 **Deploy & Test Commands**

### **Build & Deploy:**
```bash
npm run build:netlify
```
→ Drag `dist/` to [netlify.com/drop](https://app.netlify.com/drop)

### **Local Testing:**
```bash
npm run preview
```
→ Test at `http://localhost:4173` or `http://10.0.0.81:4173`

---

## 🧪 **Priority Test Cases**

### **1. Mobile Responsiveness** ⭐⭐⭐
- **Home page**: No horizontal scrolling
- **Meeting page**: Cancel/Save buttons visible
- **All buttons**: Touch-friendly, proper sizes

### **2. Camera Functionality** ⭐⭐⭐
- **HTTPS required**: Only works on deployed version
- **Mobile**: Back camera default, can switch
- **Desktop**: Webcam access and capture
- **Permissions**: Clear error messages

### **3. File Upload** ⭐⭐⭐
- **Multiple files**: Select and upload multiple
- **File types**: Images, PDFs, documents
- **Size limit**: 10MB with error handling
- **Mobile**: Native file picker works

### **4. PWA Installation** ⭐⭐⭐
- **Android**: Install banner → home screen
- **iOS**: Share → Add to Home Screen
- **Desktop**: Address bar install icon
- **Fullscreen**: No browser UI when installed

---

## 🎯 **Quick Test Scenarios**

### **30-Second Mobile Test:**
1. Open deployed URL on phone
2. Tap "New Meeting" → should fit screen
3. Tap camera icon → should request permission
4. Tap upload icon → should open file picker
5. Look for install prompt

### **1-Minute Desktop Test:**
1. Open deployed URL in browser
2. Create new meeting
3. Test camera (if available)
4. Upload a file
5. Install as desktop app (install icon in address bar)

### **2-Minute Full Test:**
1. Complete meeting workflow (create, edit, save)
2. Test camera + file upload + notes
3. Install app and test from home screen
4. Test offline (disable network)
5. Verify data persists

---

## 🚨 **Common Issues & Solutions**

| Issue | Cause | Solution |
|-------|-------|----------|
| Camera not working | HTTP instead of HTTPS | Deploy to Netlify (has HTTPS) |
| Horizontal scrolling | Mobile layout | Should be fixed in latest build |
| Install prompt missing | Need multiple visits | Visit site 2-3 times |
| File upload failing | Browser compatibility | Try different browser |
| PWA not working | HTTP connection | Must use HTTPS deployment |

---

## ✅ **Pass/Fail Criteria**

### **MUST PASS:**
- [ ] No horizontal scrolling on mobile
- [ ] Camera works on deployed (HTTPS) version
- [ ] File upload works on all browsers
- [ ] PWA installs on mobile and desktop
- [ ] App works when installed

### **SUCCESS = ALL ITEMS CHECKED** ✨

---

**Ready to test! Deploy to Netlify and run through the test cases.** 🧪🚀