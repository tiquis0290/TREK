import { useState, useEffect } from 'react'
import apiClient, { addonsApi } from '../../api/client'
import { Camera } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useTranslation } from '../../i18n'
import { clearImageQueue } from '../../api/authUrl'
import { useToast } from '../shared/Toast'
import { AlbumPickerModal } from './components/AlbumPickerModal'
import { PhotoPickerModal } from './components/PhotoPickerModal'
import { MemoriesLightbox } from './components/MemoriesLightbox'
import { deriveVisibleMemories } from './selectors'
import type { PhotoProvider, TripPhoto, MemoriesPanelProps, AlbumLink } from './types'
import { PhotoGallery } from './components/PhotoGallery'
import { MemoriesHeader } from './components/MemoriesHeader.tsx'
import { useState as useReactState } from 'react';
import { buildProviderMemoriesUrl, buildUnifiedMemoriesUrl } from './urlBuilders.ts'

// ── Main Component ──────────────────────────────────────────────────────────

export default function MemoriesPanel({ tripId, startDate, endDate }: MemoriesPanelProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const currentUser = useAuthStore(s => s.user)

  const [connected, setConnected] = useState(false)
  const [enabledProviders, setEnabledProviders] = useState<PhotoProvider[]>([])
  const [availableProviders, setAvailableProviders] = useState<PhotoProvider[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadingContent, setLoadingContent] = useState(true)
  // Trip photos (saved selections)
  const [tripPhotos, setTripPhotos] = useState<TripPhoto[]>([])

  // Photo picker
  const [showPicker, setShowPicker] = useState(false)

  // Filters & sort
  const [sortAsc, setSortAsc] = useState(true)
  const [locationFilter, setLocationFilter] = useState('')
  // Sorting/grouping for gallery
  const [groupBy, setGroupBy] = useReactState<'day' | 'week' | 'month'>('day');

  // Album linking
  const [showAlbumPicker, setShowAlbumPicker] = useState(false)
  const [albumLinks, setAlbumLinks] = useState<AlbumLink[]>([])
  const [syncing, setSyncing] = useState<number | null>(null)

  // Lightbox
  const [lightboxPhoto, setLightbox] = useState<TripPhoto | null>(null)

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadInitial()
    // WebSocket: reload photos when another user adds/removes/shares
    const handler = () => loadContent()
    window.addEventListener('memories:updated', handler)
    return () => {
      window.removeEventListener('memories:updated', handler);
      // clear pending images
      clearImageQueue();
    }
  }, [tripId])


  const loadInitial = async () => {
    setLoading(true)
    try {
      const addonsRes = await addonsApi.enabled().catch(() => ({ addons: [] as any[] }))
      const enabledAddons = addonsRes?.addons || []
      const photoProviders = enabledAddons.filter((a: any) => a.type === 'photo_provider' && a.enabled)

      setEnabledProviders(photoProviders.map((a: any) => ({ id: a.id, name: a.name, icon: a.icon, config: a.config })))

      // Test connection status for each enabled provider
      const statusResults = await Promise.all(
        photoProviders.map(async (provider: any) => {
          const statusUrl = (provider.config as Record<string, unknown>)?.status_get as string
          if (!statusUrl) return { provider, connected: false }
          try {
            const res = await apiClient.get(statusUrl)
            return { provider, connected: !!res.data?.connected }
          } catch {
            return { provider, connected: false }
          }
        })
      )

      const connectedProviders = statusResults
        .filter(r => r.connected)
        .map(r => ({ id: r.provider.id, name: r.provider.name, icon: r.provider.icon, config: r.provider.config }))

      setAvailableProviders(connectedProviders)
      setConnected(connectedProviders.length > 0)
      if (connectedProviders.length > 0 && !selectedProvider) {
        setSelectedProvider(connectedProviders[0].id)
      }
    } catch {
      setAvailableProviders([])
      setConnected(false)
    } finally {
      setLoading(false)
      setLoadingContent(true)
      await loadContent()
    }
  }


  const loadContent = async () => {
    await loadPhotos()
    await loadAlbumLinks()
    setLoadingContent(false)
  }

  // Load trip photos 

  const loadPhotos = async () => {
    try {
      const photosRes = await apiClient.get(buildUnifiedMemoriesUrl(tripId, 'photos'))
      setTripPhotos(photosRes.data.photos || [])
    } catch {
      setTripPhotos([])
    }
  }

  const loadAlbumLinks = async (): Promise<AlbumLink[]> => {
    try {
      const res = await apiClient.get(buildUnifiedMemoriesUrl(tripId, 'album-links'))
      const links = res.data.links || []
      setAlbumLinks(links)
      return links
    } catch {
      setAlbumLinks([])
      return []
    }
  }

  const syncAlbum = async (linkId: number, provider?: string) => {
    const targetProvider = provider || selectedProvider
    if (!targetProvider) return
    setSyncing(linkId)
    try {
      await apiClient.post(buildProviderMemoriesUrl(tripId, targetProvider, 'album-link-sync', linkId.toString()))
      await loadContent()
    } catch { toast.error(t('memories.error.syncAlbum')) }
    finally { setSyncing(null) }
  }

  const unlinkAlbum = async (linkId: number) => {
    try {
      await apiClient.delete(buildUnifiedMemoriesUrl(tripId, 'album-links', linkId.toString()))
      await loadAlbumLinks()
      await loadPhotos()
    } catch { toast.error(t('memories.error.unlinkAlbum')) }
  }


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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '1.0583cm', textAlign: 'center', ...font }}>
        <Camera size={40} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
        <h3 style={{ margin: '0 0 0.1588cm', fontSize: '0.4233cm', fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('memories.notConnected', { provider_name: enabledProviders.length === 1 ? enabledProviders[0]?.name : 'Photo provider' })}
        </h3>
        <p style={{ margin: '0cm', fontSize: '0.3440cm', color: 'var(--text-muted)', maxWidth: 300 }}>
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
          onReloadAlbumLinks={loadAlbumLinks}
          onSyncAlbum={syncAlbum}
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
        await loadContent()
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
          syncAlbum={syncAlbum}
          unlinkAlbum={unlinkAlbum}
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
        loadingContent={loadingContent}
        groupBy={groupBy}
        sortOrder={sortAsc ? 'oldest' : 'newest'}
      />
      <MemoriesLightbox
        allVisible={allVisible}
        tripId={tripId}
        initialPhoto={lightboxPhoto}
        onClose={() => setLightbox(null)}
      />
    </div>
  )
}
