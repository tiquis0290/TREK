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
    let canceled = false
    let observer: IntersectionObserver | null = null

    const cleanup = () => {
      if (revoke) {
        URL.revokeObjectURL(revoke)
        revoke = ''
      }
    }

    const loadImage = async () => {
      if (canceled || src) return
      try {
        const blobUrl = await fetchImageAsBlob('/api' + baseUrl)
        if (!canceled) {
          revoke = blobUrl
          setSrc(blobUrl)
        }
      } catch {
        // ignore failures; leave placeholder visible
      }
    }

    if (loading === 'eager') {
      loadImage()
    } else {
      const element = wrapperRef.current
      if (!element || typeof IntersectionObserver === 'undefined') {
        loadImage()
      } else {
        // Find the nearest scrollable parent
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
            if (entries.some(entry => entry.isIntersecting || entry.intersectionRatio > 0)) {
              loadImage()
              if (observer && element) {
                observer.unobserve(element)
              }
            }
          },
          { root: root, rootMargin: `${rootHeight * 2}px` }
        )
        observer.observe(element)
      }
    }

    return () => {
      canceled = true
      if (observer && wrapperRef.current) {
        observer.disconnect()
      }
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
