import { Photo, User } from "../../../types";

import { Camera, Plus, X, ArrowUpDown, Link2, RefreshCw, FolderOpen } from 'lucide-react'
import { useState } from 'react';
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
}

export function PhotoGallery({ allVisible, currentUser, buildProviderAssetUrl, openLightbox, openPicker, setTripPhotos, tripId, groupBy, sortOrder }: PhotoGalleryProps) {
  const { t } = useTranslation()
  const toast = useToast()
    
  // ── Remove photo ──────────────────────────────────────────────────────────

  const removePhoto = async (photo: TripPhoto) => {
    try {
      await apiClient.delete(buildUnifiedMemoriesUrl(tripId, 'photos'), {
        data: {
          asset_id: photo.asset_id,
          provider: photo.provider,
        },
      })
      setTripPhotos(prev => prev.filter(p => !(p.provider === photo.provider && p.asset_id === photo.asset_id)))
    } catch { toast.error(t('memories.error.removePhoto')) }
  }

  // ── Toggle sharing ────────────────────────────────────────────────────────

  const toggleSharing = async (photo: TripPhoto, shared: boolean) => {
    try {
      await apiClient.put(buildUnifiedMemoriesUrl(tripId ,'photos', 'sharing'), {
        shared,
        asset_id: photo.asset_id,
        provider: photo.provider,
      })
      setTripPhotos(prev => prev.map(p =>
        p.provider === photo.provider && p.asset_id === photo.asset_id ? { ...p, shared: shared ? 1 : 0 } : p
      ))
    } catch { toast.error(t('memories.error.toggleSharing')) }
  }




  // Helper: get date key for grouping
  function getDateKey(photo: TripPhoto) {
    const dateStr = photo.taken_at || photo.added_at;
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    if (groupBy === 'day') {
      return date.toLocaleDateString(undefined, {month: 'short', year: 'numeric', day: 'numeric' });
    } else if (groupBy === 'week') {
      // Calculate week start (Monday) and end (Sunday)
      const day = date.getDay();
      const diffToMonday = (day + 6) % 7; // 0 (Sun) -> 6, 1 (Mon) -> 0, ...
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - diffToMonday);
      weekStart.setHours(0,0,0,0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23,59,59,999);

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
    } else if (groupBy === 'month') {
      return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    return 'Unknown';
  }

  // Group photos
  const sortedPhotos = [...allVisible].sort((a, b) => {
    const aDate = new Date(a.taken_at || a.added_at || 0).getTime();
    const bDate = new Date(b.taken_at || b.added_at || 0).getTime();
    return sortOrder === 'newest' ? bDate - aDate : aDate - bDate;
  });
  const grouped: Record<string, TripPhoto[]> = {};
  for (const photo of sortedPhotos) {
    const key = getDateKey(photo);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(photo);
  }
  const groupKeys = Object.keys(grouped);
  
  if (sortOrder === 'newest') {
    groupKeys.sort((a, b) => new Date(b.split(' ')[0]).getTime() - new Date(a.split(' ')[0]).getTime());
  } else {
    groupKeys.sort((a, b) => new Date(a.split(' ')[0]).getTime() - new Date(b.split(' ')[0]).getTime());
  }

  return <>
    <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
      {allVisible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Camera size={40} style={{ color: 'var(--text-faint)', margin: '0 auto 12px', display: 'block' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
            {t('memories.noPhotos')}
          </p>
          <button onClick={openPicker}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '9px 18px', borderRadius: 10,
              border: 'none', background: 'var(--text-primary)', color: 'var(--bg-primary)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            <Plus size={15} /> {t('memories.addPhotos')}
          </button>
        </div>
      ) : (
        groupKeys.map(key => (
          <div key={key} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, paddingLeft: 2 }}>
                {key}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
              {grouped[key].map(photo => (
                <PhotoElement
                  key={`${photo.provider}:${photo.asset_id}`}
                  photo={photo}
                  currentUserId={currentUser?.id}
                  buildProviderAssetUrl={buildProviderAssetUrl}
                  onOpenLightbox={openLightbox}
                  onToggleSharing={toggleSharing}
                  onRemovePhoto={removePhoto}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>

    <style>{'.memories-avatar:hover .memories-avatar-tooltip { opacity: 1 !important; }'}</style>
  </>;

}
