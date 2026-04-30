/**
 * Presentation-shape types for the booking feature.
 *
 * These are view models — flatter and friendlier than the raw OpenAPI shapes
 * for what a UI actually needs (e.g. a host's display name, a slot grouped
 * by date). Routes are responsible for adapting `@monobase/sdk-ts/generated`
 * types to these before passing them into widgets.
 */

import type { BookingEvent, LocationType } from '@monobase/sdk-ts/generated/types.gen'

export type { BookingEvent } from '@monobase/sdk-ts/generated/types.gen'

/**
 * Display-shaped time slot. Keeps `date` separate from `startTime` so the
 * widget can group slots by day without re-parsing every render.
 */
export interface BookingTimeSlot {
  id: string
  hostId: string
  date: Date
  startTime: Date
  endTime: Date
  status: 'available' | 'booked' | 'blocked'
  locationTypes: LocationType[]
  price: number
  billingOverride?: {
    price?: number
    currency?: string
    paymentRequired?: boolean
    freeCancellationMinutes?: number
  }
}

/**
 * Display-shaped host. Built from a `Person` plus profile metadata; not
 * itself in the API spec.
 */
export interface BookingHost {
  id: string
  name: string
  email?: string
  avatar?: string
  bio?: string
  city?: string
  state?: string
  languages?: string[]
}

export type BookingEventData = BookingEvent
