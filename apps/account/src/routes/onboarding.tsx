import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/card'
import { Progress } from '@/components/progress'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import {
  createPersonMutation,
  getPersonQueryKey,
} from '@monobase/sdk/generated/@tanstack/react-query.gen'
import { Logo } from '@/components/logo'
import { composeGuards, requireAuth, requireEmailVerified, requireNoPerson } from '@/utils/guards'
import { detectTimezone } from '@/lib/detect-timezone'
import { detectCountry } from '@/lib/detect-country'
import { detectLanguage } from '@/lib/detect-language'
import { PersonalInfoForm } from '@/features/person/components/personal-info-form'
import { AddressForm } from '@/features/person/components/address-form'
import type { PersonalInfo, OptionalAddress } from '@/features/person/schemas'
import type { PersonCreateRequest } from '@monobase/sdk/generated/types.gen'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: composeGuards(requireAuth, requireEmailVerified, requireNoPerson),
  component: OnboardingPage,
})

function OnboardingPage() {
  const navigate = useNavigate()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Get user from route context - guaranteed to exist because of requireAuth guard
  const { auth } = Route.useRouteContext()
  const user = auth.user!
  const [currentStep, setCurrentStep] = useState(1)
  const createPerson = useMutation({
    ...createPersonMutation(),
    meta: {
      toast: {
        success: 'Profile created!',
        error: (err: unknown) =>
          err instanceof Error ? err.message : 'Failed to create profile',
      },
    },
  })

  // Store form data across steps with proper types
  // Initialize with empty/detected values
  const [formData, setFormData] = useState<{
    personal?: Partial<PersonalInfo>
    address?: OptionalAddress
  }>({
    personal: {
      firstName: '',
      lastName: '',
      middleName: '',
      dateOfBirth: undefined,
      gender: '',
    },
    address: {
      street1: '',
      street2: '',
      city: '',
      state: '',
      postalCode: '',
      country: detectCountry(),
    }
  })

  // Update formData when user data becomes available
  useEffect(() => {
    if (user?.name) {
      setFormData(prev => ({
        ...prev,
        personal: {
          ...prev.personal!,
          firstName: user.name.split(' ')[0] || '',
          lastName: user.name.split(' ').slice(1).join(' ') || '',
        }
      }))
    }
  }, [user?.name])

  const totalSteps = 2

  const handlePersonalInfoSubmit = (data: PersonalInfo) => {
    setFormData(prev => ({ ...prev, personal: data }))
    setCurrentStep(2)
  }

  const handleAddressSubmit = async (data: OptionalAddress) => {
    setFormData(prev => ({ ...prev, address: data }))

    // Submit the complete profile
    if (!formData.personal) {
      return
    }

    // User is guaranteed to exist from requireAuth guard
    if (!user.email) {
      return
    }

    // Build address if provided
    let primaryAddress: PersonCreateRequest['primaryAddress'] | undefined
    if (data && data.street1 && data.city &&
        data.state && data.postalCode && data.country) {
      primaryAddress = {
        street1: data.street1,
        street2: data.street2,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        country: data.country, // Already a 2-letter code
      }
    }

    const personal = formData.personal as PersonalInfo
    const personData: PersonCreateRequest = {
      firstName: personal.firstName,
      lastName: personal.lastName,
      middleName: personal.middleName || undefined,
      dateOfBirth: personal.dateOfBirth,
      gender: personal.gender as PersonCreateRequest['gender'],
      primaryAddress,
      contactInfo: {
        email: user.email,
      },
      languagesSpoken: [detectLanguage()],
      timezone: detectTimezone(),
    }

    createPerson.mutate({ body: personData }, {
      onSuccess: async () => {
        await queryClient.refetchQueries({
          queryKey: getPersonQueryKey({ path: { person: 'me' } }),
        })
        await new Promise(resolve => setTimeout(resolve, 100))
        navigate({ to: '/dashboard' })
      },
    })
  }

  const handleSkipAddress = async () => {
    // Submit without address
    if (!formData.personal) {
      return
    }

    // User is guaranteed to exist from requireAuth guard
    if (!user.email) {
      return
    }

    const personal = formData.personal as PersonalInfo
    const personData: PersonCreateRequest = {
      firstName: personal.firstName,
      lastName: personal.lastName,
      middleName: personal.middleName || undefined,
      dateOfBirth: personal.dateOfBirth,
      gender: personal.gender as PersonCreateRequest['gender'],
      contactInfo: {
        email: user.email,
      },
      languagesSpoken: [detectLanguage()],
      timezone: detectTimezone(),
    }

    createPerson.mutate({ body: personData }, {
      onSuccess: async () => {
        await queryClient.refetchQueries({
          queryKey: getPersonQueryKey({ path: { person: 'me' } }),
        })
        await new Promise(resolve => setTimeout(resolve, 100))
        navigate({ to: '/dashboard' })
      },
    })
  }

  const goBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Logo variant="horizontal" size="xl" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome to Monobase</h1>
          <p className="text-gray-600 mt-2">Let's set up your profile</p>
        </div>

        <Progress value={(currentStep / totalSteps) * 100} className="h-2" />

        <Card>
          <CardHeader>
            <CardTitle>
              Step {currentStep} of {totalSteps}: {' '}
              {currentStep === 1 && 'Personal Information'}
              {currentStep === 2 && 'Address (Optional)'}
            </CardTitle>
            <CardDescription>
              {currentStep === 1 && 'Tell us about yourself'}
              {currentStep === 2 && 'Where can we reach you? You can skip this step for now.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentStep === 1 && (
              <PersonalInfoForm
                onSubmit={handlePersonalInfoSubmit}
                defaultValues={formData.personal}
                mode="create"
                showButtons={false}
                formId="step-1-form"
              />
            )}
            {currentStep === 2 && (
              <AddressForm
                onSubmit={handleAddressSubmit}
                onSkip={handleSkipAddress}
                defaultValues={formData.address}
                mode="create"
                showButtons={false}
              />
            )}

            {/* Custom navigation buttons for multi-step form */}
            <div className="flex justify-between mt-6">
              {currentStep > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={goBack}
                  disabled={createPerson.isPending}
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              )}
              {currentStep === 1 && (
                <Button
                  type="submit"
                  form="step-1-form"
                  className="ml-auto"
                  onClick={() => {
                    // Trigger form submission for current step
                    const forms = document.querySelectorAll('form')
                    if (forms[0]) {
                      forms[0].requestSubmit()
                    }
                  }}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              )}
              {currentStep === 2 && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="ml-auto mr-2"
                    onClick={handleSkipAddress}
                    disabled={createPerson.isPending}
                  >
                    Skip for now
                  </Button>
                  <Button
                    type="submit"
                    disabled={createPerson.isPending}
                    onClick={() => {
                      // Trigger form submission for final step
                      const forms = document.querySelectorAll('form')
                      if (forms[0]) {
                        forms[0].requestSubmit()
                      }
                    }}
                  >
                    {createPerson.isPending ? 'Creating Profile...' : 'Complete Setup'}
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
