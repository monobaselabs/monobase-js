'use client'

import { useState, useEffect } from 'react'
import { Check, CreditCard, AlertCircle, UserCheck, XCircle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format-date'
import { Button } from '@/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/card'
import { Alert, AlertDescription } from '@/components/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/alert-dialog'
import type { Booking } from '@monobase/sdk/generated/types.gen'
import type { User } from 'better-auth'

export interface ActiveBookingCardProps {
  booking: Booking
  hostId: string
  hostName: string
  user?: User
  onPaymentClick: () => void
  onCancelClick: () => void
  onProfileClick: () => void
  onBrowseHosts?: () => void
  onViewAppointments?: () => void
  className?: string
}

/**
 * Check if user needs to complete their profile
 * Uses standard better-auth role checking with CSV roles
 */
function userNeedsProfile(user: User | null | undefined): boolean {
  if (!user) return false

  // user.role is a CSV string of roles added by the better-auth admin plugin,
  // e.g. "user,client,provider". Not part of the base better-auth User type.
  const role = (user as User & { role?: string }).role
  return !role?.split(',').includes('client')
}

/**
 * Format countdown timer
 */
function formatTimeRemaining(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function ActiveBookingCard({
  booking,
  hostId,
  hostName,
  user,
  onPaymentClick,
  onCancelClick,
  onProfileClick,
  onBrowseHosts,
  onViewAppointments,
  className
}: ActiveBookingCardProps): React.JSX.Element {
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [showCancelDialog, setShowCancelDialog] = useState(false)

  // Calculate remaining time for booking confirmation (15 minutes)
  useEffect(() => {
    const elapsed = Date.now() - booking.bookedAt.getTime()
    const remaining = Math.max(0, 15 * 60 * 1000 - elapsed) // 15 minutes in ms
    setTimeRemaining(Math.floor(remaining / 1000)) // Convert to seconds
  }, [booking.bookedAt])

  // Countdown timer
  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining(prev => prev > 0 ? prev - 1 : 0)
      }, 1000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [timeRemaining])

  const needsProfile = userNeedsProfile(user)
  const isConfirmed = booking.status === 'confirmed'
  // Check if payment is needed: has invoice but status is still pending/confirmed
  const needsPayment = !needsProfile && booking.invoice && (booking.status === 'pending' || booking.status === 'confirmed')
  const isConfirmedButUnpaid = isConfirmed && needsPayment
  const isComplete = !needsProfile && !booking.invoice // No invoice means no payment required, or already paid
  
  const handleCancelClick = () => {
    setShowCancelDialog(true)
  }

  const handleCancelConfirm = () => {
    setShowCancelDialog(false)
    onCancelClick()
  }

  // Handle rejected/cancelled/completed statuses
  if (booking.status === 'rejected') {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Booking Rejected</CardTitle>
          <CardDescription>
            This appointment request was not confirmed by the host
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-4">
            <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-semibold text-lg">Booking Request Rejected</h3>
            <p className="text-sm text-muted-foreground mt-2">
              {hostName} • {formatDate(booking.scheduledAt, { format: 'medium' })} • {formatDate(booking.scheduledAt, { format: 'time' })}
            </p>
          </div>

          <Alert>
            <AlertDescription>
              The host was unable to confirm your booking request. You can search for other available time slots.
            </AlertDescription>
          </Alert>

          {/* Action Buttons */}
          <div className="space-y-2">
            {onBrowseHosts && (
              <Button
                onClick={onBrowseHosts}
                className="w-full"
                size="lg"
              >
                Browse Hosts
              </Button>
            )}
            {onViewAppointments && (
              <Button
                onClick={onViewAppointments}
                variant="outline"
                className="w-full"
                size="lg"
              >
                View My Appointments
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (booking.status === 'cancelled') {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Booking Cancelled</CardTitle>
          <CardDescription>
            This appointment has been cancelled
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-4">
            <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-6 h-6 text-gray-600" />
            </div>
            <h3 className="font-semibold text-lg">Appointment Cancelled</h3>
            <p className="text-sm text-muted-foreground mt-2">
              {hostName} • {formatDate(booking.scheduledAt, { format: 'medium' })} • {formatDate(booking.scheduledAt, { format: 'time' })}
            </p>
          </div>

          {booking.cancellationReason && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Reason:</strong> {booking.cancellationReason}
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="space-y-2">
            {onViewAppointments && (
              <Button
                onClick={onViewAppointments}
                className="w-full"
                size="lg"
              >
                View My Appointments
              </Button>
            )}
            {onBrowseHosts && (
              <Button
                onClick={onBrowseHosts}
                variant="outline"
                className="w-full"
                size="lg"
              >
                Browse Hosts
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (booking.status === 'completed') {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>Appointment Completed</CardTitle>
          <CardDescription>
            This appointment has been completed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center py-4">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-semibold text-lg">Session Completed</h3>
            <p className="text-sm text-muted-foreground mt-2">
              {hostName} • {formatDate(booking.scheduledAt, { format: 'medium' })} • {formatDate(booking.scheduledAt, { format: 'time' })}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {onBrowseHosts && (
              <Button
                onClick={onBrowseHosts}
                className="w-full"
                size="lg"
              >
                Book Another Appointment
              </Button>
            )}
            {onViewAppointments && (
              <Button
                onClick={onViewAppointments}
                variant="outline"
                className="w-full"
                size="lg"
              >
                View My Appointments
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>{isConfirmed ? 'Appointment Confirmed' : 'Booking Pending Confirmation'}</CardTitle>
        <CardDescription>
          {isConfirmed ? 'Your appointment has been confirmed by the host' : 'Your appointment is awaiting host confirmation'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Booking Status */}
        <div className="text-center py-4">
          <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Check className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="font-semibold text-lg">
            {isConfirmed ? 'Appointment Confirmed!' : 'Booking Request Submitted!'}
          </h3>
          <p className="text-sm text-muted-foreground mt-2">
            {hostName} • {formatDate(booking.scheduledAt, { format: 'medium' })} • {formatDate(booking.scheduledAt, { format: 'time' })}
          </p>

          {/* Countdown Timer - only show for pending appointments */}
          {!isConfirmed && (
            <div className="mt-4 p-3 bg-gray-100 rounded-lg">
              <p className="text-2xl font-bold text-primary">{formatTimeRemaining(timeRemaining)}</p>
              <p className="text-xs text-muted-foreground">Time remaining for confirmation</p>
            </div>
          )}
        </div>

        {/* Profile Verification (Priority) */}
        {needsProfile && (
          <>
            <Alert>
              <UserCheck className="h-4 w-4" />
              <AlertDescription>
                <strong>Complete your profile to complete your booking request</strong>
                <p className="text-xs mt-1">We need some basic information to get you started with bookings.</p>
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={onProfileClick}
              >
                <UserCheck className="w-4 h-4 mr-2" />
                Complete Profile
              </Button>

              <Button
                variant="ghost"
                className="w-full text-sm"
                onClick={handleCancelClick}
              >
                Cancel booking request
              </Button>
            </div>
          </>
        )}

        {/* Payment Prompt */}
        {needsPayment && !isComplete && (
          <>
            <Alert>
              <CreditCard className="h-4 w-4" />
              <AlertDescription>
                <strong>{isConfirmedButUnpaid ? 'Complete your booking with payment' : 'Secure your appointment with payment'}</strong>
                <p className="text-xs mt-1">
                  {isConfirmedButUnpaid 
                    ? 'Your appointment is confirmed. Complete payment to finalize your booking.' 
                    : 'Hosts are more likely to confirm paid bookings.'}
                </p>
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <Button
                className="w-full"
                size="lg"
                onClick={onPaymentClick}
              >
                <CreditCard className="w-4 h-4 mr-2" />
                Pay Now
              </Button>

              <Button
                variant="ghost"
                className="w-full text-sm"
                onClick={handleCancelClick}
              >
                Cancel booking request
              </Button>
            </div>
          </>
        )}

        {/* Complete State */}
        {isComplete && (
          <>
            <Alert>
              <Check className="h-4 w-4" />
              <AlertDescription>
                <strong>Payment completed!</strong>
                <p className="text-xs mt-1">Your appointment is paid and awaiting confirmation.</p>
              </AlertDescription>
            </Alert>

            {/* CTAs for paid/waiting state */}
            <div className="space-y-2">
              {onViewAppointments && (
                <Button
                  onClick={onViewAppointments}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  View My Appointments
                </Button>
              )}
              {onBrowseHosts && (
                <Button
                  onClick={onBrowseHosts}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  Browse Hosts
                </Button>
              )}
            </div>
          </>
        )}

        {/* Waiting State - no profile issues, no payment needed */}
        {!needsProfile && !needsPayment && !isComplete && (
          <div className="space-y-3">
            <Alert>
              <AlertDescription>
                <strong>Waiting for host confirmation</strong>
                <p className="text-xs mt-1">You'll receive a notification once the host confirms your booking.</p>
              </AlertDescription>
            </Alert>

            {/* CTAs for waiting state */}
            <div className="space-y-2">
              {onViewAppointments && (
                <Button
                  onClick={onViewAppointments}
                  className="w-full"
                  size="lg"
                >
                  View My Appointments
                </Button>
              )}
              {onBrowseHosts && (
                <Button
                  onClick={onBrowseHosts}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  Browse Hosts
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full text-sm"
                onClick={handleCancelClick}
              >
                Cancel booking request
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Cancel Confirmation Dialog */}
    <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Booking Request?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to cancel this booking request? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>No, keep it</AlertDialogCancel>
          <AlertDialogAction onClick={handleCancelConfirm}>
            Yes, cancel booking
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
  )
}
