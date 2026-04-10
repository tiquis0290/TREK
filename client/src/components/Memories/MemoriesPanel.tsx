import { useState, useEffect } from 'react'
import { Camera } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useTripStore } from '../../store/tripStore'
import { useTranslation } from '../../i18n'
import { clearImageQueue } from '../../api/authUrl'
import { useToast } from '../shared/Toast'
import { AlbumPickerModal } from './modals/AlbumPickerModal.tsx'
import { PhotoPickerModal } from './modals/PhotoPickerModal.tsx'
import { MemoriesLightbox } from './modals/MemoriesLightbox.tsx'
import { deriveVisibleMemories } from './utils/selectors.ts'
import type { TripPhoto, MemoriesPanelProps } from './utils/types.ts'
import { PhotoGallery } from './components/PhotoGallery'
import { MemoriesHeader } from './components/MemoriesHeader.tsx'
import { useOverlay } from '../shared/Overlay.tsx'

// ── Main Component ──────────────────────────────────────────────────────────

export default function MemoriesPanel({ tripId, startDate, endDate }: MemoriesPanelProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const currentUser = useAuthStore(s => s.user)
  const [showPicker, setShowPicker] = useState(false)
  const [sortAsc, setSortAsc] = useState(true)
  const [locationFilter, setLocationFilter] = useState('')
  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')
  const [showAlbumPicker, setShowAlbumPicker] = useState(false)
  const [pickerDateFilter, setPickerDateFilter] = useState(true)

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

  const withLoadingTransition = (update: () => void, delayMs = 16) => {
    setLoadingContent(true)
    update()
    setTimeout(() => setLoadingContent(false), delayMs)
  }

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

  // ── Helpers ───────────────────────────────────────────────────────────────

  const { othersPhotos, allVisible, locations } = deriveVisibleMemories({
    tripPhotos,
    currentUserId: currentUser?.id,
    locationFilter,
    sortAsc,
  })

  // ── Init ──────────────────────────────────────────────────────────────────

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

  const openPicker = () => {
    clearImageQueue()
    setPickerDateFilter(!!(startDate && endDate))
    setShowPicker(true)
  }

  // ── Album Picker ──────────────────────────────────────────────────────────

  const openAlbumPicker = () => {
    clearImageQueue()
    setShowAlbumPicker(true)
  }
  // ── Helpers ───────────────────────────────────────────────────────────────

  const panelFontStyle: React.CSSProperties = {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
  }




  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', ...panelFontStyle }}>
        <div className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
      </div>
    )
  }

  // ── Not connected ─────────────────────────────────────────────────────────

  if (!connected && allVisible.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '40px', textAlign: 'center', ...panelFontStyle }}>
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
      <div style={{ height: '100%', ...panelFontStyle }}>
        <AlbumPickerModal
          availableProviders={availableProviders}
          tripId={tripId}
          selectedProvider={selectedProvider}
          onSelectProvider={setSelectedProvider}
          albumLinks={albumLinks}
          onReloadAlbumLinks={handleReloadAlbumLinks}
          onSyncAlbum={handleSyncAlbum}
          onClose={async () => {
            withLoadingTransition(() => setShowAlbumPicker(false), 5)
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
        withLoadingTransition(() => setShowPicker(false), 5)
      }}
    />
  }

  // ── Main Gallery ──────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', ...panelFontStyle }}>
      <PhotoGallery
        allVisible={allVisible}
        currentUser={currentUser}
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
            withLoadingTransition(() => setSortAsc(prev => !prev))
          }}
          groupBy={groupBy}
          onGroupByChange={nextGroupBy => {
            withLoadingTransition(() => setGroupBy(nextGroupBy))
          }}
          locationFilter={locationFilter}
          onLocationFilterChange={value => {
            withLoadingTransition(() => setLocationFilter(value))
          }}
          locations={locations}
        />}
        isOffline={isOffline}
        canAddPhotos={true}
        loadingContent={loadingContent}
        groupBy={groupBy}
        sortOrder={sortAsc ? 'oldest' : 'newest'}
      />
    </div>
  )
}
