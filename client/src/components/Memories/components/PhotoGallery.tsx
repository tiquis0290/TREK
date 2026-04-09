import { User } from "../../../types";
import { useRef, useState, type ReactNode, type UIEvent } from 'react'
import { Camera, Plus, Check } from 'lucide-react'
import { PhotoElement } from "./PhotoElement";
import { TripPhoto } from "../types";
import { buildUnifiedMemoriesUrl } from "../urlBuilders";
import { useTranslation } from "../../../i18n";
import apiClient from "../../../api/client";
import useToast from "../../shared/Toast";

interface PhotoGalleryProps {
  allVisible: TripPhoto[];
  currentUser: User | null;
  openLightbox: (photo: TripPhoto) => void;
  openPicker: () => void;
  setTripPhotos: React.Dispatch<React.SetStateAction<TripPhoto[]>>;
  tripId: number;
  groupBy: 'day' | 'week' | 'month';
  sortOrder: 'newest' | 'oldest';
  selectionEnabled?: boolean;
  selectedIds?: Set<string>;
  disabledIds?: Set<string>;
  onToggleSelect?: (key: string) => void;
  onToggleSelectGroup?: (keys: string[], oldState: boolean) => void;
  header?: React.ReactNode;
  loadingContent?: boolean;
  loadingMore?: boolean;
  itemMinSize?: number;
  scrollRef?: React.MutableRefObject<HTMLDivElement>;
  onscroll?: (event: UIEvent<HTMLDivElement>) => void;
  canAddPhotos?: boolean;
  afterItems?: ReactNode;
  isOffline?: boolean;
}

export function PhotoGallery(p: PhotoGalleryProps) {
  const { t } = useTranslation()
  const toast = useToast()

  const [showHeader, setShowHeader] = useState(true)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const lastScrollTop = useRef(0)

  // ── Remove photo ──────────────────────────────────────────────────────────

  const removePhoto = async (photo: TripPhoto) => {
    if (p.isOffline) {
      toast.error(t('memories.error.offline') || 'Offline mode: action unavailable')
      return
    }

    try {
      await apiClient.delete(buildUnifiedMemoriesUrl(p.tripId, 'photos'), {
        data: {
          asset_id: photo.asset_id,
          provider: photo.provider,
        },
      })
      p.setTripPhotos(prev => prev.filter(p => !(p.provider === photo.provider && p.asset_id === photo.asset_id && p.user_id === photo.user_id)))
    } catch { toast.error(t('memories.error.removePhoto')) }
  }

  // ── Toggle sharing ────────────────────────────────────────────────────────

  const toggleSharing = async (photo: TripPhoto, shared: boolean) => {
    if (p.isOffline) {
      toast.error(t('memories.error.offline') || 'Offline mode: action unavailable')
      return
    }

    try {
      await apiClient.put(buildUnifiedMemoriesUrl(p.tripId, 'photos', 'sharing'), {
        shared,
        asset_id: photo.asset_id,
        provider: photo.provider,
      })
      p.setTripPhotos(prev => prev.map(p =>
        p.provider === photo.provider && p.asset_id === photo.asset_id && p.user_id === photo.user_id
          ? { ...p, shared: shared ? 1 : 0 }
          : p
      ))
    } catch { toast.error(t('memories.error.toggleSharing')) }
  }

  // -- scroll handling for compact header ---

  const [lastHeaderHeight, setLastHeaderHeight] = useState(0)

  const handleScroll = async (event: UIEvent<HTMLDivElement>) => {
    const scrollTop = event.currentTarget.scrollTop
    const delta = scrollTop - lastScrollTop.current
    const minShow = headerRef.current?.offsetHeight * 1.1 || 100
    if (lastHeaderHeight !== headerRef.current?.offsetHeight) {
      setLastHeaderHeight(headerRef.current?.offsetHeight || 0)
      return
    }
    let nextShow = showHeader
    let mindelta = 1

    if (scrollTop < minShow) {
      nextShow = true
    }
    if (delta < -mindelta) {
      nextShow = true
    } else if (delta > mindelta) {
      nextShow = false
    }

    if (nextShow !== showHeader) {
      await new Promise<void>(resolve => setTimeout(resolve, 1));
      setShowHeader(nextShow);
    }
    lastScrollTop.current = scrollTop
    if (p.onscroll) p.onscroll(event)
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
    <div style={{ overflowY: 'auto', height: '100%' }} onScroll={handleScroll} ref={p.scrollRef}>
      <div ref={headerRef}
        style={{
          position: 'sticky',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 8,
          overflow: 'hidden',
          transition: 'transform 160ms ease 0s, opacity 160ms 0s',
          transform: showHeader ? 'translateY(0)' : 'translateY(-100%)',
          opacity: showHeader ? 1 : 0,
          pointerEvents: showHeader ? 'auto' : 'none',
        }}>
        {p.header}
      </div>
      {p.loadingContent ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '300px' }}>
          <div className="w-8 h-8 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }} />
        </div>
      ) : p.allVisible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          {p.canAddPhotos ? (
            <>
              <Camera size={40} style={{ color: 'var(--text-faint)', margin: '0 auto 12px', display: 'block' }} />
              <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                {t('memories.noPhotos')}
              </p>
              <button onClick={p.openPicker}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '9px 18px', borderRadius: '10px',
                  border: 'none', background: 'var(--text-primary)', color: 'var(--bg-primary)',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>
                <Plus size={15} /> {t('memories.addPhotos')}
              </button>
            </>
          ) : null}
          {p.afterItems}
        </div>
      ) : (<>
        {groupKeys.map(key => (
          <div key={key} style={{ padding: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '21px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-muted)', paddingLeft: '5px', lineHeight: 1 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, padding: '6px' }}>{key}</span>
              {p.onToggleSelectGroup && (() => {
                const sectionKeys = grouped[key].map(photo => photo.key)
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
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${((p.itemMinSize ?? 4) * 37.795).toFixed(2)}px, 1fr))`, gap: 6 }}>
              {grouped[key].map(photo => {
                const photoKey = photo.key
                const selected = p.selectedIds?.has(photoKey) ?? false
                const disabled = p.disabledIds?.has(photoKey) ?? false
                return (
                  <PhotoElement
                    key={photoKey}
                    keyId={photoKey}
                    photo={photo}
                    tripId={p.tripId}
                    currentUserId={p.currentUser?.id}
                    onOpenLightbox={p.openLightbox}
                    onToggleSharing={toggleSharing}
                    onRemovePhoto={removePhoto}
                    selected={selected}
                    disabled={disabled}
                    onSelect={p.onToggleSelect}
                  />
                )
              })}
            </div>
          </div>
        ))}
        {p.loadingMore && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
            <div
              className="w-7 h-7 border-2 rounded-full animate-spin"
              style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--text-primary)' }}
            />
          </div>
        )}
        {p.afterItems}
      </>
      )}
    </div>
  </>;
}
