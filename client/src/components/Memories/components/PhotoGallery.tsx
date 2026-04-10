import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type UIEvent } from 'react'
import { Camera, Plus } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import apiClient from '../../../api/client'
import useToast from '../../shared/Toast'
import { User } from '../../../types'
import { PhotoSection } from './PhotoSection'
import { TripPhoto } from '../utils/types'
import { buildUnifiedMemoriesUrl } from '../utils/urlBuilders'
import { getPhotoTimestamp, getGroupLabel } from '../utils/dateGrouping'
import useOverlay from '../../shared/Overlay'
import { MemoriesLightbox } from '../modals/MemoriesLightbox'

interface PhotoGalleryProps {
  allVisible: TripPhoto[]
  currentUser: User | null
  openPicker: () => void
  setTripPhotos: React.Dispatch<React.SetStateAction<TripPhoto[]>>
  tripId: number
  groupBy: 'day' | 'week' | 'month'
  sortOrder: 'newest' | 'oldest'
  selectionEnabled?: boolean
  selectedIds?: Set<string>
  disabledIds?: Set<string>
  onToggleSelect?: (key: string) => void
  onToggleSelectGroup?: (keys: string[], oldState: boolean) => void
  header?: ReactNode
  loadingContent?: boolean
  loadingMore?: boolean
  itemMinSize?: number
  scrollRef?: MutableRefObject<HTMLDivElement | null>
  onscroll?: (event: UIEvent<HTMLDivElement>) => void
  canAddPhotos?: boolean
  afterItems?: ReactNode
  isOffline?: boolean
}



export function PhotoGallery(p: PhotoGalleryProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const overlay = useOverlay()

  // ── Lightbox ─────────────────────────────────────────────────────────────

   const [lightboxPhoto, setLightboxPhoto] = useState<TripPhoto | null>(null)

  useEffect(() => {
    overlay.show(lightboxPhoto ? <MemoriesLightbox
        allVisible={p.allVisible}
        tripId={p.tripId}
        initialPhoto={lightboxPhoto}
        onClose={() => setLightboxPhoto(null)}
      />: null)
  }, [overlay, lightboxPhoto, p.allVisible, p.tripId])

  // ── Remove photo ──────────────────────────────────────────────────────────

  const removePhoto = async (photo: TripPhoto) => {
    if (p.isOffline) {
      toast.error(t('memories.error.offline') || 'Offline mode: action unavailable')
      return
    }

    try {
      await apiClient.delete(buildUnifiedMemoriesUrl(p.tripId, 'photos'), {
        data: {
          asset_id: photo.asset_id,
          provider: photo.provider,
        },
      })
      p.setTripPhotos(prev => prev.filter(item => !(item.provider === photo.provider && item.asset_id === photo.asset_id && item.user_id === photo.user_id)))
    } catch { toast.error(t('memories.error.removePhoto')) }
  }

  // ── Toggle sharing ────────────────────────────────────────────────────────

  const toggleSharing = async (photo: TripPhoto, shared: boolean) => {
    if (p.isOffline) {
      toast.error(t('memories.error.offline') || 'Offline mode: action unavailable')
      return
    }

    try {
      await apiClient.put(buildUnifiedMemoriesUrl(p.tripId, 'photos', 'sharing'), {
        shared,
        asset_id: photo.asset_id,
        provider: photo.provider,
      })
      p.setTripPhotos(prev => prev.map(item =>
        item.provider === photo.provider && item.asset_id === photo.asset_id && item.user_id === photo.user_id
          ? { ...item, shared: shared ? 1 : 0 }
          : item
      ))
    } catch { toast.error(t('memories.error.toggleSharing')) }
  }

  const { groupedPhotos, groupKeys } = useMemo(() => {
    const sortedPhotos = [...p.allVisible].sort((a, b) => {
      const aTimestamp = getPhotoTimestamp(a)
      const bTimestamp = getPhotoTimestamp(b)
      return p.sortOrder === 'newest' ? bTimestamp - aTimestamp : aTimestamp - bTimestamp
    })

    const groupedMap = new Map<string, TripPhoto[]>()
    for (const photo of sortedPhotos) {
      const groupLabel = getGroupLabel(photo, p.groupBy)
      const existingGroup = groupedMap.get(groupLabel)
      if (existingGroup) {
        existingGroup.push(photo)
      } else {
        groupedMap.set(groupLabel, [photo])
      }
    }

    return {
      groupedPhotos: Object.fromEntries(groupedMap),
      groupKeys: Array.from(groupedMap.keys()),
    }
  }, [p.allVisible, p.groupBy, p.sortOrder])

  const [top, setTop] = useState(true)
  const [scrolling, setScrolling] = useState(false)
  const [visible, setVisible] = useState(true)

  const lastScrollTop = useRef(0)
  const ref = p.scrollRef || useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const currentScrollTop = event.currentTarget.scrollTop
    const headerHeight = headerRef.current?.offsetHeight ?? 0
    const isAtTop = currentScrollTop === 0
    const isInHeaderRange = currentScrollTop < headerHeight

    setScrolling(!isAtTop)
    setTop(top ? isInHeaderRange : isAtTop)
    setVisible(top || lastScrollTop.current > currentScrollTop)

    lastScrollTop.current = currentScrollTop
    p.onscroll?.(event)
  }

  return (
    <div style={{ overflowY: 'auto', height: '100%' }} ref={ref} onScroll={onScroll}>
      <div ref={headerRef}
        style={{
          top: 0,
          zIndex: 8,
          position: top ? 'relative' : 'sticky',
          transform: visible ? 'translateY(0)' : 'translateY(-100%)',
          transition: scrolling ? 'transform 200ms ease-in-out' : 'transform 0ms',
        }}>
        {p.header}
      </div>
      {p.loadingContent ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
        </div>
      ) : p.allVisible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Camera size={40} style={{ color: 'var(--text-faint)', margin: '0 auto 12px', display: 'block' }} />
          <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
            {t('memories.noPhotos')}
          </p>
          {p.canAddPhotos && <button onClick={p.openPicker}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '9px 18px', borderRadius: '10px',
              border: 'none', background: 'var(--text-primary)', color: 'var(--bg-primary)',
              fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            <Plus size={15} /> {t('memories.addPhotos')}
          </button>}
          {p.afterItems}
        </div>
      ) : (
        <>
          {groupKeys.map(key => (
            <PhotoSection
              key={key}
              sectionKey={key}
              photos={groupedPhotos[key]}
              disabledIds={p.disabledIds}
              selectedIds={p.selectedIds}
              onToggleSelect={p.onToggleSelect}
              onToggleSelectGroup={p.onToggleSelectGroup}
              tripId={p.tripId}
              currentUser={p.currentUser}
              openLightbox={setLightboxPhoto}
              itemMinSize={p.itemMinSize}
              onToggleSharing={toggleSharing}
              onRemovePhoto={removePhoto}
            />
          ))}
          {p.loadingMore && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
              <div
                className="w-7 h-7 border-2 rounded-full animate-spin"
                style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }}
              />
            </div>
          )}
          {p.afterItems}
        </>
      )}
    </div>
  )
}
