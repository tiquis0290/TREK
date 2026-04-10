import type { TripPhoto } from './types'

export function getPhotoTimestamp(photo: TripPhoto): number {
  return new Date(photo.taken_at || photo.added_at || 0).getTime()
}

export function getGroupLabel(photo: TripPhoto, groupBy: 'day' | 'week' | 'month'): string {
  const dateValue = photo.taken_at || photo.added_at
  if (!dateValue) return 'Unknown'

  const date = new Date(dateValue)
  if (groupBy === 'day') {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      year: 'numeric',
      day: 'numeric',
    })
  }

  if (groupBy === 'week') {
    const day = date.getDay()
    const diffToMonday = (day + 6) % 7
    const weekStart = new Date(date)
    weekStart.setDate(date.getDate() - diffToMonday)
    weekStart.setHours(0, 0, 0, 0)

    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    const sameMonth = weekStart.getMonth() === weekEnd.getMonth()
    const sameYear = weekStart.getFullYear() === weekEnd.getFullYear()

    if (sameYear && sameMonth) {
      return `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`
    }
    if (sameYear) {
      return `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${weekEnd.getFullYear()}`
    }
    return `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${weekEnd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }

  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}
