import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Mail, Phone } from 'lucide-react'
import { Button } from '@/components/button'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/form'
import { Input } from '@/components/input'
import { PhoneInput } from '@/components/phone-input'
import { useDetectCountry } from '@/hooks/use-detect-country'
import { contactInfoSchema, type ContactInfo } from '../schemas'

interface ContactInfoFormProps {
  defaultValues?: Partial<ContactInfo>
  onSubmit: (data: ContactInfo) => void | Promise<void>
  mode?: 'create' | 'edit'
  showButtons?: boolean
  onCancel?: () => void
  userEmail?: string // Email from user context
  /**
   * Role-specific context for form customization
   */
  role?: 'client' | 'host'
  /**
   * Custom submit button text
   */
  submitText?: string
  /**
   * Form ID for external submission
   */
  formId?: string
  /**
   * Whether to show email field as editable
   */
  emailEditable?: boolean
}

export function ContactInfoForm({
  defaultValues,
  onSubmit,
  mode = 'edit',
  showButtons = true,
  onCancel,
  userEmail,
  role = 'client',
  submitText,
  formId,
  emailEditable = false
}: ContactInfoFormProps) {
  const defaultCountry = useDetectCountry()

  const form = useForm<ContactInfo>({
    resolver: zodResolver(contactInfoSchema),
    defaultValues: {
      email: userEmail || defaultValues?.email || '',
      phone: defaultValues?.phone || '',
    },
  })

  // Update form when defaultValues change (e.g., when data loads)
  useEffect(() => {
    if (defaultValues || userEmail) {
      form.reset({
        email: userEmail || defaultValues?.email || '',
        phone: defaultValues?.phone || '',
      })
    }
  }, [defaultValues, userEmail, form])

  const handleSubmit = async (data: ContactInfo) => {
    await onSubmit(data)
  }

  const getDefaultSubmitText = () => {
    if (submitText) return submitText
    if (mode === 'create') {
      return role === 'host' ? 'Continue Setup' : 'Save'
    }
    return 'Save Changes'
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-4"
        id={formId}
      >
        {/* Email field */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email Address
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={userEmail || field.value || ''}
                  disabled={!emailEditable}
                  className={!emailEditable ? "bg-muted" : ""}
                />
              </FormControl>
              {!emailEditable && (
                <FormDescription>
                  Email address is managed in your authentication settings
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Phone field */}
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Phone Number
              </FormLabel>
              <FormControl>
                <PhoneInput
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Enter phone number"
                  defaultCountry={defaultCountry}
                />
              </FormControl>
              <FormDescription>
                Your primary contact phone number
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {showButtons && (
          <div className="flex gap-2 justify-end">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit">
              {getDefaultSubmitText()}
            </Button>
          </div>
        )}
      </form>
    </Form>
  )
}
