import { User } from "../../../types";
import { useRef, useState, type UIEvent } from 'react'

import { Camera, Plus, X, ArrowUpDown, Link2, RefreshCw, FolderOpen, Check } from 'lucide-react'
import { PhotoElement } from "./PhotoElement";
import { TripPhoto } from "../types";
import apiClient from "../../../api/client";
import { buildUnifiedMemoriesUrl } from "../urlBuilders";
import { useTranslation } from "../../../i18n";
import useToast from "../../shared/Toast";




interface PhotoGalleryProps {
  allVisible: TripPhoto[];
  currentUser: User | null;
  buildProviderAssetUrl: (photo: TripPhoto, what: string) => string;
  openLightbox: (photo: TripPhoto) => void;
  openPicker: () => void;
  setTripPhotos: React.Dispatch<React.SetStateAction<TripPhoto[]>>;
  tripId: number;
  groupBy: 'day' | 'week' | 'month';
  sortOrder: 'newest' | 'oldest';
  selectionEnabled?: boolean;
  selectedIds?: Set<string>;
  disabledIds?: Set<string>;
  onToggleSelect?: (photo: TripPhoto) => void;
  onToggleSelectGroup?: (groupPhotos: TripPhoto[]) => void;
  header?: React.ReactNode;
  loadingContent?: boolean;
  itemMinSize?: number;
}

export function PhotoGallery(p: PhotoGalleryProps) {
  const { t } = useTranslation()
  const toast = useToast()

  const [showCompactHeader, setShowCompactHeader] = useState(false)
  const [isAtTop, setIsAtTop] = useState(true)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const lastScrollTop = useRef(0)

  // ── Remove photo ──────────────────────────────────────────────────────────

  const removePhoto = async (photo: TripPhoto) => {
    try {
      await apiClient.delete(buildUnifiedMemoriesUrl(p.tripId, 'photos'), {
        data: {
          asset_id: photo.asset_id,
          provider: photo.provider,
        },
      })
      p.setTripPhotos(prev => prev.filter(p => !(p.provider === photo.provider && p.asset_id === photo.asset_id)))
    } catch { toast.error(t('memories.error.removePhoto')) }
  }

  // ── Toggle sharing ────────────────────────────────────────────────────────

  const toggleSharing = async (photo: TripPhoto, shared: boolean) => {
    try {
      await apiClient.put(buildUnifiedMemoriesUrl(p.tripId, 'photos', 'sharing'), {
        shared,
        asset_id: photo.asset_id,
        provider: photo.provider,
      })
      p.setTripPhotos(prev => prev.map(p =>
        p.provider === photo.provider && p.asset_id === photo.asset_id ? { ...p, shared: shared ? 1 : 0 } : p
      ))
    } catch { toast.error(t('memories.error.toggleSharing')) }
  }

  // -- scroll handling for compact header ---

  const handleScroll = async (event: UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop
    const delta = scrollTop - lastScrollTop.current
    const minShow = headerRef.current?.offsetHeight * 1.1 || 100
    let nextShow = showCompactHeader
    let mindelta = 1

    if (scrollTop < minShow) {
      nextShow = true
    } 
    if (delta < -mindelta) {
      nextShow = true
    } else if (delta > mindelta) {
      nextShow = false
    }

    if (nextShow !== showCompactHeader) {
      await new Promise<void>(resolve => setTimeout(resolve, 1));
      setShowCompactHeader(nextShow);
    }
    lastScrollTop.current = scrollTop
  }



  // Helper: get date key for grouping
  function getDateKey(photo: TripPhoto) {
    const dateStr = photo.taken_at || photo.added_at;
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    if (p.groupBy === 'day') {
      return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric', day: 'numeric' });
    } else if (p.groupBy === 'week') {
      // Calculate week start (Monday) and end (Sunday)
      const day = date.getDay();
      const diffToMonday = (day + 6) % 7; // 0 (Sun) -> 6, 1 (Mon) -> 0, ...
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - diffToMonday);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Only show month/year once if same
      const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
      const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();

      let label = "";
      if (sameYear && sameMonth) {
        // Apr 6 – 12, 2026
        label = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;
      } else if (sameYear && !sameMonth) {
        // Mar 30 – Apr 5, 2026
        label = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${weekEnd.getFullYear()}`;
      } else {
        // Dec 28, 2025 – Jan 3, 2026
        label = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
      return label;
    } else if (p.groupBy === 'month') {
      return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    return 'Unknown';
  }

  // Group photos
  const sortedPhotos = [...p.allVisible].sort((a, b) => {
    const aDate = new Date(a.taken_at || a.added_at || 0).getTime();
    const bDate = new Date(b.taken_at || b.added_at || 0).getTime();
    return p.sortOrder === 'newest' ? bDate - aDate : aDate - bDate;
  });
  const grouped: Record<string, TripPhoto[]> = {};
  for (const photo of sortedPhotos) {
    const key = getDateKey(photo);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(photo);
  }
  const groupKeys = Object.keys(grouped);

  if (p.sortOrder === 'newest') {
    groupKeys.sort((a, b) => new Date(b.split(' ')[0]).getTime() - new Date(a.split(' ')[0]).getTime());
  } else {
    groupKeys.sort((a, b) => new Date(a.split(' ')[0]).getTime() - new Date(b.split(' ')[0]).getTime());
  }

  return <>

    <div style={{ flex: 1, overflowY: 'auto' }} onScroll={handleScroll}>
      <div ref={headerRef}
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 8,
          overflow: 'hidden',
          transition: 'transform 160ms ease 0s, opacity 160ms 0s',
          transform: showCompactHeader ? 'translateY(0)' : 'translateY(-100%)',
          opacity: showCompactHeader ? 1 : 0,
          pointerEvents: showCompactHeader ? 'auto' : 'none',
        }}>
        {p.header}
      </div>
      {p.loadingContent ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <div className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
        </div>
      ) : <>
        {p.allVisible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5875cm 0.5292cm' }}>
            <Camera size={40} style={{ color: 'var(--text-faint)', margin: '0 auto 0.3175cm', display: 'block' }} />
            <p style={{ fontSize: '0.3704cm', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 0.3175cm' }}>
              {t('memories.noPhotos')}
            </p>
            <button onClick={p.openPicker}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.1323cm', padding: '0.2381cm 0.4763cm', borderRadius: '0.2646cm',
                border: 'none', background: 'var(--text-primary)', color: 'var(--bg-primary)',
                fontSize: '0.3440cm', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <Plus size={15} /> {t('memories.addPhotos')}
            </button>
          </div>
        ) : (
          groupKeys.map(key => (
            <div key={key} style={{ padding: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.1588cm', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.2117cm', fontSize: '0.3704cm', fontWeight: 700, color: 'var(--text-muted)', paddingLeft: '0.0529cm', lineHeight: 1 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}>{key}</span>
                  {p.selectionEnabled && p.onToggleSelectGroup && (() => {
                    const sectionKeys = grouped[key].map(photo => `${photo.provider}::${photo.asset_id}`)
                    const selectableKeys = sectionKeys.filter(id => !p.disabledIds?.has(id))
                    const selectedCount = selectableKeys.filter(id => p.selectedIds?.has(id)).length
                    const allSelected = selectableKeys.length > 0 && selectedCount === selectableKeys.length
                    return (
                      <button
                        onClick={() => p.onToggleSelectGroup(grouped[key])}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '0.5292cm',
                          height: '0.5292cm',
                          borderRadius: '50%',
                          border: '0.0265cm solid var(--text-muted)',
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
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${p.itemMinSize ?? 4}cm, 1fr))`, gap: 6 }}>
                {grouped[key].map(photo => {
                  const photoKey = `${photo.user_id}::${photo.provider}::${photo.asset_id}`
                  const selected = p.selectedIds?.has(photoKey) ?? false
                  const disabled = p.disabledIds?.has(photoKey) ?? false
                  const selectionMode = Boolean(p.selectionEnabled && p.onToggleSelect)
                  return (
                    <PhotoElement
                      key={photoKey}
                      photo={photo}
                      currentUserId={p.currentUser?.id}
                      buildProviderAssetUrl={p.buildProviderAssetUrl}
                      onOpenLightbox={selectionMode ? () => { } : p.openLightbox}
                      onToggleSharing={toggleSharing}
                      onRemovePhoto={removePhoto}
                      selectable={selectionMode}
                      selected={selected}
                      disabled={disabled}
                      onSelect={p.onToggleSelect}
                    />
                  )
                })}
              </div>
            </div>
          ))
        )
        }
      </>}
    </div>
  </>;

}
