import type { TripPhoto } from './types'

const MEMORIES_ADDON_PREFIX = '/integrations/memories'

export function buildUnifiedMemoriesUrl(tripId: number, endpoint: string, lastParam?: string): string {
  const trailingSegment = lastParam ? `/${lastParam}` : ''
  return `${MEMORIES_ADDON_PREFIX}/unified/trips/${tripId}/${endpoint}${trailingSegment}`
}

export function buildProviderMemoriesUrl(tripId: number, provider: string, endpoint: string, item?: string): string {
  let providerEndpoint = endpoint
  if (providerEndpoint === 'album-link-sync') {
    const albumLinkIdSegment = item?.toString() || ''
    providerEndpoint = `trips/${tripId}/album-links/${albumLinkIdSegment}/sync`
  }
  return `${MEMORIES_ADDON_PREFIX}/${provider}/${providerEndpoint}`
}

export function buildProviderAssetMemoriesUrl(tripId: number, photo: TripPhoto, what: string): string {
  return `${MEMORIES_ADDON_PREFIX}/${photo.provider}/assets/${tripId}/${photo.asset_id}/${photo.user_id}/${what}`
}
