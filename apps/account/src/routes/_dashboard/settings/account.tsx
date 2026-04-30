import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/card"
import { PersonalInfoForm } from '@/features/person/components/personal-info-form'
import { AddressForm } from '@/features/person/components/address-form'
import { ContactInfoForm } from '@/features/person/components/contact-info-form'
import { PreferencesForm } from '@/features/person/components/preferences-form'
import {
  getPersonOptions,
  getPersonQueryKey,
  updatePersonMutation,
} from '@monobase/sdk/generated/@tanstack/react-query.gen'
import { buildPatch } from '@monobase/sdk/utils/patch'
import { useFileUpload } from '@monobase/sdk/flows'
import type { PersonUpdateRequest } from '@monobase/sdk/generated/types.gen'

export const Route = createFileRoute('/_dashboard/settings/account')({
  component: AccountSettingsPage,
  beforeLoad: async ({ context }) => {
    return { user: context.auth.user }
  },
})

function AccountSettingsPage() {
  const queryClient = useQueryClient()
  const { upload } = useFileUpload()

  const { data: person, isLoading: isLoadingPerson } = useQuery(
    getPersonOptions({ path: { person: 'me' } }),
  )

  // One mutation backs all four section forms — each onSubmit shapes its own
  // partial body via buildPatch and the helper handles the wire call.
  const updatePerson = useMutation({
    ...updatePersonMutation(),
    meta: {
      toast: {
        success: 'Profile updated',
        error: (err: unknown) =>
          err instanceof Error ? err.message : 'Failed to update profile',
      },
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: getPersonQueryKey({ path: { person: 'me' } }),
      })
    },
  })

  const submitUpdate = async (patch: PersonUpdateRequest) => {
    if (!person) return
    await updatePerson.mutateAsync({
      path: { person: person.id },
      body: buildPatch<PersonUpdateRequest>(patch),
    })
  }

  const handleAvatarUpload = async (file: File): Promise<{ file?: string, url: string }> => {
    const uploaded = await upload(file)
    return { file: uploaded.fileId, url: uploaded.downloadUrl }
  }

  if (isLoadingPerson) {
    return <div className="p-6">Loading...</div>
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">
          Manage your personal information and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your personal details</CardDescription>
        </CardHeader>
        <CardContent>
          <PersonalInfoForm
            defaultValues={person as never}
            onSubmit={async (data) => {
              await submitUpdate(data as PersonUpdateRequest)
            }}
            mode="edit"
            memberSince={person?.createdAt}
            onAvatarUpload={handleAvatarUpload}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>Manage your contact details</CardDescription>
        </CardHeader>
        <CardContent>
          <ContactInfoForm
            defaultValues={person?.contactInfo as never}
            onSubmit={async (data) => {
              await submitUpdate({ contactInfo: data })
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
          <CardDescription>Update your address information</CardDescription>
        </CardHeader>
        <CardContent>
          <AddressForm
            defaultValues={person?.primaryAddress as never}
            onSubmit={async (data) => {
              await submitUpdate({ primaryAddress: data })
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Manage your account preferences</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm
            defaultValues={person as never}
            onSubmit={async (data) => {
              await submitUpdate(data as PersonUpdateRequest)
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
