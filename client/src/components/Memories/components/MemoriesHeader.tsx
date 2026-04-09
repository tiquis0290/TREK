import { ArrowUpDown, Link2, Plus, RefreshCw, FolderOpen, X } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import type { AlbumLink } from '../types'




type MemoriesHeaderProps = {
  connected: boolean
  openAlbumPicker: () => void
  openPicker: () => void
  albumLinks: AlbumLink[]
  syncing: number | null
  syncAlbum: (linkId: number) => Promise<void>
  unlinkAlbum: (linkId: number) => Promise<void>
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
}

export function MemoriesHeader(p: MemoriesHeaderProps) {
  const { t } = useTranslation()
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      background: 'var(--bg-primary)',
      padding: '7.56px 18.9px',
      gap: '7.56px',
      borderBottom: '1px solid var(--border-secondary)',
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: '0px', fontSize: '18.14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {t('memories.title')}
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: '12.09px', color: 'var(--text-faint)' }}>
            {p.allVisibleCount} {t('memories.photosFound')}
            {p.othersCount > 0 && ` · ${p.othersCount} ${t('memories.fromOthers')}`}
          </p>
        </div>
        {p.connected && (
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            <button onClick={p.openAlbumPicker}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3.78px',
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
            <button onClick={p.openPicker}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3.78px',
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
      {p.albumLinks.length > 0 && (
        <div style={{ display: 'flex', gap: '6.05px', flexWrap: 'wrap' }}>
          {p.albumLinks.map(link => (
            <div key={link.id} style={{
              display: 'flex', alignItems: 'center', gap: '6.05px', padding: '4.16px 10.2px', borderRadius: '8.31px',
              background: 'var(--bg-tertiary)', fontSize: '11.34px', color: 'var(--text-muted)',
            }}>
              <FolderOpen size={11} />
              <span style={{ fontWeight: 500 }}>{link.album_name}</span>
              {link.username !== p.currentUser?.username && <span style={{ color: 'var(--text-faint)' }}>({link.username})</span>}
              {link.user_id === p.currentUser?.id && (
                <>
                  <button onClick={() => p.syncAlbum(link.id)} disabled={p.syncing === link.id} title={t('memories.syncAlbum')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: 'var(--text-faint)' }}>
                    <RefreshCw size={11} style={{ animation: p.syncing === link.id ? 'spin 1s linear infinite' : 'none' }} />
                  </button>
                  <button onClick={() => p.unlinkAlbum(link.id)} title={t('memories.unlinkAlbum')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', color: 'var(--text-faint)' }}>
                    <X size={11} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={p.onSortToggle}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '8px',
            border: '1px solid var(--border-primary)', background: 'var(--bg-card)',
            fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)',
          }}>
          <ArrowUpDown size={11} /> {p.sortAsc ? t('memories.oldest') : t('memories.newest')}
        </button>
        <select value={p.groupBy} onChange={e => p.onGroupByChange(e.target.value as 'day' | 'week' | 'month')}
          style={{
            padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-primary)',
            background: 'var(--bg-card)', fontSize: '11px', fontFamily: 'inherit', color: 'var(--text-muted)',
            cursor: 'pointer', outline: 'none',
          }}>
          <option value="day">{t('memories.filter.day') || 'Day'}</option>
          <option value="week">{t('memories.filter.week') || 'Week'}</option>
          <option value="month">{t('memories.filter.month') || 'Month'}</option>
        </select>
        {p.locations.length > 1 && (
          <select value={p.locationFilter} onChange={e => p.onLocationFilterChange(e.target.value)}
            style={{
              padding: '4px 10px', borderRadius: '8px', border: '1px solid var(--border-primary)',
              background: 'var(--bg-card)', fontSize: '11px', fontFamily: 'inherit', color: 'var(--text-muted)',
              cursor: 'pointer', outline: 'none',
            }}>
            <option value="">{t('memories.allLocations')}</option>
            {p.locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}
