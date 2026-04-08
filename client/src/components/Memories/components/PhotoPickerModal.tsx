import { useCallback, useEffect, useRef, useState } from 'react'
import apiClient from '../../../api/client'
import { Camera, Check } from 'lucide-react'
import { clearImageQueue } from '../../../api/authUrl'
import { useTranslation } from '../../../i18n'
import { useToast } from '../../shared/Toast'
import { ProviderImg } from './ProviderImg'
import { PhotoGallery } from './PhotoGallery'
import { ConfirmShareModal } from './ConfirmShareModal'
import { PickerTemplate } from './PickerTemplate'
import { buildProviderAssetMemoriesUrl, buildProviderMemoriesUrl, createMemoriesUrlBuilders } from '../urlBuilders'
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

export function PhotoPickerModal({
  availableProviders,
  selectedProvider,
  onSelectProvider,
  startDate,
  endDate,
  pickerDateFilter,
  onSetPickerDateFilter,
  tripPhotos,
  currentUserId,
  tripId,
  onAdded,
  onClose,
}: PhotoPickerModalProps) {
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
  const { buildUnifiedUrl } = createMemoriesUrlBuilders(tripId)

  useEffect(() => {
    let active = true

    const loadPickerPhotos = async (offset: number, append: boolean) => {
      if (!selectedProvider) {
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
        const res = await apiClient.post(buildProviderMemoriesUrl(tripId, selectedProvider, 'search'), {
          from: pickerDateFilter && startDate ? startDate : undefined,
          to: pickerDateFilter && endDate ? endDate : undefined,
          offset,
          limit: PAGE_SIZE,
        })

        if (active) {
          const incoming = (res.data.assets || []).map((asset: Asset) => ({ ...asset, provider: selectedProvider }))
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
  }, [selectedProvider, pickerDateFilter, startDate, endDate, tripId, PAGE_SIZE])

  const loadMorePickerPhotos = async () => {
    if (!selectedProvider || pickerLoading || pickerLoadingMore || !pickerHasMore) return

    setPickerLoadingMore(true)
    try {
      const res = await apiClient.post(buildProviderMemoriesUrl(tripId, selectedProvider, 'search'), {
        from: pickerDateFilter && startDate ? startDate : undefined,
        to: pickerDateFilter && endDate ? endDate : undefined,
        offset: pickerOffset,
        limit: PAGE_SIZE,
      })

      const incoming = (res.data.assets || []).map((asset: Asset) => ({ ...asset, provider: selectedProvider }))
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
      if (el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight * 2) {
        onLoadMore()
      }
    }, [hasMore, loading, loadingMore, onLoadMore])

    return { scrollRef, handleScroll }
  }



  // Infinite scroll handled by useInfiniteScroll hook and scrollRef

  const title = availableProviders.length > 1
    ? t('memories.selectPhotosMultiple')
    : t('memories.selectPhotos', {
      provider_name: availableProviders.find(p => p.id === selectedProvider)?.name || 'Photo provider',
    })

  const controls = startDate && endDate && (
    <>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => {
            if (!pickerDateFilter) {
              onSetPickerDateFilter(true)
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
            background: pickerDateFilter ? 'var(--text-primary)' : 'var(--bg-card)',
            borderColor: pickerDateFilter ? 'var(--text-primary)' : 'var(--border-primary)',
            color: pickerDateFilter ? 'var(--bg-primary)' : 'var(--text-muted)',
          }}
        >
          {t('memories.tripDates')} ({startDate ? new Date(startDate + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''} - {endDate ? new Date(endDate + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''})
        </button>
        <button
          onClick={() => {
            if (pickerDateFilter) {
              onSetPickerDateFilter(false)
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
            background: !pickerDateFilter ? 'var(--text-primary)' : 'var(--bg-card)',
            borderColor: !pickerDateFilter ? 'var(--text-primary)' : 'var(--border-primary)',
            color: !pickerDateFilter ? 'var(--bg-primary)' : 'var(--text-muted)',
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
  const makePickerKey = (provider: string, assetId: string): string => `${provider}::${assetId}`

  const alreadyAdded = new Set(
    tripPhotos
      .filter(p => p.user_id === currentUserId)
      .map(p => makePickerKey(p.provider, p.asset_id))
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
    user_id: currentUserId || 0,
    username: '',
    shared: alreadyAdded.has(makePickerKey(asset.provider, asset.id)) ? 1 : 0,
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
      const assetsByKey = new Map(pickerPhotos.map(asset => [makePickerKey(asset.provider, asset.id), asset]))
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

      await apiClient.post(buildUnifiedUrl('photos'), {
        selections,
        shared: true,
      })
      setSelectedIds(new Set())
      await onAdded()
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

  return (
    <>
      <PickerTemplate
        title={title}
        cancelLabel={t('common.cancel')}
        availableProviders={availableProviders}
        selectedProvider={selectedProvider}
        onSelectProvider={onSelectProvider}
        onClose={() => {
          clearImageQueue()
          onClose()
        }}
        primaryAction={primaryAction}
        controls={controls}
        scrollRef={scrollRef}
        onScroll={handleScroll}
      >
        {pickerLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
            <div
              className="w-7 h-7 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }}
            />
          </div>
        ) : pickerPhotos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5875cm 0.5292cm' }}>
            <Camera size={36} style={{ color: 'var(--text-faint)', margin: '0 auto 0.2646cm', display: 'block' }} />
            <p style={{ fontSize: '0.3440cm', color: 'var(--text-muted)', margin: 0 }}>{t('memories.noPhotos')}</p>
            {pickerDateFilter && (
              <p style={{ fontSize: '0.3175cm', color: 'var(--text-faint)', margin: '0 0 0.4233cm' }}>
                {t('memories.noPhotosHint', {
                  provider_name: availableProviders.find(p => p.id === selectedProvider)?.name || 'Photo provider',
                })}
              </p>
            )}
          </div>
        ) : (
          <>
            <PhotoGallery
              allVisible={pickerTripPhotos}
              currentUser={currentUserId ? { id: currentUserId } as any : null}
              buildProviderAssetUrl={(photo, what) => buildProviderAssetMemoriesUrl(tripId, photo, what)}
              openLightbox={(_photo: TripPhoto) => {}}
              openPicker={() => {}}
              setTripPhotos={(_photos: TripPhoto[]) => {}}
              tripId={tripId}
              groupBy="month"
              sortOrder="newest"
              selectionEnabled
              selectedIds={selectedIds}
              disabledIds={alreadyAdded}
              onToggleSelect={(photo) => onTogglePickerSelect(makePickerKey(photo.provider, photo.asset_id))}
              itemMinSize={3}
            />
            {pickerLoadingMore && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
                <div
                  className="w-7 h-7 border-2 rounded-full animate-spin"
                  style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }}
                />
              </div>
            )}
          </>
        )}
      </PickerTemplate>

      {showConfirmShare && (
        <ConfirmShareModal
          count={selectedIds.size}
          onCancel={() => setShowConfirmShare(false)}
          onConfirm={executeAddPhotos}
        />
      )}
    </>
  )
}
