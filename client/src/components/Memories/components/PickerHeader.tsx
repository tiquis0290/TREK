import type { CSSProperties, ReactNode } from 'react'
import { MultiSelector } from './MultiSelector'
import type { PhotoProvider } from '../utils/types'
import { useTranslation } from '../../../i18n'

const cancelButtonStyle: CSSProperties = {
  padding: '7px 14px',
  borderRadius: '10px',
  border: '1px solid var(--border-primary)',
  background: 'none',
  fontSize: '12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'var(--text-muted)',
}

interface PickerTemplateProps {
  title: string
  availableProviders: PhotoProvider[]
  selectedProvider: string
  onSelectProvider: (providerId: string) => void
  startDate?: string | null
  endDate?: string | null
  pickerDateFilter?: boolean
  onSetPickerDateFilter?: (useDateFilter: boolean) => void
  onClose: () => void
  primaryAction?: { onClick: () => void, text: string, disabled?: boolean }
  controls?: ReactNode
}

export function PickerHeader(p: PickerTemplateProps) {
  const { t } = useTranslation()
  const controlsBottomMargin = p.controls ? 10 : 0

  const providerOptions = p.availableProviders.map(pr => ({ id: pr.id, label: pr.name }))

  const dateOptions = p.startDate && p.endDate ? [
    {
      id: true,
      label: `${t('memories.tripDates')} (${new Date(p.startDate + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} - ${new Date(p.endDate + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })})`,
    },
    {
      id: false,
      label: t('memories.allPhotos'),
    },
  ] : null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-primary)',
    }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-secondary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ margin: '0px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{p.title}</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={p.onClose}
              style={cancelButtonStyle}
            >
              {t('common.cancel')}
            </button>
            {p.primaryAction && <button
                  onClick={p.primaryAction.onClick}
                  disabled={p.primaryAction.disabled}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '10px',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: p.primaryAction.disabled ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    background: p.primaryAction.disabled ? 'var(--border-primary)' : 'var(--text-primary)',
                    color: p.primaryAction.disabled ? 'var(--text-faint)' : 'var(--bg-primary)',
                  }}
                >
                  {p.primaryAction.text}
                </button>
            }
          </div>
        </div>

        {providerOptions.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <MultiSelector
              options={providerOptions}
              selected={p.selectedProvider}
              onSelect={(id) => p.onSelectProvider(String(id))}
              hideIfSingle={true}
            />
          </div>
        )}

        {dateOptions && p.onSetPickerDateFilter && (
          <div style={{ marginBottom: controlsBottomMargin }}>
            <MultiSelector
              options={dateOptions}
              selected={p.pickerDateFilter ?? true}
              onSelect={(selected) => p.onSetPickerDateFilter(Boolean(selected))}
              hideIfSingle={false}
            />
          </div>
        )}

        {p.controls}
      </div>
    </div>
  )
}

