import React, { useState, useEffect, useRef } from 'react'

export default function Select({ value, onChange, options, className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const current = options.find(o => String(o.value) === String(value)) || options[0]

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleKey = (e) => {
    if (e.key === 'Escape') setOpen(false)
    if (e.key === 'Enter' || e.key === ' ') setOpen(o => !o)
    if (e.key === 'ArrowDown') {
      const idx = options.findIndex(o => String(o.value) === String(value))
      if (idx < options.length - 1) onChange(options[idx + 1].value)
    }
    if (e.key === 'ArrowUp') {
      const idx = options.findIndex(o => String(o.value) === String(value))
      if (idx > 0) onChange(options[idx - 1].value)
    }
  }

  return (
    <div className={`cs-wrap ${className}`} ref={ref} onKeyDown={handleKey}>
      <button
        className={'cs-trigger' + (open ? ' open' : '')}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="cs-value">{current?.label}</span>
        <span className="cs-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="cs-panel" role="listbox">
          {options.map(o => (
            <button
              key={o.value}
              role="option"
              aria-selected={String(o.value) === String(value)}
              className={'cs-option' + (String(o.value) === String(value) ? ' selected' : '')}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {String(o.value) === String(value) && <span className="cs-tick">▶</span>}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
