import { ArrowUpDown, Link2, Plus, RefreshCw, FolderOpen, X } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import type { AlbumLink } from '../types'

type MemoriesHeaderProps = {
  connected: boolean
  openAlbumPicker: () => void
  openPicker: () => void
  albumLinks: AlbumLink[]
  syncing: number | null
  syncAlbum: (linkId: number, provider?: string) => void
  unlinkAlbum: (linkId: number) => void
  currentUser: { id?: number; username?: string } | null
  allVisibleCount: number
  othersCount: number
  sortAsc: boolean
  onSortToggle: () => void
  groupBy: 'day' | 'week' | 'month'
  onGroupByChange: (groupBy: 'day' | 'week' | 'month') => void
  locationFilter: string
  onLocationFilterChange: (value: string) => void
  locations: string[]
  compact?: boolean
}

export function MemoriesHeader({
  connected,
  openAlbumPicker,
  openPicker,
  albumLinks,
  syncing,
  syncAlbum,
  unlinkAlbum,
  currentUser,
  allVisibleCount,
  othersCount,
  sortAsc,
  onSortToggle,
  groupBy,
  onGroupByChange,
  locationFilter,
  onLocationFilterChange,
  locations,
  compact = false,
}: MemoriesHeaderProps) {
  const { t } = useTranslation()
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      background: 'var(--bg-primary)',
      padding: '0.2cm 0.5cm',
      gap: '0.2cm',
      borderBottom: '1px solid var(--border-secondary)',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: '0cm', fontSize: compact ? '0.35cm' : '0.48cm', fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('memories.title')}
          </h2>
          <p style={{ margin: '0.053cm 0 0', fontSize: '0.32cm', color: 'var(--text-faint)' }}>
            {allVisibleCount} {t('memories.photosFound')}
            {othersCount > 0 && ` · ${othersCount} ${t('memories.fromOthers')}`}
          </p>
        </div>
        {connected && (
          <div style={{ display: 'flex', gap: '0.1323cm', alignItems: 'center' }}>
            <button onClick={openAlbumPicker}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.10cm',
                padding: '7px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border-primary)',
                background: 'none',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
              <Link2 size={13} />
              {t('memories.linkAlbum')}
            </button>
            <button onClick={openPicker}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.10cm',
                padding: '7px 14px',
                borderRadius: '10px',
                border: 'none',
                background: 'var(--text-primary)',
                color: 'var(--bg-primary)',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}>
              <Plus size={14} />
              {t('memories.addPhotos')}
            </button>
          </div>
        )}
      </div>
      {albumLinks.length > 0 && (
        <div style={{ display: 'flex', gap: '0.16cm', flexWrap: 'wrap' }}>
          {albumLinks.map(link => (
            <div key={link.id} style={{
              display: 'flex', alignItems: 'center', gap: '0.16cm', padding: '0.11cm 0.27cm', borderRadius: '0.22cm',
              background: 'var(--bg-tertiary)', fontSize: '0.3cm', color: 'var(--text-muted)',
            }}>
              <FolderOpen size={11} />
              <span style={{ fontWeight: 500 }}>{link.album_name}</span>
              {link.username !== currentUser?.username && <span style={{ color: 'var(--text-faint)' }}>({link.username})</span>}
              {link.user_id === currentUser?.id && (
                <>
                  <button onClick={() => syncAlbum(link.id, link.provider)} disabled={syncing === link.id} title={t('memories.syncAlbum')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.0529cm', display: 'flex', color: 'var(--text-faint)' }}>
                    <RefreshCw size={11} style={{ animation: syncing === link.id ? 'spin 1s linear infinite' : 'none' }} />
                  </button>
                  <button onClick={() => unlinkAlbum(link.id)} title={t('memories.unlinkAlbum')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.0529cm', display: 'flex', color: 'var(--text-faint)' }}>
                    <X size={11} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.1588cm', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={onSortToggle}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.1058cm', padding: '0.1058cm 0.2646cm', borderRadius: '0.2117cm',
            border: '0.0265cm solid var(--border-primary)', background: 'var(--bg-card)',
            fontSize: '0.2910cm', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)',
          }}>
          <ArrowUpDown size={11} /> {sortAsc ? t('memories.oldest') : t('memories.newest')}
        </button>
        <select value={groupBy} onChange={e => onGroupByChange(e.target.value as 'day' | 'week' | 'month')}
          style={{
            padding: '0.1058cm 0.2646cm', borderRadius: '0.2117cm', border: '0.0265cm solid var(--border-primary)',
            background: 'var(--bg-card)', fontSize: '0.2910cm', fontFamily: 'inherit', color: 'var(--text-muted)',
            cursor: 'pointer', outline: 'none',
          }}>
          <option value="day">{t('memories.day') || 'Day'}</option>
          <option value="week">{t('memories.week') || 'Week'}</option>
          <option value="month">{t('memories.month') || 'Month'}</option>
        </select>
        {locations.length > 1 && (
          <select value={locationFilter} onChange={e => onLocationFilterChange(e.target.value)}
            style={{
              padding: '0.1058cm 0.2646cm', borderRadius: '0.2117cm', border: '0.0265cm solid var(--border-primary)',
              background: 'var(--bg-card)', fontSize: '0.2910cm', fontFamily: 'inherit', color: 'var(--text-muted)',
              cursor: 'pointer', outline: 'none',
            }}>
            <option value="">{t('memories.allLocations')}</option>
            {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}
