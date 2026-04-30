import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Button } from '@/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/card'
import { Alert, AlertDescription } from '@/components/alert'
import { Mail, RefreshCw, LogOut, CheckCircle2 } from 'lucide-react'
import { Logo } from '@/components/logo'
import { composeGuards, requireAuth, requireNotEmailVerified } from '@/utils/guards'
import { useAuthClient } from '@monobase/sdk-ts/react/auth'
import { toast } from 'sonner'

export const Route = createFileRoute('/verify-email')({
  beforeLoad: composeGuards(requireAuth, requireNotEmailVerified),
  component: VerifyEmailPage,
})

function VerifyEmailPage() {
  const { auth } = Route.useRouteContext()
  const user = auth.user!
  const authClient = useAuthClient()
  const [isResending, setIsResending] = useState(false)

  const handleResendVerification = async () => {
    setIsResending(true)
    try {
      await authClient.sendVerificationEmail({
        email: user.email,
        callbackURL: window.location.origin + '/dashboard',
      })
      toast.success('Verification email sent!', {
        description: 'Please check your inbox and spam folder.',
      })
    } catch (error) {
      toast.error('Failed to send verification email', {
        description: error instanceof Error ? error.message : 'Please try again later.',
      })
    } finally {
      setIsResending(false)
    }
  }

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = '/auth/sign-in'
        },
      },
    })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Logo variant="horizontal" size="xl" />
          </div>
        </div>

        <Card>
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-2">
              <Mail className="w-6 h-6 text-blue-600" />
            </div>
            <CardTitle className="text-2xl">Verify Your Email</CardTitle>
            <CardDescription>
              We've sent a verification link to
            </CardDescription>
            <p className="font-medium text-foreground">{user.email}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Click the link in your email to verify your account and continue.
              </AlertDescription>
            </Alert>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="font-medium">Didn't receive the email?</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Check your spam or junk folder</li>
                <li>Make sure {user.email} is correct</li>
                <li>Wait a few minutes and check again</li>
              </ul>
            </div>

            <Button
              onClick={handleResendVerification}
              disabled={isResending}
              className="w-full"
              variant="outline"
            >
              {isResending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Resend Verification Email
                </>
              )}
            </Button>

            <div className="pt-4 border-t">
              <Button
                onClick={handleSignOut}
                variant="ghost"
                className="w-full"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Need help? Contact support
        </p>
      </div>
    </div>
  )
}
