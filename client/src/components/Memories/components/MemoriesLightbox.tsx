import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Info, MapPin, X } from 'lucide-react'
import apiClient from '../../../api/client'
import { fetchImageAsBlob } from '../../../api/authUrl'
import { buildProviderAssetMemoriesUrl } from '../urlBuilders'
import type { TripPhoto } from '../types'

interface MemoriesLightboxProps {
  allVisible: TripPhoto[]
  tripId: number
  initialPhoto: TripPhoto | null
  onClose: () => void
}

export function MemoriesLightbox({
  allVisible,
  tripId,
  initialPhoto,
  onClose,
}: MemoriesLightboxProps) {
  const touchStartX = useRef<number | null>(null)
  const currentIndex = useRef<number>(-1)
  const [lightboxInfo, setLightboxInfo] = useState<any>(null)
  const [lightboxInfoLoading, setLightboxInfoLoading] = useState(false)
  const [lightboxOriginalSrc, setLightboxOriginalSrc] = useState('')
  const [lightboxImageLoading, setLightboxImageLoading] = useState(false)
  const [showMobileInfo, setShowMobileInfo] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [currentPhoto, setCurrentPhoto] = useState<TripPhoto | null>(initialPhoto)

  const imageCacheRef = useRef<Record<string, string>>({})
  const infoCacheRef = useRef<Record<string, any>>({})
  const pendingImageFetches = useRef<Record<string, Promise<void>>>({})
  const pendingInfoFetches = useRef<Record<string, Promise<void>>>({})
  const pendingImageControllers = useRef<Record<string, AbortController>>({})
  const lastNavigation = useRef<'prev' | 'next' | null>(null)

  const mobileInfoRef = useRef<HTMLDivElement | null>(null)

  const getPhotoKey = (photo: TripPhoto) => `${photo.provider}::${photo.asset_id}::${photo.user_id}`


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

  const prefetchPhoto = (photo: TripPhoto, index: number, direction: -1 | 1) => {
    const key = getPhotoKey(photo)

    if (!imageCacheRef.current[key]) {
      if (!pendingImageFetches.current[key]) {
        const controller = new AbortController()
        pendingImageControllers.current[key] = controller
        pendingImageFetches.current[key] = fetchImageAsBlob('/api' + buildProviderAssetMemoriesUrl(tripId, photo, 'preview'), controller.signal)
          .then(blobUrl => {
            if (blobUrl && validateImageUrl(blobUrl, controller.signal)) imageCacheRef.current[key] = blobUrl
            else if (blobUrl) URL.revokeObjectURL(blobUrl)
            const newIndex = index + direction
            if (currentIndex.current > -1 && Math.abs(currentIndex.current - newIndex) < 4) prefetchPhoto(allVisible[newIndex], newIndex, direction)
          })
          .catch(() => undefined)
          .finally(() => {
            delete pendingImageFetches.current[key]
            delete pendingImageControllers.current[key]
          })
      }
    }
    else {
      const newIndex = index + direction
      if (currentIndex.current > -1 && Math.abs(currentIndex.current - newIndex) < 4) prefetchPhoto(allVisible[newIndex], newIndex, direction)
    }

    if (!infoCacheRef.current[key]) {
      if (!pendingInfoFetches.current[key]) {
        pendingInfoFetches.current[key] = apiClient.get(buildProviderAssetMemoriesUrl(tripId, photo, 'info'))
          .then(r => {
            infoCacheRef.current[key] = r.data
          })
          .catch(() => {
            infoCacheRef.current[key] = null
          })
          .finally(() => { delete pendingInfoFetches.current[key] })
      }
    }
  }

  useEffect(() => {
    lastNavigation.current = null
    setCurrentPhoto(initialPhoto)
  }, [initialPhoto])

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])


  const hasPrev = currentIndex.current > 0
  const hasNext = currentIndex.current < allVisible.length - 1

  useEffect(() => {
    if (!currentPhoto) return
    const index = currentPhoto
      ? allVisible.findIndex(p => p.provider === currentPhoto.provider && p.asset_id === currentPhoto.asset_id && p.user_id === currentPhoto.user_id)
      : -1
    currentIndex.current = index
    if (index < 0) {
      setCurrentPhoto(null)
      onClose()
    }
  }, [currentPhoto, allVisible, onClose])

  useEffect(() => {
    if (!currentPhoto) return

    const key = getPhotoKey(currentPhoto)

    const index = currentIndex.current
    const prefetchNeighbors = () => {
      const prevPhoto = allVisible[currentIndex.current - 1]
      const nextPhoto = allVisible[currentIndex.current + 1]
      if (prevPhoto) prefetchPhoto(prevPhoto, currentIndex.current - 1, -1)
      if (nextPhoto) prefetchPhoto(nextPhoto, currentIndex.current + 1, +1)
    }

    setLightboxInfo(infoCacheRef.current[key] ?? null)
    setLightboxInfoLoading(!infoCacheRef.current[key])
    setLightboxOriginalSrc(imageCacheRef.current[key] ?? '')
    setLightboxImageLoading(!imageCacheRef.current[key])

    if (!imageCacheRef.current[key]) {
      Object.entries(pendingImageControllers.current).filter(([controllerKey]) => controllerKey !== key).forEach(([, controller]) => controller.abort())
      if (!pendingImageFetches.current[key]) {
        const controller = new AbortController()
        pendingImageControllers.current[key] = controller
        pendingImageFetches.current[key] = fetchImageAsBlob('/api' + buildProviderAssetMemoriesUrl(tripId, currentPhoto, 'preview'), controller.signal)
          .then(blobUrl => {
            if (blobUrl && validateImageUrl(blobUrl, controller.signal)) imageCacheRef.current[key] = blobUrl
            else if (blobUrl) URL.revokeObjectURL(blobUrl)
          })
          .catch(() => undefined)
          .finally(() => {
            delete pendingImageFetches.current[key]
            delete pendingImageControllers.current[key]
          })
      }
      pendingImageFetches.current[key]
        .then(() => {
          const blobUrl = imageCacheRef.current[key]
          if (index === currentIndex.current && blobUrl) {
            setLightboxOriginalSrc(blobUrl)
            setLightboxImageLoading(false)
            prefetchNeighbors()
          }
        })
        .catch(() => {
          if (index === currentIndex.current) {
            setLightboxOriginalSrc('')
            setLightboxImageLoading(false)
          }
        })
    } else {
      const blobUrl = imageCacheRef.current[key]
      if (index === currentIndex.current && blobUrl) {
        setLightboxOriginalSrc(blobUrl)
        setLightboxImageLoading(false)
        prefetchNeighbors()
      }
    }

    if (!infoCacheRef.current[key]) {
      if (!pendingInfoFetches.current[key]) {
        pendingInfoFetches.current[key] = apiClient.get(buildProviderAssetMemoriesUrl(tripId, currentPhoto, 'info'))
          .then(r => {
            infoCacheRef.current[key] = r.data
          })
          .catch(() => {
            infoCacheRef.current[key] = null
          })
          .finally(() => { delete pendingInfoFetches.current[key] })
      }
      pendingInfoFetches.current[key].then(() => {
        const data = infoCacheRef.current[key]
        if (index === currentIndex.current) setLightboxInfo(data)
      })
        .catch(() => {
          infoCacheRef.current[key] = null
          if (index === currentIndex.current) setLightboxInfo(null)
        })
        .finally(() => { if (index === currentIndex.current) setLightboxInfoLoading(false) })
    }
  }, [currentPhoto, currentIndex, tripId, allVisible])

  useEffect(() => {
    return () => {
      Object.values(imageCacheRef.current).forEach(URL.revokeObjectURL)
    }
  }, [])

  if (!currentPhoto) return null

  const closeLightbox = () => {
    currentIndex.current = -1
    Object.values(pendingImageControllers.current).forEach(controller => controller.abort())
    setCurrentPhoto(null)
    onClose()
  }

  const goPrev = () => {
    const photo = allVisible[currentIndex.current - 1]
    if (photo) {
      lastNavigation.current = 'prev'
      setCurrentPhoto(photo)
    }
  }

  const goNext = () => {
    const photo = allVisible[currentIndex.current + 1]
    if (photo) {
      lastNavigation.current = 'next'
      setCurrentPhoto(photo)
    }
  }

  const exifContent = lightboxInfo ? (
    <>
      {lightboxInfo.takenAt && (
        <div>
          <div
            style={{
              fontSize: '0.2381cm',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: '0.0794cm',
            }}
          >
            Date
          </div>
          <div style={{ fontSize: '0.3440cm', fontWeight: 600 }}>
            {new Date(lightboxInfo.takenAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div style={{ fontSize: '0.2910cm', color: 'rgba(255,255,255,0.5)' }}>
            {new Date(lightboxInfo.takenAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      )}
      {(lightboxInfo.city || lightboxInfo.country) && (
        <div>
          <div
            style={{
              fontSize: '0.2381cm',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: '0.0794cm',
            }}
          >
            <MapPin size={9} style={{ display: 'inline', verticalAlign: '-0.0265cm', marginRight: 3 }} />
            Location
          </div>
          <div style={{ fontSize: '0.3440cm', fontWeight: 600 }}>{[lightboxInfo.city, lightboxInfo.state, lightboxInfo.country].filter(Boolean).join(', ')}</div>
        </div>
      )}
      {lightboxInfo.camera && (
        <div>
          <div
            style={{
              fontSize: '0.2381cm',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: '0.0794cm',
            }}
          >
            Camera
          </div>
          <div style={{ fontSize: '0.3175cm', fontWeight: 500 }}>{lightboxInfo.camera}</div>
          {lightboxInfo.lens && <div style={{ fontSize: '0.2910cm', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{lightboxInfo.lens}</div>}
        </div>
      )}
      {(lightboxInfo.focalLength || lightboxInfo.aperture || lightboxInfo.iso) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {lightboxInfo.focalLength && (
            <div>
              <div style={{ fontSize: '0.2381cm', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Focal</div>
              <div style={{ fontSize: '0.3440cm', fontWeight: 700 }}>{lightboxInfo.focalLength}</div>
            </div>
          )}
          {lightboxInfo.aperture && (
            <div>
              <div style={{ fontSize: '0.2381cm', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aperture</div>
              <div style={{ fontSize: '0.3440cm', fontWeight: 700 }}>{lightboxInfo.aperture}</div>
            </div>
          )}
          {lightboxInfo.shutter && (
            <div>
              <div style={{ fontSize: '0.2381cm', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shutter</div>
              <div style={{ fontSize: '0.3440cm', fontWeight: 700 }}>{lightboxInfo.shutter}</div>
            </div>
          )}
          {lightboxInfo.iso && (
            <div>
              <div style={{ fontSize: '0.2381cm', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ISO</div>
              <div style={{ fontSize: '0.3440cm', fontWeight: 700 }}>{lightboxInfo.iso}</div>
            </div>
          )}
        </div>
      )}
      {(lightboxInfo.width || lightboxInfo.fileName) && (
        <div style={{ borderTop: '0.0265cm solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
          {lightboxInfo.width && lightboxInfo.height && (
            <div style={{ fontSize: '0.2910cm', color: 'rgba(255,255,255,0.4)', marginBottom: 3 }}>
              {lightboxInfo.width} x {lightboxInfo.height}
            </div>
          )}
          {lightboxInfo.fileSize && <div style={{ fontSize: '0.2910cm', color: 'rgba(255,255,255,0.4)' }}>{(lightboxInfo.fileSize / 1024 / 1024).toFixed(1)} MB</div>}
        </div>
      )}
    </>
  ) : null

  return (
    <div
      onClick={closeLightbox}
      onKeyDown={e => {
        if (e.key === 'ArrowLeft' && hasPrev) goPrev()
        if (e.key === 'ArrowRight' && hasNext) goNext()
        if (e.key === 'Escape') closeLightbox()
      }}
      tabIndex={0}
      ref={el => el?.focus()}
      onTouchStart={e => {
        touchStartX.current = e.touches[0].clientX
      }}
      onTouchEnd={e => {
        const start = touchStartX.current
        if (start == null) return
        const diff = e.changedTouches[0].clientX - start
        if (diff > 60 && hasPrev) goPrev()
        else if (diff < -60 && hasNext) goNext()
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        outline: 'none',
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'auto',
      }}
    >
      <button
        onClick={closeLightbox}
        style={{
          position: 'absolute',
          top: '0.4233cm',
          right: '0.4233cm',
          zIndex: 10,
          width: '1.0583cm',
          height: '1.0583cm',
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <X size={20} color="white" />
      </button>

      {allVisible.length > 1 && (
        <div style={{ position: 'absolute', top: '0.5292cm', left: '0.5292cm', zIndex: 10, fontSize: '0.3175cm', color: 'rgba(255,255,255,0.5)' }}>
          {currentIndex.current + 1} / {allVisible.length}
        </div>
      )}

      {isMobile && hasPrev && (
        <button
          onClick={e => {
            e.stopPropagation()
            goPrev()
          }}
          style={{
            position: 'absolute',
            left: '0.3175cm',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            background: 'rgba(0,0,0,0.5)',
            border: 'none',
            borderRadius: '50%',
            width: '1.0583cm',
            height: '1.0583cm',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.8)',
          }}
        >
          <ChevronLeft size={22} />
        </button>
      )}

      {isMobile && hasNext && (
        <button
          onClick={e => {
            e.stopPropagation()
            goNext()
          }}
          style={{
            position: 'absolute',
            right: isMobile ? 12 : 280,
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            background: 'rgba(0,0,0,0.5)',
            border: 'none',
            borderRadius: '50%',
            width: '1.0583cm',
            height: '1.0583cm',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.8)',
          }}
        >
          <ChevronRight size={22} />
        </button>
      )}

      {(lightboxInfo || lightboxInfoLoading) && (
        <button
          onClick={e => {
            e.stopPropagation()
            setShowMobileInfo(prev => !prev)
          }}
          style={{
            position: 'absolute',
            top: '0.4233cm',
            right: '1.7992cm',
            zIndex: 10,
            width: '1.0583cm',
            height: '1.0583cm',
            borderRadius: '50%',
            background: showMobileInfo ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Info size={20} color="white" />
        </button>
      )}

      <div
        onClick={e => {
          if (e.target === e.currentTarget) closeLightbox()
        }}
        style={{ display: 'flex', gap: '0.4233cm', alignItems: 'center', justifyContent: 'center', padding: '0.5292cm', width: '100%', height: '100%' }}
      >
        {!isMobile && (hasPrev ? (
          <button
            onClick={e => {
              e.stopPropagation()
              goPrev()
            }}
            style={{
              zIndex: 10,
              background: 'rgba(0,0,0,0.5)',
              border: 'none',
              borderRadius: '50%',
              width: '1.0583cm',
              height: '1.0583cm',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.8)',
              flexShrink: 0,
            }}
          >
            <ChevronLeft size={22} />
          </button>
        ) : (
          <div aria-hidden style={{ width: '1.0583cm', height: '1.0583cm', flexShrink: 0 }} />
        ))}

        <div
          style={{
            flex: 1,
            minWidth: '0cm',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {lightboxImageLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: 'white' }} />
            </div>
          )}
          {!lightboxImageLoading && lightboxOriginalSrc && (
            <img
              src={lightboxOriginalSrc}
              alt=""
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                borderRadius: '0.2646cm',
                cursor: 'default',
              }}
            />
          )}
        </div>

        {!isMobile && (hasNext ? (
          <button
            onClick={e => {
              e.stopPropagation()
              goNext()
            }}
            style={{
              zIndex: 10,
              background: 'rgba(0,0,0,0.5)',
              border: 'none',
              borderRadius: '50%',
              width: '1.0583cm',
              height: '1.0583cm',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.8)',
              flexShrink: 0,
            }}
          >
            <ChevronRight size={22} />
          </button>
        ) : (
          <div aria-hidden style={{ width: '1.0583cm', height: '1.0583cm', flexShrink: 0 }} />
        ))}

        {!isMobile && showMobileInfo && (
          <div
            style={{
              width: '6.3500cm',
              flexShrink: 0,
              borderRadius: '0.4233cm',
              padding: '0.4763cm',
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(0.5292cm)',
              WebkitBackdropFilter: 'blur(0.5292cm)',
              border: '0.0265cm solid rgba(255,255,255,0.12)',
              color: 'white',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.3704cm',
              maxHeight: '100%',
              overflowY: 'auto',
            }}
          >
            {lightboxInfoLoading && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: 'white' }} />
              </div>
            )}
            {exifContent}
          </div>
        )}

      </div>

      {isMobile && showMobileInfo && (
        <div
          ref={mobileInfoRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: '0cm',
            left: '0cm',
            right: '0cm',
            zIndex: 5,
            maxHeight: '60vh',
            overflowY: 'auto',
            borderRadius: '0.4233cm 0.4233cm 0 0',
            padding: '0.4763cm',
            background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(0.5292cm)',
            WebkitBackdropFilter: 'blur(0.5292cm)',
            border: '0.0265cm solid rgba(255,255,255,0.12)',
            borderBottom: 'none',
            color: 'white',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3704cm',
          }}
        >
          {lightboxInfoLoading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: 'white' }} />
            </div>
          )}
          {exifContent}
        </div>
      )}
    </div>
  )
}
