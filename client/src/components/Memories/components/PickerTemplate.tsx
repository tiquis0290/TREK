import type { ReactNode } from 'react'
import { ProviderTabs } from './ProviderTabs'
import type { PhotoProvider } from '../types'

interface PickerTemplateProps {
  title: string
  cancelLabel: string
  availableProviders: PhotoProvider[]
  selectedProvider: string
  onSelectProvider: (providerId: string) => void
  onClose: () => void
  primaryAction?: ReactNode
  controls?: ReactNode
  children: ReactNode
  scrollRef?: React.RefObject<HTMLDivElement>
  onScroll?: () => void
}

export function PickerTemplate({
  title,
  cancelLabel,
  availableProviders,
  selectedProvider,
  onSelectProvider,
  onClose,
  primaryAction,
  controls,
  children,
  scrollRef,
  onScroll,
}: PickerTemplateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '0.3704cm 0.5292cm', borderBottom: '0.0265cm solid var(--border-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: '0cm', fontSize: '0.3969cm', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '0.1852cm 0.3704cm',
                borderRadius: '0.2646cm',
                border: '0.0265cm solid var(--border-primary)',
                background: 'none',
                fontSize: '0.3175cm',
                cursor: 'pointer',
                fontFamily: 'inherit',
                color: 'var(--text-muted)',
              }}
            >
              {cancelLabel}
            </button>
            {primaryAction}
          </div>
        </div>

        <div style={{ marginBottom: controls ? 10 : 0 }}>
          <ProviderTabs
            availableProviders={availableProviders}
            selectedProvider={selectedProvider}
            onSelectProvider={onSelectProvider}
          />
        </div>

        {controls}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }} ref={scrollRef} onScroll={onScroll}>
        {children}
      </div>
    </div>
  )
}
