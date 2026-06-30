import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// Safety fallback: if warehouse probe hasn't resolved within 6s, dismiss boot anyway
setTimeout(() => document.getElementById('boot')?.classList.add('gone'), 6000)
