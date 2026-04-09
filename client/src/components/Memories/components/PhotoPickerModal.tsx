import { useCallback, useEffect, useRef, useState } from 'react'
import apiClient from '../../../api/client'
import { clearImageQueue } from '../../../api/authUrl'
import { useTranslation } from '../../../i18n'
import { useToast } from '../../shared/Toast'
import { PhotoGallery } from './PhotoGallery'
import { ConfirmShareModal } from './ConfirmShareModal'
import { PickerHeader } from './PickerHeader'
import { buildProviderMemoriesUrl, buildUnifiedMemoriesUrl } from '../urlBuilders'
import type { Asset, PhotoProvider, TripPhoto } from '../types'

interface PhotoPickerModalProps {
  availableProviders: PhotoProvider[]
  selectedProvider: string
  onSelectProvider: (providerId: string) => void
  startDate: string | null
  endDate: string | null
  pickerDateFilter: boolean
  onSetPickerDateFilter: (useDateFilter: boolean) => void
  tripPhotos: TripPhoto[]
  currentUserId?: number
  tripId: number
  onAdded: () => Promise<void> | void
  onClose: () => void
}

export function PhotoPickerModal(p: PhotoPickerModalProps) {
  const PAGE_SIZE = 1000
  const { t } = useTranslation()
  const toast = useToast()
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerLoadingMore, setPickerLoadingMore] = useState(false)
  const [pickerHasMore, setPickerHasMore] = useState(false)
  const [pickerOffset, setPickerOffset] = useState(0)
  const [pickerPhotos, setPickerPhotos] = useState<Asset[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showConfirmShare, setShowConfirmShare] = useState(false)

  useEffect(() => {
    let active = true

    const loadPickerPhotos = async (offset: number, append: boolean) => {
      if (!p.selectedProvider) {
        if (active) {
          setPickerPhotos([])
          setPickerHasMore(false)
          setPickerOffset(0)
          setPickerLoading(false)
          setPickerLoadingMore(false)
        }
        return
      }

      if (append) setPickerLoadingMore(true)
      else setPickerLoading(true)

      try {
        const res = await apiClient.post(buildProviderMemoriesUrl(p.tripId, p.selectedProvider, 'search'), {
          from: p.pickerDateFilter && p.startDate ? p.startDate : undefined,
          to: p.pickerDateFilter && p.endDate ? p.endDate : undefined,
          offset,
          limit: PAGE_SIZE,
        })

        if (active) {
          const incoming = (res.data.assets || []).map((asset: Asset) => ({ ...asset, provider: p.selectedProvider }))
          setPickerPhotos(prev => append ? [...prev, ...incoming] : incoming)
          setPickerOffset(offset + incoming.length)
          setPickerHasMore(Boolean(res.data.hasMore) && incoming.length > 0)
        }
      } catch {
        if (active) {
          if (!append) {
            setPickerPhotos([])
            setPickerHasMore(false)
            setPickerOffset(0)
          }
          toast.error(t('memories.error.loadPhotos'))
        }
      } finally {
        if (active) {
          if (append) setPickerLoadingMore(false)
          else setPickerLoading(false)
        }
      }
    }

    loadPickerPhotos(0, false)

    return () => {
      active = false
    }
  }, [p.selectedProvider, p.pickerDateFilter, p.startDate, p.endDate, p.tripId, PAGE_SIZE])

  const loadMorePickerPhotos = async () => {
    if (!p.selectedProvider || pickerLoading || pickerLoadingMore || !pickerHasMore) return

    setPickerLoadingMore(true)
    try {
      const res = await apiClient.post(buildProviderMemoriesUrl(p.tripId, p.selectedProvider, 'search'), {
        from: p.pickerDateFilter && p.startDate ? p.startDate : undefined,
        to: p.pickerDateFilter && p.endDate ? p.endDate : undefined,
        offset: pickerOffset,
        limit: PAGE_SIZE,
      })

      const incoming = (res.data.assets || []).map((asset: Asset) => ({ ...asset, provider: p.selectedProvider }))
      setPickerPhotos(prev => [...prev, ...incoming])
      setPickerOffset(prev => prev + incoming.length)
      setPickerHasMore(Boolean(res.data.hasMore) && incoming.length > 0)
    } catch {
      toast.error(t('memories.error.loadPhotos'))
    } finally {
      setPickerLoadingMore(false)
    }
  }

  const { scrollRef, handleScroll } = useInfiniteScroll({
    hasMore: pickerHasMore,
    loading: pickerLoading,
    loadingMore: pickerLoadingMore,
    onLoadMore: loadMorePickerPhotos,
  })

  function useInfiniteScroll({
    hasMore,
    loading,
    loadingMore,
    onLoadMore
  }: {
    hasMore: boolean
    loading: boolean
    loadingMore: boolean
    onLoadMore: () => void
  }) {
    const scrollRef = useRef<HTMLDivElement | null>(null)

    const handleScroll = useCallback(() => {
      if (!hasMore || loading || loadingMore) return
      const el = scrollRef.current
      if (!el) return
      if (el.scrollHeight - el.scrollTop < el.clientHeight * 3) {
        onLoadMore()
      }
    }, [hasMore, loading, loadingMore, onLoadMore])

    return { scrollRef, handleScroll }
  }


  const title = p.availableProviders.length > 1
    ? t('memories.selectPhotosMultiple')
    : t('memories.selectPhotos', {
      provider_name: p.availableProviders.find(pr => pr.id === p.selectedProvider)?.name || 'Photo provider',
    })

  const controls = p.startDate && p.endDate && (
    <>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => {
            if (!p.pickerDateFilter) {
              p.onSetPickerDateFilter(true)
            }
          }}
          style={{
            padding: '0.1588cm 0.3704cm',
            borderRadius: '2.6194cm',
            fontSize: '0.3175cm',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            border: '0.0265cm solid',
            transition: 'all 0.15s',
            background: p.pickerDateFilter ? 'var(--text-primary)' : 'var(--bg-card)',
            borderColor: p.pickerDateFilter ? 'var(--text-primary)' : 'var(--border-primary)',
            color: p.pickerDateFilter ? 'var(--bg-primary)' : 'var(--text-muted)',
          }}
        >
          {t('memories.tripDates')} ({p.startDate ? new Date(p.startDate + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''} - {p.endDate ? new Date(p.endDate + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''})
        </button>
        <button
          onClick={() => {
            if (p.pickerDateFilter) {
              p.onSetPickerDateFilter(false)
            }
          }}
          style={{
            padding: '0.1588cm 0.3704cm',
            borderRadius: '2.6194cm',
            fontSize: '0.3175cm',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            border: '0.0265cm solid',
            transition: 'all 0.15s',
            background: !p.pickerDateFilter ? 'var(--text-primary)' : 'var(--bg-card)',
            borderColor: !p.pickerDateFilter ? 'var(--text-primary)' : 'var(--border-primary)',
            color: !p.pickerDateFilter ? 'var(--bg-primary)' : 'var(--text-muted)',
          }}
        >
          {t('memories.allPhotos')}
        </button>
      </div>

      {selectedIds.size > 0 && (
        <p style={{ margin: '0.2117cm 0 0', fontSize: '0.3175cm', fontWeight: 600, color: 'var(--text-primary)' }}>
          {selectedIds.size} {t('memories.selected')}
        </p>
      )}
    </>
  )

  // Helper functions
  const makePickerKey = (userId: number, provider: string, assetId: string): string => `${userId}::${provider}::${assetId}`

  const alreadyAdded = new Set(
    p.tripPhotos
      .filter(tp => tp.user_id === p.currentUserId)
      .map(tp => makePickerKey(tp.user_id, tp.provider, tp.asset_id))
  )

  const onTogglePickerSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const buildPickerPhoto = (asset: Asset): TripPhoto => ({
    provider: asset.provider,
    asset_id: asset.id,
    user_id: p.currentUserId || 0,
    username: '',
    shared: alreadyAdded.has(makePickerKey(p.currentUserId, asset.provider, asset.id)) ? 1 : 0,
    added_at: asset.takenAt || new Date().toISOString(),
    taken_at: asset.takenAt || null,
  })

  const pickerTripPhotos = pickerPhotos.map(buildPickerPhoto)

  const confirmSelection = () => {
    if (selectedIds.size === 0) return
    setShowConfirmShare(true)
  }

  const executeAddPhotos = async () => {
    setShowConfirmShare(false)
    try {
      const assetsByKey = new Map(pickerPhotos.map(asset => [makePickerKey(p.currentUserId, asset.provider, asset.id), asset]))
      const groupedByProvider = new Map<string, Asset[]>()
      for (const key of selectedIds) {
        const asset = assetsByKey.get(key)
        if (!asset) continue
        const list = groupedByProvider.get(asset.provider) || []
        list.push(asset)
        groupedByProvider.set(asset.provider, list)
      }

      const selections = [...groupedByProvider.entries()].map(([provider, assets]) => ({
        provider,
        asset_ids: assets.map(asset => asset.id),
        assets: assets,
      }))

      await apiClient.post(buildUnifiedMemoriesUrl(p.tripId, 'photos'), {
        selections,
        shared: true,
      })
      setSelectedIds(new Set())
      await p.onAdded()
    } catch {
      toast.error(t('memories.error.addPhotos'))
    }
  }

  const primaryAction = (
    <button
      onClick={confirmSelection}
      disabled={selectedIds.size === 0}
      style={{
        padding: '0.1852cm 0.3704cm',
        borderRadius: '0.2646cm',
        border: 'none',
        fontSize: '0.3175cm',
        fontWeight: 600,
        cursor: selectedIds.size > 0 ? 'pointer' : 'default',
        fontFamily: 'inherit',
        background: selectedIds.size > 0 ? 'var(--text-primary)' : 'var(--border-primary)',
        color: selectedIds.size > 0 ? 'var(--bg-primary)' : 'var(--text-faint)',
      }}
    >
      {selectedIds.size > 0 ? t('memories.addSelected', { count: selectedIds.size }) : t('memories.addPhotos')}
    </button>
  )

  return <>
    <PhotoGallery
      allVisible={pickerTripPhotos}
      currentUser={p.currentUserId ? { id: p.currentUserId } as any : null}
      openLightbox={(_photo: TripPhoto) => { }}
      openPicker={() => { }}
      setTripPhotos={(_photos: TripPhoto[]) => { }}
      tripId={p.tripId}
      groupBy="month"
      sortOrder="newest"
      selectionEnabled
      selectedIds={selectedIds}
      disabledIds={alreadyAdded}
      onToggleSelect={onTogglePickerSelect}
      onToggleSelectGroup={(groupPhotos, oldState) => {
        setSelectedIds(prev => {
          const next = new Set(prev)
          if (oldState) groupPhotos.forEach(k => next.delete(k))
          else groupPhotos.forEach(k => next.add(k))
          return next
        })
      }}
      loadingContent={pickerLoading}
      loadingMore={pickerLoadingMore}
      itemMinSize={3}
      scrollRef={scrollRef}
      onscroll={handleScroll}
      header={
        <PickerHeader
          title={title}
          availableProviders={p.availableProviders}
          selectedProvider={p.selectedProvider}
          onSelectProvider={p.onSelectProvider}
          onClose={() => {
            clearImageQueue()
            p.onClose()
          }}
          primaryAction={primaryAction}
          controls={controls}
        />
      }
    />
    {showConfirmShare && (
      <ConfirmShareModal
        count={selectedIds.size}
        onCancel={() => setShowConfirmShare(false)}
        onConfirm={executeAddPhotos}
      />
    )}
  </>
}
