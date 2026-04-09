import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react'

declare global {
  interface Window {
    __setOverlay?: (overlay: React.ReactNode) => void
  }
}


export function OverlayContainer() {
  const [overlay, setOverlay] = useState<React.ReactNode>(<></>)


  useEffect(() => {
    window.__setOverlay = setOverlay
    return () => { delete window.__setOverlay }
  }, [setOverlay])

  return (
    <>
      <div style={{
        position: 'fixed', top: 0, left: 0,
        width: '100%', height: '100%',
        display: 'flex', alignContent: 'center', justifyContent: 'center',
        zIndex: 9999,
        pointerEvents: 'none',
        background: 'none',
      }}>
        {overlay}
      </div>
    </>
  )
}

export const useOverlay = () => {
  const show = useCallback((overlay: React.ReactNode) => {
    if (window.__setOverlay) {
      window.__setOverlay(overlay)
    }
  }, [])

  return {show}
}

export default useOverlay
