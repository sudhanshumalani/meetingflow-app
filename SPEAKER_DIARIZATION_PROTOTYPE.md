# Speaker Diarization Prototype 🎙️

## Overview

This prototype implements **speaker diarization** (speaker identification) for the MeetingFlow app using AssemblyAI's Speaker Labels feature. It uses a **hybrid approach** that combines real-time streaming with post-processing for speaker identification.

## ✨ Features

- **Real-time Preview**: See transcript instantly while recording (without speaker labels)
- **Speaker Identification**: After recording stops, the audio is processed to identify different speakers
- **Speaker Customization**: Rename speakers from generic labels (A, B, C) to actual names
- **Color Coding**: Visual distinction between speakers with color-coded badges
- **Auto-detection**: Automatically detect number of speakers, or set expected count for better accuracy
- **Export Options**: Copy or download transcripts with speaker labels

## 🎯 How It Works (Hybrid Mode)

### During Recording:
1. **Real-time Streaming**: AssemblyAI WebSocket provides instant transcript preview
2. **Simultaneous Recording**: Audio is recorded in the background for post-processing
3. **Instant Feedback**: Users see text appear as they speak (no speakers yet)

### After Stopping:
1. **Upload to AssemblyAI**: Recorded audio is uploaded to AssemblyAI API
2. **Speaker Diarization**: Processing identifies who spoke when (10-30 seconds)
3. **Speaker Labels**: Transcript is updated with speaker labels (A, B, C, etc.)
4. **Utterance Display**: Each utterance shows speaker badge + text + confidence

## 🚀 Accessing the Prototype

### Option 1: Direct URL
Navigate to: `http://localhost:5173/test-speaker-diarization` (or your dev server URL)

### Option 2: From Browser Console
```javascript
window.location.href = '/test-speaker-diarization'
```

### Option 3: Add a Test Button (Temporary)
You can add a temporary button to your Home page for easy access during testing.

## 📋 Testing Checklist

### Basic Functionality
- [ ] Start recording with microphone
- [ ] See real-time transcript during recording
- [ ] Stop recording
- [ ] Wait for speaker processing (10-30 seconds)
- [ ] Verify speaker labels appear (A, B, C, etc.)

### Speaker Customization
- [ ] Click on speaker badge to rename
- [ ] Verify speaker names persist across the session
- [ ] Check color coding works for different speakers

### Settings
- [ ] Toggle speaker diarization on/off
- [ ] Set expected number of speakers (2-6)
- [ ] Verify auto-detection works when not set

### Edge Cases
- [ ] Test with 2 speakers (most common)
- [ ] Test with 3+ speakers
- [ ] Test with overlapping speech
- [ ] Test with background noise
- [ ] Test very short utterances vs long monologues

### Export Features
- [ ] Copy transcript to clipboard
- [ ] Download transcript as .txt file
- [ ] Verify speaker labels are included

## 🎨 UI Components

### Files Created (Won't Affect Main App)
```
src/
├── services/
│   └── assemblyAISpeakerService.js    # Speaker diarization service
├── components/
│   └── AudioRecorderSpeaker.jsx       # Audio recorder with speakers
└── views/
    └── SpeakerDiarizationTest.jsx     # Test page
```

### Existing Files Modified
```
src/
└── App.jsx                             # Added route: /test-speaker-diarization
```

## ⚙️ Configuration

### Required: AssemblyAI API Key
Make sure your `.env` file has:
```env
VITE_ASSEMBLYAI_API_KEY=your_api_key_here
```

### Optional Settings (In UI)
- **Enable Speaker Diarization**: Toggle on/off
- **Expected Speakers**: Auto-detect or set 2-6 speakers
- **Speaker Names**: Customize labels (A→John, B→Jane, etc.)

## 📊 API Details

### Request Configuration
```javascript
{
  audio_url: "uploaded_file_url",
  speaker_labels: true,           // Enable speaker diarization
  speakers_expected: 2,           // Optional: hint for # of speakers
  language_code: "en"
}
```

### Response Structure
```javascript
{
  text: "full transcript",
  utterances: [
    {
      speaker: "A",
      text: "Hello everyone",
      start: 0,
      end: 1500,
      confidence: 0.95
    },
    {
      speaker: "B",
      text: "Thanks for joining",
      start: 1600,
      end: 3200,
      confidence: 0.92
    }
  ],
  speakers_detected: 2,
  words: [...],  // Each word has speaker label
  confidence: 0.94,
  audio_duration: 120
}
```

## 🔍 Testing Tips

### For Best Results:
1. **Speaker Duration**: Each person should speak for at least 30 seconds
2. **Clear Turns**: Avoid overlapping speech when possible
3. **Audio Quality**: Use a good microphone in a quiet environment
4. **Expected Speakers**: Set the number in settings if known (improves accuracy)
5. **Processing Time**: Allow 10-30 seconds for speaker diarization after recording

### Test Scenarios:
- **2-person conversation** (most common use case)
- **3-5 person meeting** (conference call)
- **Interview format** (1 interviewer + 1 interviewee)
- **Panel discussion** (multiple speakers with varied speaking time)

## 🚧 Known Limitations

1. **Processing Time**: 10-30 seconds delay after recording stops
2. **Accuracy**: Works best when each speaker talks for 30+ seconds
3. **Overlapping Speech**: May struggle with simultaneous speakers
4. **Short Utterances**: Brief interjections ("Yeah", "Right") may be misattributed
5. **API Key Required**: Need AssemblyAI API key (file upload requires direct API key, not token)

## 🔄 Next Steps

### If Testing is Successful:
1. **Integrate into main AudioRecorder**: Add toggle for speaker mode
2. **Update Meeting data model**: Store speaker data in meetings
3. **Add export formats**: Include speakers in all export options
4. **Cross-meeting speaker matching**: Recognize same speakers across meetings
5. **Speaker analytics**: "John spoke 60% of the time" insights

### If Issues Found:
1. Document specific problems and scenarios
2. Test with different audio sources (mic, tab audio, hybrid)
3. Adjust settings (expected speakers, confidence thresholds)
4. Consider alternative approaches or fallbacks

## 📝 Feedback & Issues

When testing, please note:
- What worked well
- What didn't work as expected
- Performance issues (speed, accuracy)
- UI/UX improvements needed
- Any errors or edge cases

## 🔒 Safety Notes

- ✅ **No impact on existing app**: Prototype is completely isolated
- ✅ **No data saved**: Transcripts in test mode are not stored
- ✅ **Original features intact**: Your current recordings work unchanged
- ✅ **Easy rollback**: Can remove prototype files without affecting main app

## 📚 Resources

- [AssemblyAI Speaker Diarization Docs](https://www.assemblyai.com/docs/speech-to-text/speaker-diarization)
- [What is Speaker Diarization?](https://www.assemblyai.com/blog/what-is-speaker-diarization-and-how-does-it-work)
- [JavaScript Implementation Guide](https://www.assemblyai.com/blog/speaker-diarization-javascript)

---

**Ready to test?** Navigate to `/test-speaker-diarization` and start recording! 🎤
