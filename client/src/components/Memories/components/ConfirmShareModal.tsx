import { Share2 } from 'lucide-react'
import { useTranslation } from '../../../i18n'

interface ConfirmShareModalProps {
  count: number
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmShareModal({ count, onCancel, onConfirm }: ConfirmShareModalProps) {
  const { t } = useTranslation()
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.5292cm',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          borderRadius: '0.4233cm',
          padding: '0.6350cm',
          maxWidth: '9.5250cm',
          width: '100%',
          boxShadow: '0 0.4233cm 1.2700cm rgba(0,0,0,0.2)',
          textAlign: 'center',
        }}
      >
        <Share2 size={28} style={{ color: 'var(--text-primary)', marginBottom: 12 }} />
        <h3 style={{ margin: '0 0 0.2117cm', fontSize: '0.4233cm', fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('memories.confirmShareTitle')}
        </h3>
        <p style={{ margin: '0 0 0.5292cm', fontSize: '0.3440cm', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('memories.confirmShareHint', { count })}
        </p>
        <div style={{ display: 'flex', gap: '0.2117cm', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '0.2117cm 0.5292cm',
              borderRadius: '0.2646cm',
              border: '0.0265cm solid var(--border-primary)',
              background: 'none',
              fontSize: '0.3440cm',
              cursor: 'pointer',
              fontFamily: 'inherit',
              color: 'var(--text-muted)',
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '0.2117cm 0.5292cm',
              borderRadius: '0.2646cm',
              border: 'none',
              fontSize: '0.3440cm',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: 'var(--text-primary)',
              color: 'var(--bg-primary)',
            }}
          >
            {t('memories.confirmShareButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
