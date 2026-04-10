import { Check } from "lucide-react"
import { PhotoElement } from "./PhotoElement"
import { useTranslation } from "../../../i18n"
import { TripPhoto } from "../types"
import { User } from "../../../types"
import { ReactNode, useEffect, useRef, useState } from "react"
import { getScrollableParent, observeIntersection } from "./intersectionHelpers"


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

function chunkPhotos<T>(items: T[], size: number): T[][] {
    if (size <= 0) return [items]
    const rows: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        rows.push(items.slice(i, i + size))
    }
    return rows
}

function PhotoRow({ children, itemSize }: { children: ReactNode, itemSize: number }) {
    const element = useRef<HTMLDivElement | null>(null)
    const [visible, setVisible] = useState(false)

    useEffect(() => {
        return observeIntersection(element.current, setVisible)
    }, [children])

    return (
        <div
            ref={element}
            style={{
                width: '100%',
                height: visible ? 'auto' : itemSize,
                display: 'flex',
                gap: 6,
                marginBottom: 6,
                overflow: 'hidden',
            }}
        >
            {visible && children}
        </div>
    )
}

export function PhotoSection(p: PhotoSectionProps) {
    
    const { t } = useTranslation()
    const element = useRef<HTMLDivElement | null>(null)
    const [close, setClose] = useState(true)
    const [columns, setColumns] = useState(1)
    const [itemSize, setItemSize] = useState(p.itemMinSize ?? 160)
    const [height, setHeight] = useState(0)

    useEffect(() => {
        if (!element.current || typeof IntersectionObserver === 'undefined') {
            setClose(true)
            return
        }

        const scrollParent = getScrollableParent(element.current)
        const width = (scrollParent?.clientWidth ?? window.innerWidth) - 14
        const columnCount = Math.max(1, Math.floor(width / ((p.itemMinSize ?? 160) + 6)))
        const computedSize = (width - columnCount * 6) / columnCount

        setColumns(columnCount)
        setItemSize(computedSize)
        setHeight(Math.ceil(p.photos.length / columnCount) * (computedSize + 6) - 6 + 20 + 39)

        return observeIntersection(element.current, setClose, '0px')
    }, [p.photos.length, p.itemMinSize])

    return <div key={p.sectionKey} ref={element} style={{ padding: 10, height: close ? undefined : height, overflow: 'hidden', width: '100%' }}>
        {close && <>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '21px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-muted)', paddingLeft: '5px', lineHeight: 1 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, padding: '6px' }}>{p.sectionKey}</span>
                {p.onToggleSelectGroup && (() => {
                    const sectionKeys = p.photos.map(photo => photo.key)
                    const selectableKeys = sectionKeys.filter(id => !p.disabledIds?.has(id))
                    if (selectableKeys.length === 0) return null
                    const selectedCount = selectableKeys.filter(id => p.selectedIds?.has(id)).length
                    const allSelected = selectedCount === selectableKeys.length
                    return (
                        <button
                            onClick={() => p.onToggleSelectGroup(selectableKeys, allSelected)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '20px',
                                height: '20px',
                                marginTop: '2px',
                                borderRadius: '50%',
                                border: '3px solid var(--text-muted)',
                                background: allSelected ? 'var(--text-muted)' : 'var(--bg-card)',
                                color: allSelected ? 'var(--bg-card)' : 'var(--text-muted)',
                                cursor: 'pointer',
                            }}
                            aria-label={allSelected ? t('memories.deselectSection') || 'Deselect section' : t('memories.selectSection') || 'Select section'}
                            title={allSelected ? t('memories.deselectSection') || 'Deselect section' : t('memories.selectSection') || 'Select section'}
                        >
                            {allSelected && <Check size={12} />}
                        </button>
                    )
                })()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                {chunkPhotos(p.photos, Math.max(1, columns)).map((row, rowIndex) => (
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