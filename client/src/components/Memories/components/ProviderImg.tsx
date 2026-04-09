import { useEffect, useRef, useState } from 'react'
import { fetchImageAsBlob } from '../../../api/authUrl'

interface ProviderImgProps {
  baseUrl: string
  style?: React.CSSProperties
  loading?: 'lazy' | 'eager'
}

export function ProviderImg({ baseUrl, style, loading = 'lazy' }: ProviderImgProps) {
  const [src, setSrc] = useState('')
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let revoke = ''
    let observer: IntersectionObserver | null = null
    let controller = new AbortController()
    let loadingPending = false

    const cleanup = () => {
      if (revoke) {
        URL.revokeObjectURL(revoke)
        revoke = ''
      }
    }

    const ensureController = () => {
      if (controller.signal.aborted) {
        controller = new AbortController()
      }
    }

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

    const loadImage = async () => {
      if (src || loadingPending) return
      ensureController()
      loadingPending = true
      try {
        if (controller.signal.aborted) return

        const blobUrl = await fetchImageAsBlob('/api' + baseUrl, controller.signal)
        if (!blobUrl) {
          loadingPending = false
          return
        }
        if (controller.signal.aborted) {
          URL.revokeObjectURL(blobUrl)
          loadingPending = false
          return
        }
        const valid = await validateImageUrl(blobUrl, controller.signal)
        if (valid) {
          revoke = blobUrl
          loadingPending = false
          setSrc(blobUrl)
          return
        }
        URL.revokeObjectURL(blobUrl)
        loadingPending = false
      } catch {
        loadingPending = false
        setSrc('')
      }
    }

    if (loading === 'eager' || true) {
      loadImage()
    } else {
      const element = wrapperRef.current
      if (!element || typeof IntersectionObserver === 'undefined') {
        loadImage()
      } else {
        function getScrollableParent(node: HTMLElement | null): HTMLElement | null {
          while (node) {
            const style = window.getComputedStyle(node)
            const overflowY = style.overflowY
            if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
              return node
            }
            node = node.parentElement
          }
          return null
        }

        const scrollParent = getScrollableParent(element)
        const root = scrollParent || null
        const rootHeight = scrollParent ? scrollParent.clientHeight : window.innerHeight
        observer = new IntersectionObserver(
          entries => {
            const visible = entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0)
            if (visible) {
              loadImage()
            } else if (loadingPending) {
              controller.abort()
            }
          },
          { root: root, rootMargin: `${rootHeight}px` }
        )
        observer.observe(element)
      }
    }

    return () => {
      if (observer) {
        observer.disconnect()
      }
      controller.abort()
      cleanup()
    }
  }, [baseUrl, loading, src])

  if (src) {
    return <img src={src} alt="" loading={loading} style={style} />
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        background: '#e0e0e0',
        minHeight: style?.height ? undefined : 200,
        ...style,
      }}
    />
  )
}
