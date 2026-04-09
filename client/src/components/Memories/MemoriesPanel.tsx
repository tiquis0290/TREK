import { useState, useEffect } from 'react'
import { Camera } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useTripStore } from '../../store/tripStore'
import { useTranslation } from '../../i18n'
import { clearImageQueue } from '../../api/authUrl'
import { useToast } from '../shared/Toast'
import { AlbumPickerModal } from './components/AlbumPickerModal'
import { PhotoPickerModal } from './components/PhotoPickerModal'
import { MemoriesLightbox } from './components/MemoriesLightbox'
import { deriveVisibleMemories } from './selectors'
import type { TripPhoto, MemoriesPanelProps } from './types'
import { PhotoGallery } from './components/PhotoGallery'
import { MemoriesHeader } from './components/MemoriesHeader.tsx'
import { useState as useReactState } from 'react';
import { useOverlay } from '../shared/Overlay.tsx'

// ── Main Component ──────────────────────────────────────────────────────────

export default function MemoriesPanel({ tripId, startDate, endDate }: MemoriesPanelProps) {
  const { t } = useTranslation()
  const overlay = useOverlay()
  const toast = useToast()
  const currentUser = useAuthStore(s => s.user)

  const {
    enabledProviders,
    availableProviders,
    selectedProvider,
    connected,
    loading,
    loadingContent,
    isOffline,
    tripPhotos,
    albumLinks,
    syncing,
    loadInitial,
    loadContent,
    loadAlbumLinks,
    syncAlbum,
    unlinkAlbum,
    setSelectedProvider,
    setTripPhotos,
    setLoadingContent,
  } = useTripStore(s => ({
    enabledProviders: s.enabledProviders,
    availableProviders: s.availableProviders,
    selectedProvider: s.selectedProvider,
    connected: s.connected,
    loading: s.loading,
    loadingContent: s.loadingContent,
    isOffline: s.isOffline,
    tripPhotos: s.tripPhotos,
    albumLinks: s.albumLinks,
    syncing: s.syncing,
    loadInitial: s.loadInitial,
    loadContent: s.loadContent,
    loadAlbumLinks: s.loadAlbumLinks,
    syncAlbum: s.syncAlbum,
    unlinkAlbum: s.unlinkAlbum,
    setSelectedProvider: s.setSelectedProvider,
    setTripPhotos: s.setTripPhotos,
    setLoadingContent: s.setLoadingContent,
  }))

  // Photo picker
  const [showPicker, setShowPicker] = useState(false)

  // Filters & sort
  const [sortAsc, setSortAsc] = useState(true)
  const [locationFilter, setLocationFilter] = useState('')
  // Sorting/grouping for gallery
  const [groupBy, setGroupBy] = useReactState<'day' | 'week' | 'month'>('day');

  // Album linking
  const [showAlbumPicker, setShowAlbumPicker] = useState(false)

  // Lightbox
  const [lightboxPhoto, setLightbox] = useState<TripPhoto | null>(null)

  const handleSyncAlbum = async (linkId: number, provider?: string) => {
    if (isOffline) {
      toast.error(t('memories.error.offline') || 'Offline mode: action unavailable')
      return
    }
    try {
      await syncAlbum(tripId, linkId, provider)
    } catch {
      toast.error(t('memories.error.syncAlbum'))
    }
  }

  const handleUnlinkAlbum = async (linkId: number) => {
    if (isOffline) {
      toast.error(t('memories.error.offline'))
      return
    }
    try {
      await unlinkAlbum(tripId, linkId)
    } catch {
      toast.error(t('memories.error.unlinkAlbum'))
    }
  }

  const handleReloadAlbumLinks = async () => {
    return await loadAlbumLinks(tripId)
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    overlay.show(lightboxPhoto ? <MemoriesLightbox
        allVisible={allVisible}
        tripId={tripId}
        initialPhoto={lightboxPhoto}
        onClose={() => setLightbox(null)}
      />: null)
  }, [lightboxPhoto])


  useEffect(() => {
    loadInitial(tripId)
    // WebSocket: reload photos when another user adds/removes/shares
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: number }>).detail
      if (detail?.userId && currentUser?.id === detail.userId) {
        return
      }
      loadContent(tripId)
    }
    window.addEventListener('memories:updated', handler)
    return () => {
      window.removeEventListener('memories:updated', handler);
      // clear pending images
      clearImageQueue();
    }
  }, [tripId, currentUser?.id])


  // ── Photo Picker ──────────────────────────────────────────────────────────

  const [pickerDateFilter, setPickerDateFilter] = useState(true)

  const openPicker = () => {
    clearImageQueue();
    setPickerDateFilter(!!(startDate && endDate))
    setShowPicker(true)
  }

  // ── Album Picker ──────────────────────────────────────────────────────────

  const openAlbumPicker = async () => {
    clearImageQueue();
    setShowAlbumPicker(true)
  }
  // ── Helpers ───────────────────────────────────────────────────────────────

  const { othersPhotos, allVisible, locations } = deriveVisibleMemories({
    tripPhotos,
    currentUserId: currentUser?.id,
    locationFilter,
    sortAsc,
  })

  const font: React.CSSProperties = {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
  }




  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', ...font }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
      </div>
    )
  }

  // ── Not connected ─────────────────────────────────────────────────────────

  if (!connected && allVisible.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px', textAlign: 'center', ...font }}>
        <Camera size={40} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
        <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('memories.notConnected', { provider_name: enabledProviders.length === 1 ? enabledProviders[0]?.name : 'Photo provider' })}
        </h3>
        <p style={{ margin: '0px', fontSize: '13px', color: 'var(--text-muted)', maxWidth: 300 }}>
          {enabledProviders.length === 1 ? t('memories.notConnectedHint', { provider_name: enabledProviders[0]?.name }) : t('memories.notConnectedMultipleHint', { provider_names: enabledProviders.map(p => p.name).join(', ') })}
        </p>
      </div>
    )
  }

  if (showAlbumPicker) {
    return (
      <div style={{ height: '100%', ...font }}>
        <AlbumPickerModal
          availableProviders={availableProviders}
          tripId={tripId}
          selectedProvider={selectedProvider}
          onSelectProvider={setSelectedProvider}
          albumLinks={albumLinks}
          onReloadAlbumLinks={handleReloadAlbumLinks}
          onSyncAlbum={handleSyncAlbum}
          onClose={async () => {
            setLoadingContent(true);
            setShowAlbumPicker(false);
            await new Promise<void>(resolve => setTimeout(resolve, 5));
            setLoadingContent(false);
          }}
        />
      </div>
    )
  }

  if (showPicker) {
    return <PhotoPickerModal
      availableProviders={availableProviders}
      selectedProvider={selectedProvider}
      onSelectProvider={setSelectedProvider}
      startDate={startDate}
      endDate={endDate}
      pickerDateFilter={pickerDateFilter}
      onSetPickerDateFilter={setPickerDateFilter}
      tripPhotos={tripPhotos}
      currentUserId={currentUser?.id}
      tripId={tripId}
      onAdded={async () => {
        setShowPicker(false)
        clearImageQueue()
        await loadContent(tripId)
      }}
      onClose={async () => {
        setLoadingContent(true);
        setShowPicker(false);
        await new Promise<void>(resolve => setTimeout(resolve, 5));
        setLoadingContent(false);
      }}
    />
  }

  // ── Main Gallery ──────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', ...font }}>
      <PhotoGallery
        allVisible={allVisible}
        currentUser={currentUser}
        openLightbox={setLightbox}
        openPicker={openPicker}
        setTripPhotos={setTripPhotos}
        tripId={tripId}
        header={<MemoriesHeader
          connected={connected}
          openAlbumPicker={openAlbumPicker}
          openPicker={openPicker}
          albumLinks={albumLinks}
          syncing={syncing}
          syncAlbum={handleSyncAlbum}
          unlinkAlbum={handleUnlinkAlbum}
          currentUser={currentUser}
          allVisibleCount={allVisible.length}
          othersCount={othersPhotos.length}
          sortAsc={sortAsc}
          onSortToggle={() => {
            setLoadingContent(true)
            setSortAsc(!sortAsc)
            setTimeout(() => setLoadingContent(false), 16)
          }}
          groupBy={groupBy}
          onGroupByChange={groupBy => {
            setLoadingContent(true)
            setGroupBy(groupBy)
            setTimeout(() => setLoadingContent(false), 16)
          }}
          locationFilter={locationFilter}
          onLocationFilterChange={value => {
            setLoadingContent(true)
            setLocationFilter(value)
            setTimeout(() => setLoadingContent(false), 16)
          }}
          locations={locations}
        />}
        isOffline={isOffline}
        loadingContent={loadingContent}
        groupBy={groupBy}
        sortOrder={sortAsc ? 'oldest' : 'newest'}
      />
    </div>
  )
}
