'use client'

import { useState, useMemo } from 'react'
import { addDays, isSameDay } from 'date-fns'
import { Clock, Shield, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format-date'
import { Button } from '@/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/card'
import { Separator } from '@/components/separator'
import { Alert, AlertDescription } from '@/components/alert'
import type { BookingTimeSlot, BookingHost, BookingEventData } from '@/features/booking/types'

export type { BookingTimeSlot, BookingHost, BookingEventData }

export interface BookingWidgetProps {
  host: BookingHost
  slots: BookingTimeSlot[]
  event?: BookingEventData
  onSlotSelect: (slot: BookingTimeSlot) => void
  className?: string
}

export function BookingWidget({
  host,
  slots,
  event,
  onSlotSelect,
  className
}: BookingWidgetProps): React.JSX.Element {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedSlot, setSelectedSlot] = useState<BookingTimeSlot | null>(null)

  // Group slots by date using useMemo to avoid recalculation
  const slotsByDate = useMemo(() => groupSlotsByDate(slots), [slots])

  // Generate dates for the next 7 days
  const dates = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i))

  // Get available slots for selected date
  const selectedDateStr = formatDate(selectedDate, { format: 'yyyy-MM-dd' })
  const selectedDateSlots = slotsByDate[selectedDateStr] || []
  const availableSlots = selectedDateSlots.filter(slot => slot.status === 'available')

  const handleSlotSelect = (slot: BookingTimeSlot) => {
    setSelectedSlot(slot)
    onSlotSelect(slot)
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Book Session</CardTitle>
        <CardDescription>
          Select an available time slot for your session
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date Selection */}
        <div>
          <Label className="text-sm font-medium mb-3 block">Select Date</Label>
          <div className="grid grid-cols-4 gap-2">
            {dates.map((date, index) => {
              const dateStr = formatDate(date, { format: 'yyyy-MM-dd' })
              const daySlots = slotsByDate[dateStr] || []
              const hasAvailable = daySlots.some(s => s.status === 'available')
              const isSelected = isSameDay(date, selectedDate)

              return (
                <Button
                  key={index}
                  data-testid="date-selector"
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "flex flex-col h-auto py-2",
                    !hasAvailable && "opacity-50"
                  )}
                  onClick={() => hasAvailable && setSelectedDate(date)}
                  disabled={!hasAvailable}
                >
                  <span className="text-xs">{formatDate(date, { format: 'EEE' })}</span>
                  <span className="text-lg font-semibold">{formatDate(date, { format: 'd' })}</span>
                  <span className="text-xs">{formatDate(date, { format: 'MMM' })}</span>
                </Button>
              )
            })}
          </div>
        </div>

        <Separator />

        {/* Time Slots */}
        <div>
          <Label className="text-sm font-medium mb-3 block">
            Available Times for {formatDate(selectedDate, { format: 'EEEE, MMMM d' })}
          </Label>

          {availableSlots.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {availableSlots.map(slot => (
                <Button
                  key={slot.id}
                  data-testid="time-slot"
                  data-available="true"
                  data-selected={selectedSlot?.id === slot.id ? "true" : "false"}
                  variant={selectedSlot?.id === slot.id ? "default" : "outline"}
                  size="sm"
                  className="text-sm"
                  onClick={() => handleSlotSelect(slot)}
                >
                  {formatDate(slot.startTime, { format: 'time' })}
                </Button>
              ))}
            </div>
          ) : (
            <Alert data-testid="no-slots-message">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No available time slots for this date. Please select another date.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {selectedSlot && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Selected Time:</span>
                <span className="font-medium">
                  {formatDate(selectedSlot.startTime, { format: 'time' })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Duration:</span>
                <span className="font-medium">30 minutes</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Price:</span>
                <span className="font-medium">${selectedSlot.price}</span>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              aria-label="Continue to book appointment with selected time slot"
              onClick={() => handleSlotSelect(selectedSlot)}
            >
              Continue to Book
            </Button>
          </>
        )}

        {/* Quick Info Footer */}
        <Separator className="mt-6" />
        <div className="space-y-3 text-sm mt-4">
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div>
              <p className="font-medium">15-minute confirmation</p>
              <p className="text-xs text-muted-foreground">
                Host confirms within 15 minutes
              </p>
            </div>
          </div>
          {event?.billingConfig?.cancellationThresholdMinutes !== undefined && (
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">Free cancellation</p>
                <p className="text-xs text-muted-foreground">
                  Cancel up to {formatCancellationPolicy(event.billingConfig.cancellationThresholdMinutes)} before
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Helper function to group slots by date
function groupSlotsByDate(slots: BookingTimeSlot[]): Record<string, BookingTimeSlot[]> {
  return slots.reduce((grouped, slot) => {
    // Convert Date object to YYYY-MM-DD string for grouping
    const dateStr = formatDate(slot.date, { format: 'yyyy-MM-dd' })
    if (!grouped[dateStr]) {
      grouped[dateStr] = []
    }
    grouped[dateStr].push(slot)
    return grouped
  }, {} as Record<string, BookingTimeSlot[]>)
}

// Helper function to format cancellation policy minutes to human-readable format
function formatCancellationPolicy(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60)
    return `${hours} hour${hours !== 1 ? 's' : ''}`
  } else {
    const days = Math.floor(minutes / 1440)
    return `${days} day${days !== 1 ? 's' : ''}`
  }
}

// Simple Label component
interface LabelProps {
  className?: string
  children: React.ReactNode
}

function Label({ className, children }: LabelProps): React.JSX.Element {
  return <div className={className}>{children}</div>
}
