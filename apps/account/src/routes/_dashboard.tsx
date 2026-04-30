import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireAuth, requireEmailVerified, requirePerson, composeGuards } from '@/utils/guards'
import { AppSidebar, type NavGroup } from '@/components/app-sidebar'
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger
} from "@/components/sidebar"
import {
  Home,
  User,
  Shield,
  Bell,
} from 'lucide-react'
import { UserButton } from '@daveyplate/better-auth-ui'
import { useQuery } from '@tanstack/react-query'
import { listNotificationsOptions } from '@monobase/sdk/generated/@tanstack/react-query.gen'

export const Route = createFileRoute('/_dashboard')({
  beforeLoad: composeGuards(requireAuth, requireEmailVerified, requirePerson),
  component: DashboardLayout,
})

function DashboardLayout() {
  // Fetch unread notifications count for badge
  const { data: unreadData } = useQuery({
    ...listNotificationsOptions({ query: { status: 'unread' } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const unreadCount = unreadData?.pagination?.totalCount || 0

  // Define navigation structure for the account dashboard
  const navGroups: NavGroup[] = [
    {
      label: "Navigation",
      items: [
        {
          title: "Dashboard",
          url: "/dashboard",
          icon: Home,
          badge: null,
        },
        {
          title: "Notifications",
          url: "/notifications",
          icon: Bell,
          badge: unreadCount > 0 ? unreadCount : null,
        },
      ]
    },
    {
      label: "Settings",
      items: [
        {
          title: "Account Settings",
          url: "/settings/account",
          icon: User,
        },
        {
          title: "Security",
          url: "/settings/security",
          icon: Shield,
        },
      ]
    }
  ]

  return (
    <SidebarProvider>
      <AppSidebar
        navGroups={navGroups}
        headerTitle="MONOBASE"
        headerSubtitle="Account Portal"
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <div className="flex flex-1 items-center gap-2">
            {/* Breadcrumbs will go here */}
          </div>
          <UserButton
            variant="ghost"
            disableDefaultLinks
          />
        </header>
        <main className="flex-1">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
