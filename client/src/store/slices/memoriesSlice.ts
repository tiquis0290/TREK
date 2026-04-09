import type { StoreApi } from 'zustand'
import type { TripStoreState } from '../tripStore'
import apiClient, { addonsApi } from '../../api/client'
import { buildProviderMemoriesUrl, buildUnifiedMemoriesUrl } from '../../components/Memories/urlBuilders'
import type { AlbumLink, PhotoProvider, TripPhoto } from '../../components/Memories/types'

type SetState = StoreApi<TripStoreState>['setState']
type GetState = StoreApi<TripStoreState>['getState']

export interface MemoriesSlice {
  enabledProviders: PhotoProvider[]
  availableProviders: PhotoProvider[]
  selectedProvider: string
  connected: boolean
  loading: boolean
  loadingContent: boolean
  isOffline: boolean
  tripPhotos: TripPhoto[]
  albumLinks: AlbumLink[]
  syncing: number | null

  setSelectedProvider: (provider: string) => void
  setIsOffline: (offline: boolean) => void
  setTripPhotos: (photos: TripPhoto[] | ((prev: TripPhoto[]) => TripPhoto[])) => void
  setAlbumLinks: (links: AlbumLink[]) => void
  setLoadingContent: (loading: boolean) => void
  removeTripPhoto: (provider: string, assetId: string, userId: number) => void
  updateTripPhotoSharing: (provider: string, assetId: string, userId: number, shared: boolean) => void
  removeAlbumLink: (linkId: number) => void

  loadInitial: (tripId: number | string) => Promise<void>
  loadContent: (tripId: number | string) => Promise<void>
  loadPhotos: (tripId: number | string) => Promise<void>
  loadAlbumLinks: (tripId: number | string) => Promise<AlbumLink[]>
  syncAlbum: (tripId: number | string, linkId: number, provider?: string) => Promise<void>
  unlinkAlbum: (tripId: number | string, linkId: number) => Promise<void>
}

export const createMemoriesSlice = (set: SetState, get: GetState): MemoriesSlice => ({
  enabledProviders: [],
  availableProviders: [],
  selectedProvider: '',
  connected: false,
  loading: false,
  loadingContent: false,
  isOffline: false,
  tripPhotos: [],
  albumLinks: [],
  syncing: null,

  setSelectedProvider: (provider) => set({ selectedProvider: provider }),
  setTripPhotos: (photos) => set((state) => ({
    tripPhotos: typeof photos === 'function' ? photos(state.tripPhotos) : photos,
  })),
  setAlbumLinks: (links) => set({ albumLinks: links }),
  setLoadingContent: (loading) => set({ loadingContent: loading }),
  setIsOffline: (offline) => set({ isOffline: offline }),
  removeTripPhoto: (provider, assetId, userId) => set((state) => ({
    tripPhotos: state.tripPhotos.filter(photo => !(photo.provider === provider && photo.asset_id === assetId && photo.user_id === userId)),
  })),
  updateTripPhotoSharing: (provider, assetId, userId, shared) => set((state) => ({
    tripPhotos: state.tripPhotos.map(photo =>
      photo.provider === provider && photo.asset_id === assetId && photo.user_id === userId
        ? { ...photo, shared: shared ? 1 : 0 }
        : photo
    ),
  })),
  removeAlbumLink: (linkId) => set((state) => ({
    albumLinks: state.albumLinks.filter(link => link.id !== linkId),
    tripPhotos: state.tripPhotos.filter(photo => photo.album_link_id !== linkId),
  })),

  loadInitial: async (tripId) => {
    set({ loading: true, isOffline: false })

    try {
      const addonsRes = await addonsApi.enabled().catch(() => ({ addons: [] as any[] }))
      const enabledAddons = addonsRes?.addons || []
      const photoProviders = enabledAddons.filter((a: any) => a.type === 'photo_provider' && a.enabled)
        .map((a: any) => ({ id: a.id, name: a.name, icon: a.icon, config: a.config }))

      set({ enabledProviders: photoProviders })

      const statusResults = await Promise.all(photoProviders.map(async (provider) => {
        const statusUrl = (provider.config as Record<string, unknown>)?.status_get as string
        if (!statusUrl) return { provider, connected: false }
        try {
          const res = await apiClient.get(statusUrl)
          return { provider, connected: !!res.data?.connected }
        } catch {
          return { provider, connected: false }
        }
      }))

      const connectedProviders = statusResults
        .filter(r => r.connected)
        .map(r => r.provider)

      set({
        availableProviders: connectedProviders,
        connected: connectedProviders.length > 0,
      })

      if (connectedProviders.length > 0 && !get().selectedProvider) {
        set({ selectedProvider: connectedProviders[0].id })
      }
    } catch {
      set({ isOffline: true })
    } finally {
      set({ loading: false })
      await get().loadContent(tripId)
    }
  },

  loadContent: async (tripId) => {
    set({ loadingContent: true })
    try {
      await Promise.all([
        get().loadPhotos(tripId),
        get().loadAlbumLinks(tripId),
      ])
    } finally {
      set({ loadingContent: false })
    }
  },

  loadPhotos: async (tripId) => {
    try {
      const photosRes = await apiClient.get(buildUnifiedMemoriesUrl(Number(tripId), 'photos'))
      const photos: TripPhoto[] = (photosRes.data.photos || []).map((photo: TripPhoto) => ({
        ...photo,
        key: `${tripId}::${photo.user_id}::${photo.provider}::${photo.asset_id}`,
      }))
      set({ tripPhotos: photos, isOffline: false })
    } catch {
      set({ isOffline: true })
    }
  },

  loadAlbumLinks: async (tripId) => {
    try {
      const res = await apiClient.get(buildUnifiedMemoriesUrl(Number(tripId), 'album-links'))
      const links = res.data.links || []
      set({ albumLinks: links, isOffline: false })
      return links
    } catch {
      set({ isOffline: true })
      return get().albumLinks
    }
  },

  syncAlbum: async (tripId, linkId, provider) => {
    const targetProvider = provider || get().selectedProvider
    if (!targetProvider) return
    set({ syncing: linkId })
    try {
      await apiClient.post(buildProviderMemoriesUrl(Number(tripId), targetProvider, 'album-link-sync', linkId.toString()))
      await get().loadContent(tripId)
    } finally {
      set({ syncing: null })
    }
  },

  unlinkAlbum: async (tripId, linkId) => {
    await apiClient.delete(buildUnifiedMemoriesUrl(Number(tripId), 'album-links', linkId.toString()))
    set((state) => ({
      albumLinks: state.albumLinks.filter(link => link.id !== linkId),
      tripPhotos: state.tripPhotos.filter(photo => photo.album_link_id !== linkId),
    }))
  },
})
