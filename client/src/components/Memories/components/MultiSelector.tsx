interface Option {
  id: string | boolean
  label: string
}

interface MultiSelectorProps {
  options: Option[]
  selected: string | boolean
  onSelect: (id: string | boolean) => void
  hideIfSingle?: boolean
}

export function MultiSelector({ options, selected, onSelect, hideIfSingle = true }: MultiSelectorProps) {
  if (hideIfSingle && options.length < 2) return null

  return (
    <div style={{ display: 'flex', gap: '6px', marginTop: 8 }}>
      {options.map(option => (
        <button
          key={String(option.id)}
          onClick={() => onSelect(option.id)}
          style={{
            padding: '6px 14px',
            borderRadius: '99px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            border: '1px solid',
            transition: 'all 0.15s',
            background: selected === option.id ? 'var(--text-primary)' : 'var(--bg-card)',
            borderColor: selected === option.id ? 'var(--text-primary)' : 'var(--border-primary)',
            color: selected === option.id ? 'var(--bg-primary)' : 'var(--text-muted)',
            textTransform: 'capitalize',
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
