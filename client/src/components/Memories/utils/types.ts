export interface PhotoMetadata {
  provider: string
  taken_at?: string | null
  city?: string | null
  country?: string | null
}

export interface PhotoProvider {
  id: string
  name: string
  icon?: string
  config?: Record<string, unknown>
}

export interface TripPhoto extends PhotoMetadata {
  asset_id: string
  user_id: number
  username: string
  avatar?: string | null
  shared: number
  added_at: string
  album_link_id?: number | null
  key: string
}

export interface Asset extends PhotoMetadata {
  id: string
  takenAt?: string | null
}

export interface Album {
  id: string
  albumName: string
  assetCount: number
}

export interface AlbumLink {
  id: number
  provider: string
  album_id: string
  album_name: string
  user_id: number
  username: string
  sync_enabled: number
  last_synced_at: string | null
}

export interface MemoriesPanelProps {
  tripId: number
  startDate: string | null
  endDate: string | null
}
