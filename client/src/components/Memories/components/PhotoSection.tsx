import { Check } from "lucide-react"
import { PhotoElement } from "./PhotoElement"
import { useTranslation } from "../../../i18n"
import { TripPhoto } from "../utils/types"
import { User } from "../../../types"
import { useMemo } from "react"


interface PhotoSectionProps {
    sectionKey: string
    photos: TripPhoto[]
    disabledIds?: Set<string>
    selectedIds?: Set<string>
    onToggleSelect?: (key: string) => void
    onToggleSelectGroup?: (keys: string[], oldState: boolean) => void
    tripId: number
    currentUser: User | null
    openLightbox: (photo: TripPhoto) => void
    onToggleSharing: (photo: TripPhoto, shared: boolean) => void
    onRemovePhoto: (photo: TripPhoto) => void
    itemMinSize?: number
}

const DEFAULT_MIN_ITEM_SIZE = 160
const GRID_GAP = 6
const SECTION_PADDING = 10

export function PhotoSection(p: PhotoSectionProps) {
    const { t } = useTranslation()
    const minItemSize = p.itemMinSize ?? DEFAULT_MIN_ITEM_SIZE
    const sectionPhotoKeys = useMemo(() => p.photos.map(photo => photo.key), [p.photos])
    const selectableKeys = useMemo(() => sectionPhotoKeys.filter(id => !p.disabledIds?.has(id)), [sectionPhotoKeys, p.disabledIds])
    const selectedCount = useMemo(() => selectableKeys.filter(id => p.selectedIds?.has(id)).length, [selectableKeys, p.selectedIds])
    const allSelected = selectableKeys.length > 0 && selectedCount === selectableKeys.length
    const sectionToggleLabel = allSelected
        ? t('memories.deselectSection') || 'Deselect section'
        : t('memories.selectSection') || 'Select section'

    return <div key={p.sectionKey} style={{ padding: `${SECTION_PADDING}px`, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: '21px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-muted)', paddingLeft: '5px', lineHeight: 1 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, padding: '6px' }}>{p.sectionKey}</span>
            {p.onToggleSelectGroup && selectableKeys.length > 0 && (
                <button
                    onClick={() => p.onToggleSelectGroup?.(selectableKeys, allSelected)}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '20px',
                        height: '20px',
                        marginTop: '2px',
                        borderRadius: '50%',
                        border: '2px solid var(--text-muted)',
                        background: allSelected ? 'var(--text-muted)' : 'var(--bg-card)',
                        color: allSelected ? 'var(--bg-card)' : 'var(--text-muted)',
                        cursor: 'pointer',
                    }}
                    aria-label={sectionToggleLabel}
                    title={sectionToggleLabel}
                >
                    <Check size={12} strokeWidth={3} />
                </button>
            )}
        </div>
        <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${minItemSize}px, 1fr))`,
            gap: GRID_GAP,
            width: '100%',
        }}>
            {p.photos.map(photo => {
                const photoKey = photo.key
                const selected = p.selectedIds?.has(photoKey) ?? false
                const disabled = p.disabledIds?.has(photoKey) ?? false
                return (
                    <div key={photoKey} style={{ width: '100%', aspectRatio: '1 / 1' }}>
                        <PhotoElement
                            keyId={photoKey}
                            photo={photo}
                            tripId={p.tripId}
                            currentUserId={p.currentUser?.id}
                            onOpenLightbox={p.openLightbox}
                            onToggleSharing={p.onToggleSharing}
                            onRemovePhoto={p.onRemovePhoto}
                            selected={selected}
                            disabled={disabled}
                            loading={'lazy'}
                            onSelect={p.onToggleSelect}
                        />
                    </div>
                )
            })}
        </div>
    </div>
}