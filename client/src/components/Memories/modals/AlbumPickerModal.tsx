import { useEffect, useState } from 'react'
import apiClient from '../../../api/client'
import { Check, FolderOpen, Link2 } from 'lucide-react'
import { useToast } from '../../shared/Toast'
import { useTranslation } from '../../../i18n'
import { MultiSelector } from '../components/MultiSelector'
import { ConfirmShareModal } from './ConfirmShareModal'
import { buildProviderMemoriesUrl, buildUnifiedMemoriesUrl } from '../utils/urlBuilders'
import type { Album, AlbumLink, PhotoProvider } from '../utils/types'

interface AlbumPickerModalProps {
    availableProviders: PhotoProvider[]
    tripId: number
    selectedProvider: string
    onSelectProvider: (providerId: string) => void
    albumLinks: AlbumLink[]
    onReloadAlbumLinks: () => Promise<AlbumLink[]>
    onSyncAlbum: (linkId: number, provider?: string) => Promise<void>
    onClose: () => void
}

export function AlbumPickerModal({
    availableProviders,
    tripId,
    selectedProvider,
    onSelectProvider,
    albumLinks,
    onReloadAlbumLinks,
    onSyncAlbum,
    onClose,
}: AlbumPickerModalProps) {
    const { t } = useTranslation()
    const toast = useToast()
    const [albumsLoading, setAlbumsLoading] = useState(false)
    const [albums, setAlbums] = useState<Album[]>([])
    const [showConfirmShare, setShowConfirmShare] = useState(false)
    const [pendingAlbum, setPendingAlbum] = useState<Album | null>(null)
    const linkedIds = new Set(albumLinks.map(l => l.album_id))

    useEffect(() => {
        let active = true

        const loadAlbums = async () => {
            if (!selectedProvider) {
                setAlbums([])
                return
            }

            setAlbumsLoading(true)
            try {
                const res = await apiClient.get(buildProviderMemoriesUrl(tripId, selectedProvider, 'albums'))
                if (active) {
                    setAlbums(res.data.albums || [])
                }
            } catch {
                if (active) {
                    setAlbums([])
                }
            } finally {
                if (active) {
                    setAlbumsLoading(false)
                }
            }
        }

        loadAlbums()

        return () => {
            active = false
        }
    }, [selectedProvider])

    const handleLinkAlbum = async (albumId: string, albumName: string) => {
        if (!selectedProvider) {
            toast.error(t('memories.error.linkAlbum'))
            return
        }

        try {
            await apiClient.post(buildUnifiedMemoriesUrl(tripId, 'album-links'), {
                album_id: albumId,
                album_name: albumName,
                provider: selectedProvider,
            })

            const links = await onReloadAlbumLinks()
            
            const newLink = links.find((l: AlbumLink) => l.album_id === albumId && l.provider === selectedProvider)
            toast.success(t('memories.albumLinked', { albumName, providerName: availableProviders.find(p => p.id === selectedProvider)?.name || selectedProvider }))
            linkedIds.add(albumId)

            await onSyncAlbum(newLink.id, newLink.provider)
        } catch {
            toast.error(t('memories.error.linkAlbum'))
        }
    }

    const onAlbumClick = (album: Album) => {
        if (linkedIds.has(album.id)) return
        setPendingAlbum(album)
        setShowConfirmShare(true)
    }

    const onConfirmAlbumShare = async () => {
        if (!pendingAlbum) return
        setShowConfirmShare(false)
        await handleLinkAlbum(pendingAlbum.id, pendingAlbum.albumName)
        setPendingAlbum(null)
    }


    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: '0px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {t('memories.linkAlbum')}
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '7px 14px',
                            borderRadius: '10px',
                            border: '1px solid var(--border-primary)',
                            background: 'none',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            color: 'var(--text-muted)',
                        }}
                    >
                        {t('common.cancel')}
                    </button>
                </div>

                <div style={{ marginTop: 10 }}>
                    <MultiSelector
                        options={availableProviders.map(p => ({ id: p.id, label: p.name }))}
                        selected={selectedProvider}
                        onSelect={(id) => onSelectProvider(String(id))}
                        hideIfSingle={true}
                    />
                </div>
            </div>

            {albumsLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <div className="w-8 h-8 border-2 rounded-full animate-spin"
                        style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
                </div>
            ) : albums.length > 0 ? (
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                    {albums.map(album => (
                        <button
                            key={album.id}
                            onClick={() => onAlbumClick(album)}
                            disabled={linkedIds.has(album.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                width: '100%', padding: '10px', marginBottom: '6px', borderRadius: '8px',
                                border: '1px solid var(--border-secondary)',
                                background: 'var(--bg-card)',
                                cursor: linkedIds.has(album.id) ? 'normal' : 'pointer',
                                opacity: linkedIds.has(album.id) ? 0.5 : 1, fontSize: '13px',
                            }}
                        >
                            <FolderOpen size={16} />
                            <div style={{ flex: 1, textAlign: 'left' }}>
                                <p style={{ margin: '0px', fontWeight: 500, color: 'var(--text-primary)' }}>{album.albumName}</p>
                                <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {album.assetCount} {t('memories.photos')}
                                </p>
                            </div>
                            {linkedIds.has(album.id) ? <Check size={16} color="var(--text-primary)" /> : <Link2 size={13} />}
                        </button>
                    ))}
                </div>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    {t('memories.noAlbums')}
                </div>
            )}

            {showConfirmShare && (
                <ConfirmShareModal
                    count={pendingAlbum?.assetCount || 0}
                    onCancel={() => {
                        setShowConfirmShare(false)
                        setPendingAlbum(null)
                    }}
                    onConfirm={onConfirmAlbumShare}
                />
            )}
        </div>
    )
}
