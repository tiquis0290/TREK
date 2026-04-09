import type { ReactNode } from 'react'
import { ProviderTabs } from './ProviderTabs'
import type { PhotoProvider } from '../types'
import { useTranslation } from '../../../i18n'

interface PickerTemplateProps {
  title: string
  availableProviders: PhotoProvider[]
  selectedProvider: string
  onSelectProvider: (providerId: string) => void
  onClose: () => void
  primaryAction?: ReactNode
  controls?: ReactNode
}

export function PickerHeader(p: PickerTemplateProps) {
  const { t } = useTranslation()
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-primary)'
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: '0px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{p.title}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={p.onClose}
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
            {p.primaryAction}
          </div>
        </div>

        <div style={{ marginBottom: p.controls ? 10 : 0 }}>
          <ProviderTabs
            availableProviders={p.availableProviders}
            selectedProvider={p.selectedProvider}
            onSelectProvider={p.onSelectProvider}
          />
        </div>

        {p.controls}
      </div>
    </div>
  )
}
