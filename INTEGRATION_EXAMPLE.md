# Integration Example - Adding Whisper to Your App

Quick example showing how to integrate WhisperTranscription into your existing MeetingFlow app.

---

## Option 1: Simple Integration (Recommended)

### Step 1: Import Component

In your main app file (e.g., `src/App.jsx`):

```javascript
import React, { useState } from 'react';
import WhisperTranscription from './components/WhisperTranscription';

function App() {
  const [transcript, setTranscript] = useState('');

  return (
    <div className="app">
      <h1>MeetingFlow</h1>

      {/* Add Whisper Component */}
      <WhisperTranscription
        enabled={true}
        onTranscriptUpdate={(text) => {
          setTranscript(text);
          // Optionally save to database, state, etc.
        }}
      />

      {/* Your existing components */}
    </div>
  );
}
```

### Step 2: Start Backend

```bash
cd backend
npm install
npm run download-model
npm start
```

### Step 3: Configure Frontend

Add to `.env`:
```env
VITE_TRANSCRIPTION_WS=ws://localhost:8080
```

### Step 4: Done!

Open app and click "Start Recording".

---

## Option 2: Integration with Existing AudioRecorder

If you want to add Whisper as an alternative to your existing recorder:

```javascript
import React, { useState } from 'react';
import AudioRecorder from './components/AudioRecorder'; // Your existing recorder
import WhisperTranscription from './components/WhisperTranscription';

function App() {
  const [transcriptionMode, setTranscriptionMode] = useState('web-speech'); // or 'whisper'
  const [transcript, setTranscript] = useState('');

  return (
    <div className="app">
      {/* Mode Selector */}
      <div className="transcription-mode-selector">
        <button
          onClick={() => setTranscriptionMode('web-speech')}
          className={transcriptionMode === 'web-speech' ? 'active' : ''}
        >
          Web Speech API (Free, Browser-based)
        </button>
        <button
          onClick={() => setTranscriptionMode('whisper')}
          className={transcriptionMode === 'whisper' ? 'active' : ''}
        >
          Whisper.cpp (Self-hosted, More Accurate)
        </button>
      </div>

      {/* Conditional Rendering */}
      {transcriptionMode === 'web-speech' ? (
        <AudioRecorder onTranscript={setTranscript} />
      ) : (
        <WhisperTranscription
          enabled={true}
          onTranscriptUpdate={setTranscript}
        />
      )}

      {/* Display Transcript */}
      <div className="transcript-display">
        <h3>Transcript:</h3>
        <pre>{transcript}</pre>
      </div>
    </div>
  );
}
```

---

## Option 3: Modal/Tab Integration

Add Whisper as a tab in your existing UI:

```javascript
import React, { useState } from 'react';
import WhisperTranscription from './components/WhisperTranscription';

function MeetingNotesApp() {
  const [activeTab, setActiveTab] = useState('notes');

  return (
    <div className="meeting-notes-app">
      {/* Tabs */}
      <div className="tabs">
        <button onClick={() => setActiveTab('notes')}>Notes</button>
        <button onClick={() => setActiveTab('transcription')}>
          🎙️ Transcription
        </button>
        <button onClick={() => setActiveTab('export')}>Export</button>
      </div>

      {/* Tab Content */}
      {activeTab === 'notes' && (
        <div>Your notes component</div>
      )}

      {activeTab === 'transcription' && (
        <WhisperTranscription
          enabled={true}
          onTranscriptUpdate={(text) => {
            // Save to notes automatically
            console.log('Saving transcript:', text);
          }}
        />
      )}

      {activeTab === 'export' && (
        <div>Your export component</div>
      )}
    </div>
  );
}
```

---

## Option 4: Persistent Transcript Storage

Save transcripts to localStorage or database:

```javascript
import React, { useState, useEffect } from 'react';
import WhisperTranscription from './components/WhisperTranscription';

function App() {
  const [transcript, setTranscript] = useState('');
  const [savedTranscripts, setSavedTranscripts] = useState([]);

  // Load saved transcripts on mount
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('transcripts') || '[]');
    setSavedTranscripts(saved);
  }, []);

  const handleTranscriptUpdate = (text) => {
    setTranscript(text);
  };

  const saveTranscript = () => {
    const newTranscript = {
      id: Date.now(),
      text: transcript,
      timestamp: new Date().toISOString()
    };

    const updated = [...savedTranscripts, newTranscript];
    setSavedTranscripts(updated);
    localStorage.setItem('transcripts', JSON.stringify(updated));

    alert('Transcript saved!');
  };

  return (
    <div className="app">
      <WhisperTranscription
        enabled={true}
        onTranscriptUpdate={handleTranscriptUpdate}
      />

      <button onClick={saveTranscript} disabled={!transcript}>
        💾 Save Transcript
      </button>

      {/* Display Saved Transcripts */}
      <div className="saved-transcripts">
        <h3>Saved Transcripts:</h3>
        {savedTranscripts.map(t => (
          <div key={t.id} className="transcript-item">
            <small>{new Date(t.timestamp).toLocaleString()}</small>
            <p>{t.text.substring(0, 100)}...</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Option 5: Integration with State Management (Redux/Context)

```javascript
// TranscriptionContext.js
import React, { createContext, useState, useContext } from 'react';

const TranscriptionContext = createContext();

export function TranscriptionProvider({ children }) {
  const [transcript, setTranscript] = useState('');
  const [isRecording, setIsRecording] = useState(false);

  return (
    <TranscriptionContext.Provider value={{
      transcript,
      setTranscript,
      isRecording,
      setIsRecording
    }}>
      {children}
    </TranscriptionContext.Provider>
  );
}

export const useTranscription = () => useContext(TranscriptionContext);
```

```javascript
// App.jsx
import React from 'react';
import { TranscriptionProvider, useTranscription } from './TranscriptionContext';
import WhisperTranscription from './components/WhisperTranscription';

function TranscriptionComponent() {
  const { setTranscript, setIsRecording } = useTranscription();

  return (
    <WhisperTranscription
      enabled={true}
      onTranscriptUpdate={(text) => {
        setTranscript(text);
        setIsRecording(true);
      }}
    />
  );
}

function NotesComponent() {
  const { transcript } = useTranscription();

  return (
    <div>
      <h3>Live Notes:</h3>
      <p>{transcript}</p>
    </div>
  );
}

function App() {
  return (
    <TranscriptionProvider>
      <div className="app">
        <TranscriptionComponent />
        <NotesComponent />
      </div>
    </TranscriptionProvider>
  );
}
```

---

## Option 6: Auto-Save to Meeting Notes

Automatically append transcripts to meeting notes:

```javascript
import React, { useState } from 'react';
import WhisperTranscription from './components/WhisperTranscription';

function MeetingNotes() {
  const [notes, setNotes] = useState('');

  const handleTranscriptUpdate = (text) => {
    // Append to notes with timestamp
    const timestamp = new Date().toLocaleTimeString();
    setNotes(prev => `${prev}\n\n[${timestamp}] ${text}`);
  };

  return (
    <div className="meeting-notes">
      {/* Transcription Component */}
      <WhisperTranscription
        enabled={true}
        onTranscriptUpdate={handleTranscriptUpdate}
      />

      {/* Editable Notes */}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Meeting notes will appear here..."
        rows={20}
        className="notes-textarea"
      />

      <button onClick={() => {
        // Save to database, export, etc.
        console.log('Saving notes:', notes);
      }}>
        Save Notes
      </button>
    </div>
  );
}
```

---

## Minimal Example (Copy-Paste Ready)

```javascript
import React, { useState } from 'react';
import WhisperTranscription from './components/WhisperTranscription';

function App() {
  const [transcript, setTranscript] = useState('');

  return (
    <div style={{ padding: '20px' }}>
      <h1>MeetingFlow Transcription</h1>

      <WhisperTranscription
        enabled={true}
        onTranscriptUpdate={setTranscript}
      />

      <div style={{
        marginTop: '20px',
        padding: '15px',
        background: '#f5f5f5',
        borderRadius: '8px'
      }}>
        <h3>Live Transcript:</h3>
        <pre style={{ whiteSpace: 'pre-wrap' }}>
          {transcript || 'Transcript will appear here...'}
        </pre>
      </div>
    </div>
  );
}

export default App;
```

---

## Environment Setup

### Development

```env
VITE_TRANSCRIPTION_WS=ws://localhost:8080
```

### Production

```env
VITE_TRANSCRIPTION_WS=wss://meetingflow-transcription.onrender.com
```

---

## Backend Commands

```bash
# Install dependencies
cd backend && npm install

# Download Whisper model
npm run download-model

# Start development server
npm run dev

# Start production server
npm start
```

---

## Frontend Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

---

## Troubleshooting

### "Cannot connect to backend"

**Check:**
1. Backend is running: `http://localhost:8080/health`
2. Correct WebSocket URL in `.env`
3. CORS enabled in backend

**Solution:**
```bash
cd backend
npm start
```

### "Module not found: WhisperTranscription"

**Solution:**
Ensure files exist:
- `src/components/WhisperTranscription.jsx`
- `src/services/TranscriptionStreamService.js`
- `src/services/DeviceDetector.js`

### "Whisper model not found"

**Solution:**
```bash
cd backend
npm run download-model
```

---

## Next Steps

1. **Test locally:** Use minimal example above
2. **Integrate:** Choose integration option that fits your app
3. **Test on mobile:** Install PWA, test iOS background recording
4. **Deploy:** Follow deployment guide in `WHISPER_INTEGRATION.md`

---

## Complete Documentation

- **QUICKSTART.md** - Get started in 5 minutes
- **WHISPER_INTEGRATION.md** - Complete integration guide
- **WHISPER_TESTING.md** - Testing checklist
- **backend/README.md** - Backend API documentation

---

**Need help?** See `WHISPER_INTEGRATION.md` for detailed guides.
