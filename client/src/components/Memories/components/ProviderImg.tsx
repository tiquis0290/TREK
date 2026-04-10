import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { fetchImageAsBlob } from '../../../api/authUrl'
import { useTripStore } from '../../../store/tripStore'
import { observeIntersection } from '../utils/intersectionHelpers'

const MAX_RETRIES = 2

interface ProviderImgProps {
  baseUrl: string
  style?: CSSProperties
  loading?: 'lazy' | 'eager'
}

export function ProviderImg({ baseUrl, style, loading = 'lazy' }: ProviderImgProps) {
  const cachedThumbnail = useTripStore(state => state.photoThumbnailCache[baseUrl] || '')
  const setPhotoThumbnail = useTripStore(state => state.setPhotoThumbnail)
  const [src, setSrc] = useState(cachedThumbnail)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setSrc(cachedThumbnail)
  }, [cachedThumbnail, baseUrl])

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
    let controller = new AbortController()
    let isLoading = false
    let stopObserving = () => {}
    let isMounted = true

    const ensureController = () => {
      if (controller.signal.aborted) {
        controller = new AbortController()
      }
    }

    const loadImage = async (retriesLeft: number) => {
      if (isLoading || !isMounted) return
      ensureController()
      isLoading = true

      try {
        if (controller.signal.aborted) return

        let blobUrl = cachedThumbnail
        if (!blobUrl) {
          blobUrl = await fetchImageAsBlob('/api' + baseUrl, controller.signal)
          if (!blobUrl) {
            return
          }

          if (controller.signal.aborted) {
            URL.revokeObjectURL(blobUrl)
            return
          }
        }

        const valid = await validateImageUrl(blobUrl, controller.signal)
        if (valid) {
          if (!isMounted) {
            URL.revokeObjectURL(blobUrl)
            return
          }
          setPhotoThumbnail(baseUrl, blobUrl)
          setSrc(blobUrl)
          return
        }

        URL.revokeObjectURL(blobUrl)
        setPhotoThumbnail(baseUrl, undefined)

        if (retriesLeft > 0 && !controller.signal.aborted) {
          isLoading = false
          await loadImage(retriesLeft - 1)
        }
      } finally {
        isLoading = false
      }
    }

    if (loading === 'eager') {
      loadImage(MAX_RETRIES)
    } else {
      const element = wrapperRef.current
      if (!element || typeof IntersectionObserver === 'undefined') {
        loadImage(MAX_RETRIES)
      } else {
        stopObserving = observeIntersection(element, visible => {
          if (visible) {
            loadImage(MAX_RETRIES)
          } else if (isLoading) {
            controller.abort()
          }
        })
      }
    }

    return () => {
      isMounted = false
      stopObserving()
      controller.abort()
    }
  }, [baseUrl, cachedThumbnail, loading, setPhotoThumbnail])

  return (
    <div
      ref={wrapperRef}
      style={{
        background: '#e0e0e0',
        overflow: 'hidden',
        minHeight: style?.height ? undefined : 200,
        ...style,
      }}
    >
      {src && <img src={src} alt="" loading={loading} style={style}/>}
    </div>
  )
}
