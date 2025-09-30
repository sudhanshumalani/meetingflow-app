# Whisper Transcription Testing Guide

Comprehensive testing checklist for desktop, iOS, and Android platforms.

---

## Pre-Testing Setup

### Backend Setup
```bash
cd backend
npm install
npm run download-model
npm start
```

Verify: http://localhost:8080/health

### Frontend Setup
```bash
# In project root
npm run dev
```

Verify: http://localhost:5173

---

## Test 1: Backend Health Check

**Platform:** All

**Steps:**
1. Open browser: http://localhost:8080/health
2. Verify response:
   ```json
   {
     "status": "ok",
     "service": "MeetingFlow Transcription Backend"
   }
   ```

**Expected:** ✅ 200 OK response

**Result:** [ ]

---

## Test 2: WebSocket Connection

**Platform:** All

**Steps:**
1. Open frontend app
2. Open browser DevTools → Console
3. Look for: `✓ Connected to transcription service`

**Expected:** ✅ WebSocket connection successful

**Result:** [ ]

---

## Test 3: Platform Detection

**Platform:** All

**Steps:**
1. Open app on device
2. Check platform info banner
3. Verify correct platform/browser detected

**Expected:**
- Desktop: "Windows/macOS - Chrome/Edge"
- iOS: "iOS - Safari"
- Android: "Android - Chrome"

**Result:** [ ]

---

## Test 4: Desktop - Microphone Recording

**Platform:** Windows/Mac (Chrome/Edge)

**Steps:**
1. Click "Start Recording"
2. Allow microphone access
3. Speak clearly: "This is a test of the microphone recording."
4. Wait 2-3 seconds
5. Verify transcript appears

**Expected:** ✅ Transcript shows spoken text within 3 seconds

**Result:** [ ]

**Transcript Quality:** [ ] Excellent [ ] Good [ ] Fair [ ] Poor

---

## Test 5: Desktop - System Audio (Zoom)

**Platform:** Windows/Mac (Chrome/Edge)

**Prerequisites:**
- Zoom installed and running
- Active Zoom meeting or test meeting

**Steps:**
1. Join Zoom meeting
2. In app, click "Start Recording"
3. Select "Entire Screen" or "Zoom Window"
4. ✅ **CHECK "Share audio" checkbox**
5. Click "Share"
6. Have someone speak in Zoom
7. Verify their speech appears in transcript

**Expected:** ✅ Zoom audio captured and transcribed

**Result:** [ ]

**Issues:** [ ] Share audio checkbox not checked [ ] Wrong window selected [ ] Other: ___

---

## Test 6: iOS - Microphone Recording

**Platform:** iOS (Safari/PWA)

**Steps:**
1. Open app in Safari or PWA
2. Click "Start Recording"
3. Allow microphone access
4. Speak: "Testing iOS microphone recording."
5. Verify transcript appears

**Expected:** ✅ Transcript shows within 3 seconds

**Result:** [ ]

---

## Test 7: iOS - Background Recording (Screen Lock)

**Platform:** iOS (Safari/PWA)

**Prerequisites:**
- Microphone permission granted
- Silent audio workaround enabled

**Steps:**
1. Click "Start Recording"
2. Verify "iOS background mode enabled" message
3. Start speaking: "Testing background recording on iOS."
4. **Lock screen** (press power button)
5. Continue speaking: "The screen is now locked but recording continues."
6. Wait 10 seconds
7. **Unlock screen**
8. Check transcript

**Expected:** ✅ Full transcript includes speech during screen lock

**Result:** [ ]

**If Failed:**
- [ ] Silent audio didn't start
- [ ] Recording stopped when screen locked
- [ ] Partial transcript only

---

## Test 8: iOS - Background Recording (App Switch)

**Platform:** iOS (Safari/PWA)

**Steps:**
1. Click "Start Recording"
2. Start speaking: "Testing app switching."
3. **Switch to another app** (Home Screen or another app)
4. Continue speaking: "I have switched to another app."
5. Wait 10 seconds
6. **Return to app**
7. Check transcript

**Expected:** ✅ Full transcript includes speech during app switch

**Result:** [ ]

---

## Test 9: Android - Microphone Recording

**Platform:** Android (Chrome)

**Steps:**
1. Open app in Chrome
2. Click "Start Recording"
3. Allow microphone permission
4. Speak: "Testing Android microphone."
5. Verify transcript appears

**Expected:** ✅ Transcript appears within 3 seconds

**Result:** [ ]

---

## Test 10: Long Recording (Stress Test)

**Platform:** All

**Steps:**
1. Click "Start Recording"
2. Record continuously for 5 minutes
3. Speak periodically
4. Monitor:
   - Transcript updates
   - Memory usage
   - WebSocket connection status
5. Click "Stop"

**Expected:**
- ✅ Continuous transcription throughout
- ✅ No memory leaks
- ✅ WebSocket stays connected

**Result:** [ ]

**Issues:** [ ] Connection dropped [ ] Memory issues [ ] Transcript gaps

---

## Test 11: Transcript Quality (Clear Audio)

**Platform:** All

**Audio:** Clear speech, no background noise

**Test Phrases:**
1. "The quick brown fox jumps over the lazy dog."
2. "Artificial intelligence is transforming the technology industry."
3. "Schedule the meeting for next Tuesday at three PM."

**Expected Transcripts:**
1. [ ] Exact match [ ] Close match [ ] Poor match
2. [ ] Exact match [ ] Close match [ ] Poor match
3. [ ] Exact match [ ] Close match [ ] Poor match

**Accuracy:** [ ] 90-100% [ ] 70-89% [ ] <70%

---

## Test 12: Transcript Quality (Noisy Audio)

**Platform:** All

**Audio:** Background music or office noise

**Steps:**
1. Play background music/noise
2. Speak test phrases
3. Check transcript accuracy

**Expected:** 70-85% accuracy (lower than clear audio)

**Actual Accuracy:** [ ] 70-100% [ ] 50-69% [ ] <50%

---

## Test 13: Multiple Start/Stop Cycles

**Platform:** All

**Steps:**
1. Start recording → Speak → Stop
2. Repeat 5 times
3. Verify each cycle works correctly

**Expected:** ✅ All cycles work, no errors

**Result:** [ ] All passed [ ] Some failed

**Issues:** ___

---

## Test 14: Clear Transcript Function

**Platform:** All

**Steps:**
1. Record some audio
2. Get transcript
3. Click "Clear" button (🗑️)
4. Verify transcript cleared

**Expected:** ✅ Transcript clears, component resets

**Result:** [ ]

---

## Test 15: Error Handling (No Backend)

**Platform:** All

**Steps:**
1. **Stop backend server**
2. Try to start recording
3. Verify error message appears

**Expected:** ✅ "Connection error" message displayed

**Result:** [ ]

---

## Test 16: Error Handling (Denied Permissions)

**Platform:** All

**Steps:**
1. Block microphone permission in browser
2. Try to start recording
3. Verify error message

**Expected:** ✅ "Microphone access failed" error

**Result:** [ ]

---

## Test 17: Latency Measurement

**Platform:** All

**Steps:**
1. Start recording
2. Say "Start" and start timer
3. Wait for "Start" to appear in transcript
4. Measure time elapsed

**Expected:** 1-3 seconds latency

**Actual Latency:** ___ seconds

**Rating:** [ ] Excellent (<2s) [ ] Good (2-3s) [ ] Poor (>3s)

---

## Test 18: Component Integration

**Platform:** All

**Steps:**
1. Verify WhisperTranscription component:
   - Renders correctly
   - Platform info displays
   - Status indicator works
   - Instructions toggle works

**Expected:** ✅ All UI elements functional

**Result:** [ ]

---

## Test 19: Production Deployment

**Platform:** All (Production)

**Prerequisites:**
- Backend deployed to Render.com
- Frontend using `wss://` URL

**Steps:**
1. Update `.env` with production URL
2. Build frontend: `npm run build`
3. Deploy frontend
4. Test recording on production

**Expected:** ✅ Works same as local

**Result:** [ ]

**Production URL:** ___

---

## Test 20: Cross-Device Transcript Sync

**Platform:** All

**Steps:**
1. Record on Device A
2. Save transcript to database
3. Open app on Device B
4. Verify transcript appears

**Expected:** ✅ Transcript syncs across devices

**Result:** [ ]

---

## Performance Metrics

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Connection time | <2s | ___ | [ ] |
| First transcript | <5s | ___ | [ ] |
| Latency (avg) | 1-3s | ___ | [ ] |
| Accuracy (clear) | >90% | ___% | [ ] |
| Accuracy (noisy) | >70% | ___% | [ ] |
| Memory usage | <100MB | ___MB | [ ] |
| CPU usage | <50% | ___% | [ ] |

---

## Known Issues / Limitations

### Cannot Be Fixed

- [ ] iOS cannot capture Zoom audio (Apple restriction)
- [ ] Mobile browsers cannot capture system audio
- [ ] 1-3 second latency (Whisper processing time)
- [ ] Speaker diarization not supported

### Can Be Improved

- [ ] Accuracy with accented speech
- [ ] Punctuation restoration
- [ ] Cold start time on free tier
- [ ] Model loading time

---

## Sign-Off

**Tested By:** _______________

**Date:** _______________

**Overall Assessment:**
- [ ] Production Ready
- [ ] Needs Minor Fixes
- [ ] Needs Major Fixes

**Notes:**
_______________________________________________________________
_______________________________________________________________
_______________________________________________________________

---

## Troubleshooting Reference

### Issue: No transcript appearing
**Check:**
- [ ] Backend running (http://localhost:8080/health)
- [ ] WebSocket connected (check console)
- [ ] Microphone permission granted
- [ ] Audio being captured (check waveform/indicator)

### Issue: Poor transcript quality
**Check:**
- [ ] Audio clarity (background noise)
- [ ] Microphone distance
- [ ] Speaker clarity (accent, speed)
- [ ] Model type (upgrade to small.en or medium.en)

### Issue: iOS background not working
**Check:**
- [ ] Silent audio playing (check console)
- [ ] Microphone permission granted
- [ ] PWA installed (not just Safari tab)
- [ ] Not Low Power Mode enabled

---

**For detailed troubleshooting:** See `WHISPER_INTEGRATION.md`
