import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarIcon, Camera, Loader2, X } from 'lucide-react'
import { isAfter, isBefore } from 'date-fns'
import { formatDate } from '@/lib/format-date'
import { Button } from '@/components/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/form'
import { Input } from '@/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/select'
import { Calendar } from '@/components/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/popover'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/avatar'
import { Separator } from '@/components/separator'
import { cn } from '@/lib/utils'
import { personalInfoSchema, type PersonalInfo } from '../schemas'
import { ImageCropperDialog } from '@/components/image-cropper-dialog'

interface PersonalInfoFormProps {
  defaultValues?: Partial<PersonalInfo>
  onSubmit: (data: PersonalInfo) => void | Promise<void>
  mode?: 'create' | 'edit'
  showButtons?: boolean
  onCancel?: () => void
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
   * Show avatar upload section
   */
  showAvatar?: boolean
  /**
   * Avatar upload function - uploads file and returns file ID and preview URL
   */
  onAvatarUpload?: (file: File) => Promise<{ file?: string, url: string }>
  /**
   * Member since date for avatar section
   */
  memberSince?: Date | string | number
}

export function PersonalInfoForm({
  defaultValues,
  onSubmit,
  mode = 'create',
  showButtons = true,
  onCancel,
  role = 'client',
  submitText,
  formId,
  showAvatar = mode === 'edit',
  onAvatarUpload,
  memberSince
}: PersonalInfoFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [showCropper, setShowCropper] = useState(false)
  const [imageToCrop, setImageToCrop] = useState<string | null>(null)
  const [isAvatarRemoved, setIsAvatarRemoved] = useState(false)

  const form = useForm<PersonalInfo>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      firstName: defaultValues?.firstName || '',
      lastName: defaultValues?.lastName || '',
      middleName: defaultValues?.middleName || '',
      dateOfBirth: defaultValues?.dateOfBirth || undefined,
      gender: defaultValues?.gender || '',
      avatar: defaultValues?.avatar,
    },
  })

  // Update form when defaultValues change (e.g., when data loads)
  // In create mode: always accept new defaults (no isDirty check needed)
  // In edit mode: only update if user hasn't modified the form yet
  useEffect(() => {
    if (defaultValues && (mode === 'create' || !form.formState.isDirty)) {
      form.reset({
        firstName: defaultValues.firstName || '',
        lastName: defaultValues.lastName || '',
        middleName: defaultValues.middleName || '',
        dateOfBirth: defaultValues.dateOfBirth,
        gender: defaultValues.gender || '',
        avatar: defaultValues.avatar,
      })
      // Reset removal state when new data loads
      setIsAvatarRemoved(false)
    }
  }, [
    defaultValues?.firstName,
    defaultValues?.lastName,
    defaultValues?.middleName,
    defaultValues?.dateOfBirth,
    defaultValues?.gender,
    defaultValues?.avatar,
    mode,
    mode === 'edit' ? form.formState.isDirty : null
  ])

  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    // Create object URL and show cropper dialog
    const objectUrl = URL.createObjectURL(file)
    setImageToCrop(objectUrl)
    setShowCropper(true)

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleCropComplete = (croppedFile: File) => {
    // Store cropped file and create preview
    setSelectedFile(croppedFile)
    const objectUrl = URL.createObjectURL(croppedFile)
    setPreviewUrl(objectUrl)
    setShowCropper(false)
    setImageToCrop(null)
    setIsAvatarRemoved(false) // Reset removal state when new image is selected
  }

  const handleCropperClose = () => {
    setShowCropper(false)
    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop)
      setImageToCrop(null)
    }
  }

  const handleRemoveAvatar = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    setIsAvatarRemoved(true)
    form.setValue('avatar', undefined)
  }

  const handleSubmit = async (data: PersonalInfo) => {
    const finalData = { ...data }

    // Upload avatar if a new file was selected
    if (selectedFile && onAvatarUpload) {
      try {
        setIsUploadingAvatar(true)
        const avatarData = await onAvatarUpload(selectedFile)
        finalData.avatar = avatarData
      } catch (error) {
        console.error('Avatar upload failed:', error)
        // Continue with form submission even if avatar upload fails
      } finally {
        setIsUploadingAvatar(false)
      }
    } else if (isAvatarRemoved) {
      // Explicitly set avatar to null if it was removed
      finalData.avatar = null as any
    }

    await onSubmit(finalData)
  }

  const getDefaultSubmitText = () => {
    if (submitText) return submitText
    if (mode === 'create') {
      return role === 'host' ? 'Continue Setup' : 'Continue'
    }
    return 'Save Changes'
  }

  const firstName = form.watch('firstName') || defaultValues?.firstName || ''
  const lastName = form.watch('lastName') || defaultValues?.lastName || ''
  const avatarValue = form.watch('avatar')
  // Don't show avatar if it's been explicitly removed
  const avatarUrl = isAvatarRemoved ? null : (previewUrl || avatarValue?.url || defaultValues?.avatar?.url)

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="space-y-6"
        id={formId}
      >
        {/* Avatar Section */}
        {showAvatar && (
          <>
            <div className="flex items-center gap-6">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="text-lg">
                    {firstName[0]?.toUpperCase()}{lastName[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-2 -right-2 flex gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8 rounded-full"
                    onClick={handleAvatarClick}
                    disabled={isUploadingAvatar}
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </Button>
                  {(avatarUrl || selectedFile || avatarValue) && (
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="h-8 w-8 rounded-full"
                      onClick={handleRemoveAvatar}
                      disabled={isUploadingAvatar}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-semibold">
                    {firstName || lastName ? `${firstName} ${lastName}`.trim() : 'Your Name'}
                  </h3>
                </div>
                {memberSince && (
                  <p className="text-sm text-muted-foreground">
                    Member since {formatDate(memberSince)}
                  </p>
                )}
              </div>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelected}
            />

            <Separator />
          </>
        )}

        {/* Name fields row */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  First Name <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="John" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="middleName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Middle Name</FormLabel>
                <FormControl>
                  <Input placeholder="Middle name" {...field} value={field.value || ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Last Name <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input placeholder="Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Date of Birth and Gender row */}
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="dateOfBirth"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>
                  Date of Birth <span className="text-red-500">*</span>
                </FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          formatDate(field.value, { format: 'medium' })
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) =>
                        isAfter(date, new Date()) || isBefore(date, new Date("1900-01-01"))
                      }
                      captionLayout="dropdown"
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Gender</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="non-binary">Non-binary</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                    <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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

      {/* Image Cropper Dialog */}
      {imageToCrop && (
        <ImageCropperDialog
          open={showCropper}
          onClose={handleCropperClose}
          imageSrc={imageToCrop}
          onCropComplete={handleCropComplete}
          aspectRatio={1}
          cropShape="round"
        />
      )}
    </Form>
  )
}
