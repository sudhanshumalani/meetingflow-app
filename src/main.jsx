import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode disabled to fix double execution issues causing duplicate meetings
// TODO: Re-enable StrictMode after fixing all state management issues
createRoot(document.getElementById('root')).render(
  <App />
)
