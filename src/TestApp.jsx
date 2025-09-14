import React from 'react'

function TestApp() {
  return (
    <div style={{
      padding: '50px',
      textAlign: 'center',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f0f9ff',
      minHeight: '100vh'
    }}>
      <h1 style={{ color: '#2563eb', marginBottom: '20px' }}>
        🎉 MeetingFlow PWA - GitHub Pages Test Success!
      </h1>
      <p style={{ fontSize: '18px', marginBottom: '20px' }}>
        The React app is now loading successfully on GitHub Pages!
      </p>
      <div style={{
        background: '#10b981',
        color: 'white',
        padding: '20px',
        borderRadius: '8px',
        margin: '20px 0'
      }}>
        <h2>✅ Deployment Working</h2>
        <p>Repository: sudhanshumalani/meetingflow-app</p>
        <p>URL: https://sudhanshumalani.github.io/meetingflow-app</p>
      </div>
      <button
        onClick={() => alert('React event handlers working!')}
        style={{
          backgroundColor: '#2563eb',
          color: 'white',
          padding: '10px 20px',
          border: 'none',
          borderRadius: '5px',
          fontSize: '16px',
          cursor: 'pointer'
        }}
      >
        Test React Interactivity
      </button>
    </div>
  )
}

export default TestApp