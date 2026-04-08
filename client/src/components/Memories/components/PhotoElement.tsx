import { Eye, EyeOff, X, Check, Plus, Minus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from '../../../i18n'
import { ProviderImg } from './ProviderImg'
import type { TripPhoto } from '../types'

interface PhotoElementProps {
  photo: TripPhoto
  currentUserId?: number
  buildProviderAssetUrl: (photo: TripPhoto, what: string) => string
  onOpenLightbox: (photo: TripPhoto) => void
  onToggleSharing: (photo: TripPhoto, shared: boolean) => void
  onRemovePhoto: (photo: TripPhoto) => void
  selectable?: boolean
  selected?: boolean
  disabled?: boolean
  onSelect?: (photo: TripPhoto) => void
}

export function PhotoElement({
  photo,
  currentUserId,
  buildProviderAssetUrl,
  onOpenLightbox,
  onToggleSharing,
  onRemovePhoto,
  selectable,
  selected,
  disabled,
  onSelect,
}: PhotoElementProps) {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const isOwn = photo.user_id === currentUserId
  const usernameInitial = (photo.username?.[0] || '?').toUpperCase()

  const handleClick = () => {
    if (selectable) {
      if (!disabled && onSelect) onSelect(photo)
      return
    }

    onOpenLightbox(photo)
  }

  return (
    <div
      className="group"
      style={{
        position: 'relative',
        aspectRatio: '1',
        borderRadius: '0.2117cm',
        overflow: 'visible',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        outline: selectable && selected ? '0.0794cm solid var(--text-muted)' : 'none',
        outlineOffset: selectable && selected ? '-0.0794cm' : undefined,
      }}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ProviderImg
        baseUrl={buildProviderAssetUrl(photo, 'thumbnail')}
        loading="lazy"
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '0.2646cm' }}
      />


      {selectable && selected && (
        <>
          <div
            style={{
              position: 'absolute',
              top: '0.2117cm',
              right: '0.2117cm',
              width: '0.635cm',
              height: '0.635cm',
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
      {selectable && disabled && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.36)',
            color: 'white',
            fontSize: '0.2646cm',
            fontWeight: 600,
            zIndex: 5,
          }}
        >
          {t('memories.alreadyAdded')}
        </div>
      )}

      {!selectable && !isOwn && (
        <div className="memories-avatar" style={{ position: 'absolute', bottom: '0.1587cm', left: '0.1587cm', zIndex: 10 }}>
          <div style={{
            width: '0.635cm',
            height: '0.635cm',
            borderRadius: '50%',
            background: `hsl(${usernameInitial.charCodeAt(0) * 37 % 360}, 55%, 55%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.2646cm',
            fontWeight: 700,
            color: 'white',
            textTransform: 'uppercase',
            border: '0.0529cm solid white',
            boxShadow: '0 0.0265cm 0.1058cm rgba(0,0,0,0.3)',
          }}>{
              photo.avatar ? (
                <img src={`/uploads/avatars/${photo.avatar}`} alt="" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
              ) : (photo.username || '?')[0].toUpperCase()
            }
          </div>
          <div
            className="memories-avatar-tooltip"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '0.1587cm',
              padding: '0.0794cm 0.2117cm',
              borderRadius: '0.1587cm',
              background: 'var(--text-primary)',
              color: 'var(--bg-primary)',
              fontSize: '0.2646cm',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              opacity: 0,
              transition: 'opacity 0.15s',
            }}
          >
            {photo.username}
          </div>
        </div>
      )}

      {isOwn && !selectable && (
        <div
          className="opacity-0 group-hover:opacity-100"
          style={{ position: 'absolute', top: '0.1058cm', right: '0.1058cm', display: 'flex', gap: '0.0794cm', transition: 'opacity 0.15s' }}
        >
          <button
            onClick={e => {
              e.stopPropagation()
              onToggleSharing(photo, !photo.shared)
            }}
            title={photo.shared ? t('memories.stopSharing') : t('memories.sharePhotos')}
            style={{
              width: '0.6885cm',
              height: '0.6885cm',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(0.1058cm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {photo.shared ? <Eye size={12} color="white" /> : <EyeOff size={12} color="white" />}
          </button>
          <button
            onClick={e => {
              e.stopPropagation()
              onRemovePhoto(photo)
            }}
            style={{
              width: '0.6885cm',
              height: '0.6885cm',
              borderRadius: '50%',
              border: 'none',
              cursor: 'pointer',
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(0.1058cm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={12} color="white" />
          </button>
        </div>
      )}

      {isOwn && !selectable && !photo.shared && (
        <div
          style={{
            position: 'absolute',
            bottom: '0.1587cm',
            right: '0.1587cm',
            padding: '0.0529cm 0.1587cm',
            borderRadius: '0.1587cm',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(0.1058cm)',
            fontSize: '0.2381cm',
            color: 'rgba(255,255,255,0.7)',
            fontWeight: 500,
          }}
        >
          <EyeOff size={9} style={{ display: 'inline', verticalAlign: '-0.0265cm', marginRight: '0.0794cm' }} />
          {t('memories.private')}
        </div>
      )}
    </div>
  )
}
