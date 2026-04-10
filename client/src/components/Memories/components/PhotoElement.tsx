import { Eye, EyeOff, X, Check } from 'lucide-react'
import { useTranslation } from '../../../i18n'
import { ProviderImg } from './ProviderImg'
import type { TripPhoto } from '../types'
import { buildProviderAssetMemoriesUrl } from '../urlBuilders'

interface PhotoElementProps {
  keyId: string
  photo: TripPhoto
  currentUserId?: number
  onOpenLightbox: (photo: TripPhoto) => void
  onToggleSharing: (photo: TripPhoto, shared: boolean) => void
  onRemovePhoto: (photo: TripPhoto) => void
  tripId: number
  selected?: boolean
  disabled?: boolean
  loading?: 'lazy' | 'eager'
  onSelect?: (key: string) => void
}

export function PhotoElement(p: PhotoElementProps) {
  const { t } = useTranslation()
  const isOwn = p.photo.user_id === p.currentUserId
  const usernameInitial = (p.photo.username?.[0] || '?').toUpperCase()

  const handleClick = () => {
    if (p.onSelect) {
      if (!p.disabled && p.onSelect) p.onSelect(p.keyId)
      return
    }

    p.onOpenLightbox(p.photo)
  }

  return (
    <div
      className="group"
      style={{
        position: 'relative',
        aspectRatio: '1',
        borderRadius: '8px',
        overflow: 'visible',
        cursor: p.disabled ? 'default' : 'pointer',
        opacity: p.disabled ? 0.3 : 1,
        outline: p.selected ? '3px solid var(--text-muted)' : 'none',
        outlineOffset: p.selected ? '-3px' : undefined,
      }}
      onClick={handleClick}
    >
      <ProviderImg
        baseUrl={buildProviderAssetMemoriesUrl(p.tripId, p.photo, 'thumbnail')}
        loading={p.loading || "lazy"}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '10px' }}
      />


      {p.selected && (
        <>
          <div
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 6,
            }}
          >
            <Check size={14} color="var(--bg-primary)" />
          </div>

        </>
      )}
      {p.disabled && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            borderRadius: '8px',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.36)',
            color: 'white',
            fontSize: '10px',
            fontWeight: 600,
            zIndex: 5,
          }}
        >
          {t('memories.alreadyAdded')}
        </div>
      )}

      {!isOwn && (
        <div className="memories-avatar" style={{ position: 'absolute', bottom: '6px', left: '6px', zIndex: 7 }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: `hsl(${usernameInitial.charCodeAt(0) * 37 % 360}, 55%, 55%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: 700,
            color: 'white',
            textTransform: 'uppercase',
            border: '2px solid white',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}>{
              p.photo.avatar ? (
                <img src={`/uploads/avatars/${p.photo.avatar}`} alt="" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (p.photo.username || '?')[0].toUpperCase()
            }
          </div>
          <div
            className="memories-avatar-tooltip"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '6px',
              padding: '3px 8px',
              borderRadius: '6px',
              background: 'var(--text-primary)',
              color: 'var(--bg-primary)',
              fontSize: '10px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              opacity: 0,
              transition: 'opacity 0.15s',
            }}
          >
            {p.photo.username}
          </div>
          <style>{'.memories-avatar:hover .memories-avatar-tooltip { opacity: 1 !important; }'}</style>
        </div>
        
      )}

      {isOwn && !p.onSelect && (
        <div
          className="opacity-0 group-hover:opacity-100"
          style={{ position: 'absolute', top: '4px', right: '4px', display: 'flex', gap: '3px', transition: 'opacity 0.15s' }}
        >
          <button
            onClick={e => {
              e.stopPropagation()
              p.onToggleSharing(p.photo, !p.photo.shared)
            }}
            title={p.photo.shared ? t('memories.stopSharing') : t('memories.sharePhotos')}
            style={{
              width: '26.02px',
              height: '26.02px',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {p.photo.shared ? <Eye size={12} color="white" /> : <EyeOff size={12} color="white" />}
          </button>
          <button
            onClick={e => {
              e.stopPropagation()
              p.onRemovePhoto(p.photo)
            }}
            style={{
              width: '26.02px',
              height: '26.02px',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={12} color="white" />
          </button>
        </div>
      )}

      {isOwn && !p.onSelect && !p.photo.shared && (
        <div
          style={{
            position: 'absolute',
            bottom: '6px',
            right: '6px',
            padding: '2px 6px',
            borderRadius: '6px',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
            fontSize: '9px',
            color: 'rgba(255,255,255,0.7)',
            fontWeight: 500,
          }}
        >
          <EyeOff size={9} style={{ display: 'inline', verticalAlign: '-1px', marginRight: '3px' }} />
          {t('memories.private')}
        </div>
      )}
    </div>
  )
}
