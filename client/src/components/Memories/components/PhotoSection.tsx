import { Check } from "lucide-react"
import { PhotoElement } from "./PhotoElement"
import { useTranslation } from "../../../i18n"
import { TripPhoto } from "../utils/types"
import { User } from "../../../types"
import { ReactNode, useEffect, useMemo, useRef, useState } from "react"
import { getScrollableParent, observeIntersection } from "../utils/intersectionHelpers"


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
const HEADER_HEIGHT = 40

function chunkPhotos<T>(items: T[], size: number): T[][] {
    if (size <= 0) return [items]
    const rows: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        rows.push(items.slice(i, i + size))
    }
    return rows
}

function PhotoRow({ children, itemSize, observe = true }: { children: ReactNode, itemSize: number, observe?: boolean }) {
    const element = useRef<HTMLDivElement | null>(null)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        if (observe) {
            return observeIntersection(element.current, setVisible)
        } else {
            setVisible(true)
        }
    }, [children, observe])

    return (
        <div
            ref={element}
            style={{
                width: '100%',
                height: visible ? 'auto' : itemSize,
                display: 'flex',
                gap: 6,
                overflow: 'visible',
            }}
        >
            {visible && children}
        </div>
    )
}

export function PhotoSection(p: PhotoSectionProps) {
    const { t } = useTranslation()
    const element = useRef<HTMLDivElement | null>(null)
    const [isVisible, setIsVisible] = useState(true)
    const [columns, setColumns] = useState(1)
    const [itemSize, setItemSize] = useState(p.itemMinSize ?? DEFAULT_MIN_ITEM_SIZE)
    const [height, setHeight] = useState(0)
    const sectionRows = useMemo(() => chunkPhotos(p.photos, Math.max(1, columns)), [p.photos, columns])
    const sectionPhotoKeys = useMemo(() => p.photos.map(photo => photo.key), [p.photos])
    const selectableKeys = useMemo(() => sectionPhotoKeys.filter(id => !p.disabledIds?.has(id)), [sectionPhotoKeys, p.disabledIds])
    const selectedCount = useMemo(() => selectableKeys.filter(id => p.selectedIds?.has(id)).length, [selectableKeys, p.selectedIds])
    const allSelected = selectableKeys.length > 0 && selectedCount === selectableKeys.length
    const sectionToggleLabel = allSelected
        ? t('memories.deselectSection') || 'Deselect section'
        : t('memories.selectSection') || 'Select section'
    
    useEffect(() => {
        if (!element.current || typeof IntersectionObserver === 'undefined') {
            setIsVisible(true)
            return
        }

        const scrollParent = getScrollableParent(element.current)
        const width = (scrollParent?.clientWidth ?? window.innerWidth) - 14
        const minItemSize = p.itemMinSize ?? DEFAULT_MIN_ITEM_SIZE
        const columnCount = Math.max(1, Math.floor(width / (minItemSize + GRID_GAP)))
        const computedSize = (width - columnCount * GRID_GAP) / columnCount
        const rowCount = Math.ceil(p.photos.length / columnCount)

        setColumns(columnCount)
        setItemSize(computedSize)
        setHeight(rowCount * (computedSize + GRID_GAP) - GRID_GAP + SECTION_PADDING * 2 + HEADER_HEIGHT)

        return observeIntersection(element.current, setIsVisible)
    }, [p.photos.length, p.itemMinSize])

    return <div key={p.sectionKey} ref={element} style={{ padding: `${SECTION_PADDING}px`, height, overflow: 'hidden', width: '100%' }}>
        {isVisible && <>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: GRID_GAP, width: '100%' }}>
                {sectionRows.map((row, rowIndex) => (
                    <PhotoRow key={`${p.sectionKey}-row-${rowIndex}`} itemSize={itemSize}>
                        {row.map(photo => {
                            const photoKey = photo.key
                            const selected = p.selectedIds?.has(photoKey) ?? false
                            const disabled = p.disabledIds?.has(photoKey) ?? false
                            return (
                                <div key={photoKey} style={{ flex: `0 0 ${itemSize}px`, width: itemSize, height: itemSize }}>
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
                    </PhotoRow>
                ))}
            </div>
        </>}
    </div>
}