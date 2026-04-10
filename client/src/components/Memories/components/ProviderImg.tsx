import { useEffect, useRef, useState } from 'react'
import { fetchImageAsBlob } from '../../../api/authUrl'
import { useTripStore } from '../../../store/tripStore'
import { observeIntersection } from './intersectionHelpers'

interface ProviderImgProps {
  baseUrl: string
  style?: React.CSSProperties
  loading?: 'lazy' | 'eager'
}

export function ProviderImg({ baseUrl, style, loading = 'lazy' }: ProviderImgProps) {
  const cachedThumbnail = useTripStore((state) => state.photoThumbnailCache[baseUrl] || '')
  const setPhotoThumbnail = useTripStore((state) => state.setPhotoThumbnail)
  const [src, setSrc] = useState(cachedThumbnail)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const validateImageUrl = (url: string, signal: AbortSignal): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      const img = new Image()
      let settled = false

      const cleanupValidation = () => {
        if (settled) return
        settled = true
        img.onload = null
        img.onerror = null
        URL.revokeObjectURL(url)
      }

      img.onload = () => {
        if (settled) return
        cleanupValidation()
        resolve(true)
      }
      img.onerror = () => {
        if (settled) return
        cleanupValidation()
        resolve(false)
      }

      signal.addEventListener('abort', () => {
        if (settled) return
        cleanupValidation()
        resolve(false)
      }, { once: true })

      img.src = url
    })
  }

  useEffect(() => {
    let revoke = ''
    let controller = new AbortController()
    let loadingPending = false
    let cleanupObserver = () => { }

    const cleanup = () => {
    }

    const ensureController = () => {
      if (controller.signal.aborted) {
        controller = new AbortController()
      }
    }


    const loadImage = async (n: number) => {
      if (loadingPending) return
      ensureController()
      loadingPending = true
      try {
        if (controller.signal.aborted) return

        let blobUrl = cachedThumbnail
        if (!blobUrl) {
          blobUrl = await fetchImageAsBlob('/api' + baseUrl, controller.signal)
          if (!blobUrl) {
            loadingPending = false
            return
          }
          if (controller.signal.aborted) {
            URL.revokeObjectURL(blobUrl)
            loadingPending = false
            return
          }
        }
        const valid = await validateImageUrl(blobUrl, controller.signal)
        if (valid) {
          revoke = blobUrl
          loadingPending = false
          setPhotoThumbnail(baseUrl, blobUrl)
          setSrc(blobUrl)
          return
        }
        URL.revokeObjectURL(blobUrl)
      } finally {
        setPhotoThumbnail(baseUrl, undefined)
        if (n > 0) {
          loadImage(n - 1)
        } else {
          loadingPending = false
        }
      }
    }
    if (loading === 'eager') {
      loadImage(2)
    } else {
      const element = wrapperRef.current
      if (!element || typeof IntersectionObserver === 'undefined') {
        loadImage(2)
      } else {
        cleanupObserver = observeIntersection(element, visible => {
          if (visible) {
            loadImage(2)
          } else if (loadingPending) {
            controller.abort()
          }
        })
      }
    }

    return () => {
      cleanupObserver()
      controller.abort()
      cleanup()
    }
  }, [baseUrl, loading, src])

  return (
    <div
      ref={wrapperRef}
      style={{
        background: '#e0e0e0',
        minHeight: style?.height ? undefined : 200,
        ...style,
      }}
    >
      {src && <img src={src} alt="" loading={loading} style={style} />}
    </div>
  )
}
