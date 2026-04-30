/**
 * Date formatting utilities
 * @module lib/format-date
 */

import { format as dateFnsFormat, formatDistance } from 'date-fns'

/**
 * Predefined date format types
 */
export type DateFormat =
  | 'short' // 10/5/23
  | 'medium' // Oct 5, 2023
  | 'long' // October 5, 2023
  | 'full' // Thursday, October 5, 2023
  | 'time' // 3:30 PM
  | 'datetime' // Oct 5, 2023, 3:30 PM
  | 'date' // 2023-10-05 (ISO 8601 date-only for API)
  | 'iso' // 2023-10-05T15:30:00.000Z
  | string // Custom format string for date-fns

/**
 * Date formatting options
 */
export interface FormatDateOptions {
  /** Predefined format type or custom date-fns format string */
  format?: DateFormat
  /** Locale for formatting (defaults to en-US) */
  locale?: string
}

/**
 * Options for formatting relative dates
 */
export interface FormatRelativeDateOptions {
  /** Format style: 'long' (default) or 'short' */
  style?: 'long' | 'short'
  /** Locale for formatting (defaults to en-US) */
  locale?: string
  /** Add "ago" suffix (defaults to true) */
  addSuffix?: boolean
}

/**
 * Default date formatting options
 */
const DEFAULT_OPTIONS: FormatDateOptions = {
  format: 'long',
  locale: 'en-US',
}

/**
 * Predefined format names without string type
 */
type PredefinedFormat = 'short' | 'medium' | 'long' | 'full' | 'time' | 'datetime' | 'date' | 'iso'

/**
 * Map predefined formats to date-fns format strings
 */
const FORMAT_MAP: Record<PredefinedFormat, string> = {
  short: 'M/d/yy',
  medium: 'MMM d, yyyy',
  long: 'MMMM d, yyyy',
  full: 'EEEE, MMMM d, yyyy',
  time: 'h:mm a',
  datetime: 'MMM d, yyyy, h:mm a',
  date: 'yyyy-MM-dd',
  iso: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
}

/**
 * Format a date for display
 *
 * @param date - Date to format (Date object, timestamp, or ISO string)
 * @param options - Formatting options
 * @returns Formatted date string
 *
 * @example
 * ```ts
 * formatDate(new Date()) // "October 5, 2023" (default 'long')
 * formatDate(new Date(), { format: 'short' }) // "10/5/23"
 * formatDate(new Date(), { format: 'full' }) // "Thursday, October 5, 2023"
 * formatDate(new Date(), { format: 'time' }) // "3:30 PM"
 * formatDate(new Date(), { format: 'date' }) // "2023-10-05" (ISO 8601 date-only)
 * formatDate(new Date(), { format: 'yyyy-MM-dd' }) // "2023-10-05" (custom)
 * ```
 */
export function formatDate(
  date: Date | number | string,
  options: FormatDateOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const dateObj = typeof date === 'object' ? date : new Date(date)

  // Handle invalid dates
  if (isNaN(dateObj.getTime())) {
    return 'Invalid date'
  }

  // Special handling for ISO format
  if (opts.format === 'iso') {
    return dateObj.toISOString()
  }

  // Get format string (either from map or use as-is for custom formats)
  const formatString = FORMAT_MAP[opts.format as PredefinedFormat] || opts.format || FORMAT_MAP.long

  try {
    return dateFnsFormat(dateObj, formatString)
  } catch (error) {
    // Fallback for invalid format strings
    return dateFnsFormat(dateObj, FORMAT_MAP.long)
  }
}

/**
 * Format a date as relative time
 *
 * @param date - Date to format
 * @param options - Formatting options
 * @returns Relative time string
 *
 * @example
 * ```ts
 * formatRelativeDate(new Date(Date.now() - 3600000)) // "about 1 hour ago"
 * formatRelativeDate(new Date(Date.now() - 3600000), { style: 'short' }) // "1h ago"
 * formatRelativeDate(new Date(Date.now() + 86400000)) // "in about 1 day"
 * formatRelativeDate(new Date(Date.now() + 86400000), { style: 'short' }) // "in 1d"
 * ```
 */
export function formatRelativeDate(
  date: Date | number | string,
  options: FormatRelativeDateOptions = {}
): string {
  const {
    style = 'long',
    locale = 'en-US',
    addSuffix = true
  } = options

  const dateObj = typeof date === 'object' ? date : new Date(date)
  const now = new Date()

  // Handle invalid dates
  if (isNaN(dateObj.getTime())) {
    return 'Invalid date'
  }

  if (style === 'short') {
    // Custom short format implementation
    const diffInSeconds = Math.round((dateObj.getTime() - now.getTime()) / 1000)
    const absDiff = Math.abs(diffInSeconds)
    const isPast = diffInSeconds < 0

    let value: number
    let unit: string

    if (absDiff < 60) {
      value = absDiff
      unit = 's'
    } else if (absDiff < 3600) {
      value = Math.floor(absDiff / 60)
      unit = 'm'
    } else if (absDiff < 86400) {
      value = Math.floor(absDiff / 3600)
      unit = 'h'
    } else if (absDiff < 604800) {
      value = Math.floor(absDiff / 86400)
      unit = 'd'
    } else if (absDiff < 2592000) {
      value = Math.floor(absDiff / 604800)
      unit = 'w'
    } else if (absDiff < 31536000) {
      value = Math.floor(absDiff / 2592000)
      unit = 'mo'
    } else {
      value = Math.floor(absDiff / 31536000)
      unit = 'y'
    }

    const formatted = `${value}${unit}`
    if (addSuffix) {
      return isPast ? `${formatted} ago` : `in ${formatted}`
    }
    return formatted
  } else {
    // Use date-fns for long format
    return formatDistance(dateObj, now, { addSuffix })
  }
}