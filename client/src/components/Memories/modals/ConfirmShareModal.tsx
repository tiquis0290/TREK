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
        padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '360px',
          width: '100%',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          textAlign: 'center',
        }}
      >
        <Share2 size={28} style={{ color: 'var(--text-primary)', marginBottom: 12 }} />
        <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
          {t('memories.confirmShareTitle')}
        </h3>
        <p style={{ margin: '0 0 20px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {t('memories.confirmShareHint', { count })}
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 20px',
              borderRadius: '10px',
              border: '1px solid var(--border-primary)',
              background: 'none',
              fontSize: '13px',
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
              padding: '8px 20px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '13px',
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
