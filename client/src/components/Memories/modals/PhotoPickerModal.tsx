import { useCallback, useEffect, useRef, useState } from 'react'
import apiClient from '../../../api/client'
import { clearImageQueue } from '../../../api/authUrl'
import { useTranslation } from '../../../i18n'
import { useToast } from '../../shared/Toast'
import { PhotoGallery } from '../components/PhotoGallery'
import { ConfirmShareModal } from './ConfirmShareModal'
import { PickerHeader } from '../components/PickerHeader'
import { buildProviderMemoriesUrl, buildUnifiedMemoriesUrl } from '../utils/urlBuilders'
import type { Asset, PhotoProvider, TripPhoto } from '../utils/types'


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
  const [pickerLoadError, setPickerLoadError] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showConfirmShare, setShowConfirmShare] = useState(false)

  const mountedRef = useRef(true)

  const controllerRef = useRef<AbortController | null>(null)
  const isCanceledLoadError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false
    const candidate = error as { name?: string; code?: string }
    return candidate.name === 'AbortError' || candidate.name === 'CanceledError' || candidate.code === 'ERR_CANCELED'
  }

  const loadPickerPhotos = async (offset: number, append: boolean) => {
    if (!p.selectedProvider) {
      setPickerPhotos([])
      setPickerHasMore(false)
      setPickerOffset(0)
      setPickerLoading(false)
      setPickerLoadingMore(false)
      setPickerLoadError(false)
      return
    }

    controllerRef.current?.abort()
    setPickerLoadError(false)
    if (append) setPickerLoadingMore(true)
    else setPickerLoading(true)

    try {
      const newController = new AbortController()
      controllerRef.current = newController
      const res = await apiClient.post(
        buildProviderMemoriesUrl(p.tripId, p.selectedProvider, 'search'),
        {
        from: p.pickerDateFilter && p.startDate ? p.startDate : undefined,
        to: p.pickerDateFilter && p.endDate ? p.endDate : undefined,
        offset,
        limit: PAGE_SIZE,
        },
        { signal: newController.signal }
      )

      if (!mountedRef.current) return
      const incoming = (res.data.assets || []).map((asset: Asset) => ({ ...asset, provider: p.selectedProvider }))
      setPickerPhotos(prev => append ? [...prev, ...incoming] : incoming)
      setPickerOffset(offset + incoming.length)
      setPickerHasMore(Boolean(res.data.hasMore) && incoming.length > 0)
      setPickerLoadError(false)
    } catch (error) {
      if (!mountedRef.current) return
      if (isCanceledLoadError(error)) return
      if (!append) {
        setPickerPhotos([])
        setPickerHasMore(false)
        setPickerOffset(0)
      }
      setPickerLoadError(true)
      toast.error(t('memories.error.loadPhotos'))
    } finally {
      if (!mountedRef.current) return
      if (append) setPickerLoadingMore(false)
      else setPickerLoading(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    setPickerPhotos([])
    loadPickerPhotos(0, false)
    return () => {
      mountedRef.current = false
    }
  }, [p.selectedProvider, p.pickerDateFilter, p.startDate, p.endDate, p.tripId])

  const loadMorePickerPhotos = async () => {
    if (!p.selectedProvider || pickerLoading || pickerLoadingMore || !pickerHasMore ) return

    await loadPickerPhotos(pickerOffset, true)
  }

  const { scrollRef, handleScroll } = useInfiniteScroll({
    hasMore: pickerHasMore,
    loading: pickerLoading,
    loadingMore: pickerLoadingMore,
    error: pickerLoadError,
    onLoadMore: loadMorePickerPhotos,
  })

  function useInfiniteScroll({
    hasMore,
    loading,
    loadingMore,
    error,
    onLoadMore
  }: {
    hasMore: boolean
    loading: boolean
    loadingMore: boolean
    error: boolean
    onLoadMore: () => void
  }) {
    const scrollRef = useRef<HTMLDivElement | null>(null)

    const handleScroll = useCallback(() => {
      if (!hasMore || loading || loadingMore || error) return
      const el = scrollRef.current
      if (!el) return
      if (el.scrollHeight - el.scrollTop < el.clientHeight * 3) {
        onLoadMore()
      }
    }, [hasMore, loading, loadingMore, error, onLoadMore])

    return { scrollRef, handleScroll }
  }


  const title = p.availableProviders.length > 1
    ? t('memories.selectPhotosMultiple')
    : t('memories.selectPhotos', {
      provider_name: p.availableProviders.find(pr => pr.id === p.selectedProvider)?.name || 'Photo provider',
    })

  const currentUserId = p.currentUserId ?? 0
  const makePickerKey = (tripId: number, userId: number, provider: string, assetId: string): string => `${tripId}::${userId}::${provider}::${assetId}`

  const alreadyAdded = new Set(
    p.tripPhotos
      .filter(tp => tp.user_id === currentUserId)
      .map(tp => makePickerKey(p.tripId, tp.user_id, tp.provider, tp.asset_id))
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
    user_id: currentUserId,
    username: '',
    shared: alreadyAdded.has(makePickerKey(p.tripId, currentUserId, asset.provider, asset.id)) ? 1 : 0,
    added_at: asset.takenAt || new Date().toISOString(),
    taken_at: asset.takenAt || null,
    key: makePickerKey(p.tripId, currentUserId, asset.provider, asset.id),
  })

  const pickerTripPhotos = pickerPhotos.map(buildPickerPhoto)

  const confirmSelection = () => {
    if (selectedIds.size === 0) return
    setShowConfirmShare(true)
  }

  const executeAddPhotos = async () => {
    setShowConfirmShare(false)
    try {
      const assetsByKey = new Map(pickerPhotos.map(asset => [makePickerKey(p.tripId, currentUserId, asset.provider, asset.id), asset]))
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

  return <>
    <PhotoGallery
      allVisible={pickerTripPhotos}
      currentUser={p.currentUserId ? { id: p.currentUserId } as any : null}
      openLightbox={(_photo: TripPhoto) => { }}
      openPicker={() => { }}
      setTripPhotos={(_value) => { }}
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
      itemMinSize={120}
      scrollRef={scrollRef}
      onscroll={handleScroll}
      afterItems={pickerLoadError ? (
        <div style={{ width: '100%', textAlign: 'center', padding: '20px' }}>
          <button
            onClick={() => {
              if (pickerOffset > 0) {
                loadMorePickerPhotos()
              } else {
                loadPickerPhotos(0, false)
              }
            }}
            style={{
              padding: '12px 24px',
              borderRadius: '10px',
              border: '1px solid var(--text-primary)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 600,
            }}
          >
            {t('memories.tryAgain') || 'Try again'}
          </button>
        </div>
      ) : undefined}
      header={
        <PickerHeader
          title={title}
          availableProviders={p.availableProviders}
          selectedProvider={p.selectedProvider}
          onSelectProvider={p.onSelectProvider}
          startDate={p.startDate}
          endDate={p.endDate}
          pickerDateFilter={p.pickerDateFilter}
          onSetPickerDateFilter={p.onSetPickerDateFilter}
          onClose={() => {
            clearImageQueue()
            p.onClose()
          }}
          primaryAction={{
            onClick: confirmSelection,
            text: selectedIds.size > 0 ? t('memories.addSelected', { count: selectedIds.size }) : t('memories.addPhotos'),
            disabled: selectedIds.size === 0,
          }}
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
