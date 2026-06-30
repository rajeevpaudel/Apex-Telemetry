import { useState, useEffect } from 'react'

export function useCountUp(targetMs, durationMs = 900, key = '') {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (targetMs == null) { setVal(null); return }
    const start = performance.now()
    let raf
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setVal(Math.round(targetMs * eased))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [targetMs, key])
  return val
}
