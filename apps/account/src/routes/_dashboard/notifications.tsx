import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import {
  Bell,
  BellRing,
  Check,
  Clock,
  Calendar,
  FileText,
  Pill,
  CreditCard,
  UserCheck,
  AlertCircle,
  Trash2,
  MoreVertical,
  Loader2,
  Shield,
} from 'lucide-react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  listNotificationsOptions,
  listNotificationsQueryKey,
  markNotificationAsReadMutation,
  markAllNotificationsAsReadMutation,
} from '@monobase/sdk/generated/@tanstack/react-query.gen'
import { useOptimisticMutation } from '@monobase/sdk/react/use-optimistic-mutation'
import type { ListNotificationsResponse } from '@monobase/sdk/generated/types.gen'
import { useFormatDate } from '@/hooks/use-format-date'
import { Button } from "@/components/button"
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/card"
import { Badge } from "@/components/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu"

export const Route = createFileRoute('/_dashboard/notifications')({
  component: NotificationsPage,
})

function NotificationsPage() {
  // Fetch notifications from API
  const { data: notificationsData, isLoading, error } = useQuery({
    ...listNotificationsOptions({ query: { limit: 100 } }),
    staleTime: 60_000,
  })

  // Optimistically flip the notification's status to 'read' in the list cache so
  // the UI updates instantly; the helper handles snapshot/rollback/invalidate.
  const markAsReadMutation = useOptimisticMutation(
    markNotificationAsReadMutation(),
    {
      optimistic: {
        queryKey: () => listNotificationsQueryKey({ query: { limit: 100 } }),
        updater: (current: ListNotificationsResponse | undefined, vars) => {
          if (!current) return current
          return {
            ...current,
            data: current.data.map((n) =>
              n.id === vars.path.notif
                ? { ...n, status: 'read' as const, readAt: new Date() }
                : n,
            ),
          }
        },
      },
    },
  )

  const markAllAsReadMutation = useMutation({
    ...markAllNotificationsAsReadMutation(),
    meta: {
      toast: {
        success: 'All notifications marked as read',
        error: 'Failed to mark all notifications as read',
      },
    },
  })

  const { formatRelativeDate } = useFormatDate()

  const notifications = notificationsData?.data || []

  // Map API notifications to UI format
  const uiNotifications = useMemo(() => {
    return notifications.map((notif) => {
      // Determine icon based on type
      let icon = Bell
      let color = 'text-gray-500'

      switch (notif.type) {
        case 'booking.created':
        case 'booking.confirmed':
        case 'booking.rejected':
        case 'booking.cancelled':
          icon = Calendar
          color = 'text-blue-500'
          break
        case 'billing':
          icon = CreditCard
          color = 'text-purple-500'
          break
        case 'security':
          icon = Shield
          color = 'text-red-500'
          break
        case 'system':
          icon = Bell
          color = 'text-gray-500'
          break
      }

      return {
        id: notif.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        timestamp: notif.createdAt,
        read: notif.status !== 'unread',
        priority: 'medium' as const,
        actionUrl: notif.relatedEntityType ? `/${notif.relatedEntityType}` : '/',
        icon,
        color,
      }
    })
  }, [notifications])

  const displayNotifications = uiNotifications

  const handleMarkAsRead = async (id: string) => {
    try {
      await markAsReadMutation.mutateAsync({ path: { notif: id } })
    } catch (error) {
      // Error handled by mutation
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsReadMutation.mutateAsync({})
    } catch (error) {
      // Error handled by mutation
    }
  }

  const unreadCount = displayNotifications.filter(n => !n.read).length

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Loading notifications...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="h-5 w-5" />
              <p className="font-semibold">Failed to load notifications</p>
            </div>
            <p className="mt-2 text-sm text-red-700">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }


  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-headline font-bold flex items-center gap-3">
            <Bell className="h-8 w-8" />
            Notifications
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-2">
                {unreadCount} new
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground font-body">
            Stay updated with your healthcare notifications
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleMarkAllAsRead} disabled={unreadCount === 0}>
            <Check className="mr-2 h-4 w-4" />
            Mark All Read
          </Button>
        </div>
      </div>


      {/* Notifications Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">
            All
            <Badge variant="secondary" className="ml-2">
              {displayNotifications.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="unread">
            Unread
            <Badge variant="destructive" className="ml-2">
              {unreadCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4 mt-6">
          {displayNotifications.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No notifications found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {displayNotifications.map((notification) => {
                const Icon = notification.icon
                return (
                  <Card key={notification.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <Icon className={`h-5 w-5 ${notification.color}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h3 className={`font-semibold ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                                {notification.title}
                                {!notification.read && (
                                  <span className="ml-2 w-2 h-2 bg-blue-500 rounded-full inline-block"></span>
                                )}
                              </h3>
                              <p className="text-muted-foreground mb-2">
                                {notification.message}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {formatRelativeDate(notification.timestamp, { style: 'short' })}
                              </p>
                            </div>

                            <div className="flex items-center gap-2">

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="sm" variant="ghost">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {!notification.read && (
                                    <DropdownMenuItem onClick={() => handleMarkAsRead(notification.id)}>
                                      <Check className="mr-2 h-4 w-4" />
                                      Mark as Read
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="unread" className="space-y-4 mt-6">
          <div className="space-y-3">
            {displayNotifications.filter(n => !n.read).map((notification) => {
              const Icon = notification.icon
              return (
                <Card key={notification.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0">
                        <Icon className={`h-5 w-5 ${notification.color}`} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="font-semibold">
                              {notification.title}
                              <span className="ml-2 w-2 h-2 bg-blue-500 rounded-full inline-block"></span>
                            </h3>
                            <p className="text-muted-foreground mb-2">
                              {notification.message}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatRelativeDate(notification.timestamp, { style: 'short' })}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleMarkAsRead(notification.id)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

      </Tabs>
    </div>
  )
}