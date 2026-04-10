import { ArrowUpDown, Link2, Plus, RefreshCw, FolderOpen, X } from 'lucide-react'
import type { CSSProperties } from 'react'
import { useTranslation } from '../../../i18n'
import type { AlbumLink } from '../utils/types'

const controlStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: '8px',
  border: '1px solid var(--border-primary)',
  background: 'var(--bg-card)',
  fontSize: '11px',
  fontFamily: 'inherit',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  outline: 'none',
}

const iconActionStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '2px',
  display: 'flex',
  color: 'var(--text-faint)',
}

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

export function MemoriesHeader(props: MemoriesHeaderProps) {
  const { t } = useTranslation()
  const photosSummary = `${props.allVisibleCount} ${t('memories.photosFound')}${props.othersCount > 0 ? ` · ${props.othersCount} ${t('memories.fromOthers')}` : ''}`

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
            {photosSummary}
          </p>
        </div>
        {props.connected && (
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            <button onClick={props.openAlbumPicker}
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
            <button onClick={props.openPicker}
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
      {props.albumLinks.length > 0 && (
        <div style={{ display: 'flex', gap: '6.05px', flexWrap: 'wrap' }}>
          {props.albumLinks.map(link => (
            <div key={link.id} style={{
              display: 'flex', alignItems: 'center', gap: '6.05px', padding: '4.16px 10.2px', borderRadius: '8.31px',
              background: 'var(--bg-tertiary)', fontSize: '11.34px', color: 'var(--text-muted)',
            }}>
              <FolderOpen size={11} />
              <span style={{ fontWeight: 500 }}>{link.album_name}</span>
              {link.username !== props.currentUser?.username && <span style={{ color: 'var(--text-faint)' }}>({link.username})</span>}
              {link.user_id === props.currentUser?.id && (
                <>
                  <button onClick={() => props.syncAlbum(link.id)} disabled={props.syncing === link.id} title={t('memories.syncAlbum')}
                    style={iconActionStyle}>
                    <RefreshCw size={11} style={{ animation: props.syncing === link.id ? 'spin 1s linear infinite' : 'none' }} />
                  </button>
                  <button onClick={() => props.unlinkAlbum(link.id)} title={t('memories.unlinkAlbum')}
                    style={iconActionStyle}>
                    <X size={11} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={props.onSortToggle}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '8px',
            border: '1px solid var(--border-primary)', background: 'var(--bg-card)',
            fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-muted)',
          }}>
          <ArrowUpDown size={11} /> {props.sortAsc ? t('memories.oldest') : t('memories.newest')}
        </button>
        <select value={props.groupBy} onChange={e => props.onGroupByChange(e.target.value as 'day' | 'week' | 'month')}
          style={controlStyle}>
          <option value="day">{t('memories.filter.day') || 'Day'}</option>
          <option value="week">{t('memories.filter.week') || 'Week'}</option>
          <option value="month">{t('memories.filter.month') || 'Month'}</option>
        </select>
        {props.locations.length > 1 && (
          <select value={props.locationFilter} onChange={e => props.onLocationFilterChange(e.target.value)}
            style={controlStyle}>
            <option value="">{t('memories.allLocations')}</option>
            {props.locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}
