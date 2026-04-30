import { describe, test, expect, afterEach } from 'bun:test'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PersonalInfoForm } from './personal-info-form'

describe('PersonalInfoForm', () => {
  afterEach(() => {
    cleanup()
  })

  test('renders personal info form with all fields', () => {
    const onSubmit = () => {}
    render(<PersonalInfoForm onSubmit={onSubmit} />)

    // Check for form fields
    expect(screen.getByLabelText(/first name/i)).toBeDefined()
    expect(screen.getByLabelText(/last name/i)).toBeDefined()
    expect(screen.getByLabelText(/gender/i)).toBeDefined()
    expect(screen.getByLabelText(/date of birth/i)).toBeDefined()
  })

  test('renders with default values', () => {
    const defaultValues = {
      firstName: 'John',
      lastName: 'Doe',
      gender: 'male' as const,
      dateOfBirth: new Date('1990-01-01')
    }

    const onSubmit = () => {}
    render(<PersonalInfoForm defaultValues={defaultValues} onSubmit={onSubmit} />)

    const firstNameInput = screen.getByDisplayValue('John') as HTMLInputElement
    expect(firstNameInput).toBeDefined()
    expect(firstNameInput.value).toBe('John')

    const lastNameInput = screen.getByDisplayValue('Doe') as HTMLInputElement
    expect(lastNameInput).toBeDefined()
    expect(lastNameInput.value).toBe('Doe')
  })

  test('shows submit button when showButtons is true', () => {
    const onSubmit = () => {}
    render(<PersonalInfoForm onSubmit={onSubmit} showButtons={true} />)

    expect(screen.getByRole('button', { name: /continue/i })).toBeDefined()
  })

  test('shows cancel button when onCancel is provided', () => {
    const onSubmit = () => {}
    const onCancel = () => {}
    render(
      <PersonalInfoForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        showButtons={true}
      />
    )

    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined()
  })

  test('uses custom submit text', () => {
    const onSubmit = () => {}
    render(
      <PersonalInfoForm
        onSubmit={onSubmit}
        showButtons={true}
        submitText="Update Profile"
      />
    )

    expect(screen.getByRole('button', { name: /update profile/i })).toBeDefined()
  })

  test('handles role-specific rendering', () => {
    const onSubmit = () => {}
    render(<PersonalInfoForm onSubmit={onSubmit} role="host" />)

    // Form should render with host context
    expect(screen.getByLabelText(/first name/i)).toBeDefined()
  })

  test('shows avatar section when showAvatar is true', () => {
    const onSubmit = () => {}
    const onAvatarUpload = async (file: File) => ({
      file: 'file-id',
      url: 'https://example.com/avatar.jpg'
    })

    render(
      <PersonalInfoForm
        onSubmit={onSubmit}
        showAvatar={true}
        onAvatarUpload={onAvatarUpload}
      />
    )

    // Should show avatar with camera button
    expect(screen.getByRole('button', { name: '' })).toBeDefined() // Camera icon button
  })

  test('pre-fills form fields in create mode when defaultValues are provided', async () => {
    const defaultValues = {
      firstName: 'Foobar',
      lastName: '',
      middleName: '',
      dateOfBirth: undefined,
      gender: '',
    }

    const onSubmit = () => {}
    render(
      <PersonalInfoForm
        mode="create"
        defaultValues={defaultValues}
        onSubmit={onSubmit}
      />
    )

    // Should show pre-filled firstName
    await waitFor(() => {
      const firstNameInput = screen.getByLabelText(/first name/i) as HTMLInputElement
      expect(firstNameInput.value).toBe('Foobar')
    })
  })

  test('updates form fields in create mode when defaultValues change', async () => {
    const onSubmit = () => {}

    const { rerender } = render(
      <PersonalInfoForm
        mode="create"
        defaultValues={{
          firstName: '',
          lastName: '',
          middleName: '',
          dateOfBirth: undefined,
          gender: '',
        }}
        onSubmit={onSubmit}
      />
    )

    // Initially empty
    const firstNameInput = screen.getByLabelText(/first name/i) as HTMLInputElement
    expect(firstNameInput.value).toBe('')

    // Simulate what happens in onboarding: defaultValues update with user name
    rerender(
      <PersonalInfoForm
        mode="create"
        defaultValues={{
          firstName: 'Foobar',
          lastName: '',
          middleName: '',
          dateOfBirth: undefined,
          gender: '',
        }}
        onSubmit={onSubmit}
      />
    )

    // Should update to new defaultValues in create mode
    await waitFor(() => {
      expect(firstNameInput.value).toBe('Foobar')
    })
  })

  test('does not update form fields in edit mode when form is dirty', async () => {
    const onSubmit = () => {}

    const { rerender } = render(
      <PersonalInfoForm
        mode="edit"
        defaultValues={{
          firstName: 'John',
          lastName: 'Doe',
          middleName: '',
          dateOfBirth: new Date('1990-01-01'),
          gender: 'male',
        }}
        onSubmit={onSubmit}
      />
    )

    // User types in the field (makes it dirty)
    const firstNameInput = screen.getByLabelText(/first name/i) as HTMLInputElement
    await userEvent.clear(firstNameInput)
    await userEvent.type(firstNameInput, 'Jane')

    // New defaultValues arrive (simulating data refresh)
    rerender(
      <PersonalInfoForm
        mode="edit"
        defaultValues={{
          firstName: 'UpdatedName',
          lastName: 'Doe',
          middleName: '',
          dateOfBirth: new Date('1990-01-01'),
          gender: 'male',
        }}
        onSubmit={onSubmit}
      />
    )

    // Should preserve user's edit (not reset to new defaultValues)
    expect(firstNameInput.value).toBe('Jane')
  })

  test('updates form fields in edit mode when form is pristine', async () => {
    const onSubmit = () => {}

    const { rerender } = render(
      <PersonalInfoForm
        mode="edit"
        defaultValues={{
          firstName: 'John',
          lastName: 'Doe',
          middleName: '',
          dateOfBirth: new Date('1990-01-01'),
          gender: 'male',
        }}
        onSubmit={onSubmit}
      />
    )

    const firstNameInput = screen.getByLabelText(/first name/i) as HTMLInputElement
    expect(firstNameInput.value).toBe('John')

    // User hasn't modified anything, new data arrives
    rerender(
      <PersonalInfoForm
        mode="edit"
        defaultValues={{
          firstName: 'UpdatedName',
          lastName: 'Doe',
          middleName: '',
          dateOfBirth: new Date('1990-01-01'),
          gender: 'male',
        }}
        onSubmit={onSubmit}
      />
    )

    // Should update because form is pristine (not dirty)
    await waitFor(() => {
      expect(firstNameInput.value).toBe('UpdatedName')
    })
  })
})
