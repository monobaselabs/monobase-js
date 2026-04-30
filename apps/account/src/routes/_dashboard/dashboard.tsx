import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Shield,
  User,
  Key,
  Smartphone,
  Globe,
  CheckCircle,
  AlertCircle,
  Settings,
  Loader2
} from 'lucide-react'
import { Button } from "@/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/card"
import { Badge } from "@/components/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/avatar"
import { Separator } from "@/components/separator"
import { useListSessions, useListPasskeys, useEmailVerification } from '@monobase/sdk-ts/react/hooks/use-auth'
import { toast } from 'sonner'

export const Route = createFileRoute('/_dashboard/dashboard')({
  component: DashboardPage,
})

function DashboardPage() {
  const { auth } = Route.useRouteContext()
  const user = auth.user

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U'

  // Fetch real data from Better Auth API
  const { data: sessions, isLoading: sessionsLoading } = useListSessions()
  const { data: passkeys, isLoading: passkeysLoading } = useListPasskeys()
  const emailVerificationMutation = useEmailVerification()

  // Calculate derived values
  const emailVerified = user?.emailVerified !== false
  const activeSessionsCount = sessions?.length || 0
  const hasTwoFactor = (passkeys?.length || 0) > 0
  const isLoading = sessionsLoading || passkeysLoading

  // Handle email verification
  const handleEmailVerification = async () => {
    if (!user?.email) return

    try {
      await emailVerificationMutation.mutateAsync({
        email: user.email,
        callbackURL: window.location.origin + '/dashboard'
      })
      toast.success('Verification email sent! Please check your inbox.')
    } catch (error) {
      toast.error('Failed to send verification email. Please try again.')
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Account Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user?.image ?? undefined} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold">{user?.name || 'User'}</h1>
            <p className="text-muted-foreground">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              {emailVerified ? (
                <Badge variant="secondary" className="text-xs">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Email verified
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Email not verified
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/account">
              <Settings className="w-4 h-4 mr-2" />
              Manage Account
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/security">
              <Shield className="w-4 h-4 mr-2" />
              Security Settings
            </Link>
          </Button>
          {!hasTwoFactor && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/settings/security">
                <Smartphone className="w-4 h-4 mr-2" />
                Enable 2FA
              </Link>
            </Button>
          )}
        </div>
      </div>


      {/* Main Dashboard Grid */}
      <div className="grid gap-6 md:grid-cols-2">

        {/* Personal Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
            <CardDescription>Your account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Name</p>
              <p className="font-medium">{user?.name || 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{user?.email}</p>
            </div>
            <Separator />
            <div className="text-sm text-muted-foreground">
              Complete your profile in settings to unlock all features.
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/settings/account">
                Manage Your Info
              </Link>
            </Button>
          </CardFooter>
        </Card>

        {/* Sign-in & Security Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Sign-in & Security
            </CardTitle>
            <CardDescription>Keep your account secure</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">2-Step Verification</span>
              </div>
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : (
                <Badge variant={hasTwoFactor ? "secondary" : "outline"} className="text-xs">
                  {hasTwoFactor ? "Enabled" : "Configure"}
                </Badge>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Password</span>
              </div>
              <Badge variant="secondary" className="text-xs">
                Set
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Active Sessions</span>
              </div>
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : (
                <Badge variant="secondary" className="text-xs">
                  {activeSessionsCount} {activeSessionsCount === 1 ? 'Session' : 'Sessions'}
                </Badge>
              )}
            </div>
            <Separator />
            <div className="text-sm text-muted-foreground">
              Review your security settings regularly
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <Link to="/settings/security">
                Security Settings
              </Link>
            </Button>
          </CardFooter>
        </Card>

      </div>

      {/* Account Status */}
      <Card>
        <CardHeader>
          <CardTitle>Account Status</CardTitle>
          <CardDescription>Overview of your account health</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {emailVerified ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-yellow-500" />
              )}
              <span className="text-sm">Email verification</span>
            </div>
            {!emailVerified && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleEmailVerification}
                disabled={emailVerificationMutation.isPending}
              >
                {emailVerificationMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : null}
                {emailVerificationMutation.isPending ? 'Sending...' : 'Verify'}
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {hasTwoFactor ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-yellow-500" />
              )}
              <span className="text-sm">Two-factor authentication</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">HIPAA compliant</span>
            </div>
          </div>
          <Separator />
          <div className="text-sm text-muted-foreground">
            Keep your account secure by enabling all recommended security features.
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
