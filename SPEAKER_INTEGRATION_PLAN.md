# Speaker Diarization Integration Plan

## ✅ Current State Analysis

### AudioRecorder.jsx (Current)
- ✅ Real-time transcript via AssemblyAI WebSocket
- ✅ Supports microphone, tab audio, and hybrid modes
- ✅ Auto-save functionality
- ✅ Persistent transcript across sessions
- ✅ Mobile wake lock support
- ✅ Callbacks: `onTranscriptUpdate(text)`, `onAutoSave(text, reason)`

### Meeting.jsx (Current)
- ✅ Receives transcript via `setAudioTranscript(text)`
- ✅ Has AI analysis buttons (Claude AI)
- ✅ Has edit capabilities for notes
- ✅ Stores in meeting data: `audioTranscript`, `aiResult`, `digitalNotes`

## 🎯 Integration Goals

1. **Add Optional Speaker Diarization** - Toggle on/off
2. **Preserve Existing Flow** - Everything works as before when disabled
3. **Hybrid Mode** - Real-time preview + speaker processing
4. **Speaker UI** - Display speakers in meeting view
5. **AI Compatible** - AI analysis works with both formats

## 📋 Step-by-Step Integration Plan

### ✅ Step 1: Create Backup (DONE)
- Backed up AudioRecorder.jsx to AudioRecorder.backup.jsx

### Step 2: Enhance AudioRecorder Props
**What**: Add speaker diarization support with backward compatibility
**Changes**:
```javascript
// OLD:
onTranscriptUpdate(text)

// NEW (backward compatible):
onTranscriptUpdate(text, speakerData = null)
```

**Speaker Data Format**:
```javascript
{
  text: "full transcript",
  utterances: [
    { speaker: "A", text: "...", start: 0, end: 1500, confidence: 0.95 }
  ],
  speakers_detected: 2,
  speakerLabels: { "A": "John Doe", "B": "Jane Smith" } // User customizable
}
```

### Step 3: Add Speaker Toggle to AudioRecorder
**What**: Add settings UI for speaker diarization
**Location**: Inside existing Settings panel
**Features**:
- ☑️ Enable Speaker Identification (default: OFF for safety)
- 🔢 Expected speakers (auto-detect or 2-6)
- 💡 Info tooltip explaining the feature

### Step 4: Integrate Hybrid Transcription
**What**: Use assemblyAISpeakerService when speaker mode enabled
**Flow**:
```
If speaker diarization enabled:
  1. Start hybrid mode (real-time + recording)
  2. Show real-time transcript during recording
  3. After stop: process with speaker labels (10-30s)
  4. Call onTranscriptUpdate(text, speakerData)
Else:
  Use existing real-time-only flow
```

### Step 5: Update Meeting.jsx State
**What**: Store speaker data alongside transcript
**Changes**:
```javascript
// Add new state
const [speakerData, setSpeakerData] = useState(null)

// Update callback
const handleTranscriptUpdate = (text, speakers = null) => {
  setAudioTranscript(text)
  if (speakers) {
    setSpeakerData(speakers)
  }
}
```

### Step 6: Create SpeakerTranscriptView Component
**What**: New component to display speaker-labeled transcript
**Location**: `src/components/SpeakerTranscriptView.jsx`
**Features**:
- Color-coded speaker badges
- Click to rename speakers
- Export with speaker labels
- Fallback to plain text if no speakers

### Step 7: Update Meeting Display
**What**: Conditionally show speaker view or plain text
**Logic**:
```javascript
{audioTranscript && (
  speakerData ?
    <SpeakerTranscriptView
      speakerData={speakerData}
      onUpdateSpeakers={setSpeakerData}
    />
    :
    <PlainTranscriptView text={audioTranscript} />
)}
```

### Step 8: Update Meeting Data Structure
**What**: Store speaker data in meeting object
**Schema**:
```javascript
{
  ...meeting,
  audioTranscript: "text",
  speakerData: { utterances, speakers_detected, speakerLabels }, // NEW
  originalInputs: {
    audio: {
      transcript: "text",
      speakerData: { ... } // NEW
    }
  }
}
```

### Step 9: Ensure AI Analysis Compatibility
**What**: AI analysis should work with both formats
**Approach**:
- AI receives plain text (always available)
- Speaker info is additional metadata
- AI can analyze "Who said what" if speakers present

### Step 10: Testing Checklist
**Test Scenarios**:
- [ ] Speaker mode OFF: Works exactly as before
- [ ] Speaker mode ON: Real-time preview → speaker processing
- [ ] Save meeting with speakers → reload → speakers preserved
- [ ] AI analysis works with speaker data
- [ ] Edit functionality works
- [ ] Export includes speaker labels
- [ ] Mobile experience smooth
- [ ] Auto-save works during speaker processing

## 🔒 Safety Measures

1. **Feature Flag**: Speaker diarization OFF by default
2. **Backward Compatible**: Old callback signature still works
3. **Graceful Fallback**: If speaker processing fails, show plain text
4. **Preserve Existing**: All current features work unchanged
5. **Easy Rollback**: Can revert to backup if issues arise

## 📝 Files to Modify

1. ✅ `src/components/AudioRecorder.jsx` - Add speaker mode
2. ⏳ `src/components/SpeakerTranscriptView.jsx` - NEW component
3. ⏳ `src/views/Meeting.jsx` - Update to handle speaker data
4. ⏳ `src/contexts/AppContext.jsx` - Update meeting schema (if needed)

## 🎨 UI Considerations

### Real-time Phase (During Recording)
```
┌─────────────────────────────────────┐
│ 🎤 Recording... [00:32]             │
│ ✓ Speaker ID enabled                │
├─────────────────────────────────────┤
│ 📝 Real-time Preview                │
│ Hello everyone, welcome to the...   │
│ (speakers will be identified after) │
└─────────────────────────────────────┘
```

### Processing Phase (After Stop)
```
┌─────────────────────────────────────┐
│ 🔄 Identifying speakers... 45%      │
│ [████████░░░░░░░░░░░░░░░░░] │
│ Please wait 10-30 seconds...        │
└─────────────────────────────────────┘
```

### Result Phase (Complete)
```
┌─────────────────────────────────────┐
│ ✓ 2 speakers identified             │
├─────────────────────────────────────┤
│ [Speaker A] Hello everyone          │
│ [Speaker B] Thanks for joining      │
│ [Speaker A] Let's get started       │
│                                     │
│ [Edit Names] [Export] [AI Analyze]  │
└─────────────────────────────────────┘
```

## 🚀 Rollout Strategy

1. **Phase 1**: Complete integration with feature OFF by default
2. **Phase 2**: Test thoroughly with feature ON
3. **Phase 3**: Enable by default if stable
4. **Phase 4**: Add advanced features (cross-meeting speaker matching)

## 📞 Communication Plan

- Document the new feature in UI tooltips
- Add "NEW" badge next to speaker toggle
- Show info banner first time user enables it
- Provide link to documentation

## 🔧 Maintenance Notes

- Backup file: `AudioRecorder.backup.jsx` (can delete after stable)
- Monitor AssemblyAI API usage (speaker diarization costs same as regular)
- Consider caching speaker identities across meetings
- Future: Voice recognition for auto-naming speakers

---

**Status**: Ready to implement ✅
**Risk Level**: Low (backward compatible, feature flagged)
**Estimated Time**: 2-3 hours for full integration
