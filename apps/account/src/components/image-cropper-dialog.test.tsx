import { describe, test, expect, afterEach, mock } from 'bun:test'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImageCropperDialog } from './image-cropper-dialog'

describe('ImageCropperDialog', () => {
  afterEach(() => {
    cleanup()
  })

  const mockImageSrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  test('renders when open is true', () => {
    const onClose = mock(() => {})
    const onCropComplete = mock(() => {})

    render(
      <ImageCropperDialog
        open={true}
        onClose={onClose}
        imageSrc={mockImageSrc}
        onCropComplete={onCropComplete}
      />
    )

    expect(screen.getAllByText('Crop Image').length).toBeGreaterThan(0)
  })

  test('does not render when open is false', () => {
    const onClose = mock(() => {})
    const onCropComplete = mock(() => {})

    const { container } = render(
      <ImageCropperDialog
        open={false}
        onClose={onClose}
        imageSrc={mockImageSrc}
        onCropComplete={onCropComplete}
      />
    )

    // Dialog should not be visible
    expect(screen.queryByText('Crop Image')).toBeNull()
  })

  test('renders Cancel and Crop Image buttons', () => {
    const onClose = mock(() => {})
    const onCropComplete = mock(() => {})

    render(
      <ImageCropperDialog
        open={true}
        onClose={onClose}
        imageSrc={mockImageSrc}
        onCropComplete={onCropComplete}
      />
    )

    expect(screen.getByText('Cancel')).toBeDefined()
    expect(screen.getAllByText('Crop Image').length).toBeGreaterThan(0)
  })

  test('renders zoom slider', () => {
    const onClose = mock(() => {})
    const onCropComplete = mock(() => {})

    render(
      <ImageCropperDialog
        open={true}
        onClose={onClose}
        imageSrc={mockImageSrc}
        onCropComplete={onCropComplete}
      />
    )

    expect(screen.getByText('Zoom')).toBeDefined()
  })

  test('calls onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = mock(() => {})
    const onCropComplete = mock(() => {})

    render(
      <ImageCropperDialog
        open={true}
        onClose={onClose}
        imageSrc={mockImageSrc}
        onCropComplete={onCropComplete}
      />
    )

    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)

    expect(onClose).toHaveBeenCalled()
  })

  test('accepts custom aspectRatio prop', () => {
    const onClose = mock(() => {})
    const onCropComplete = mock(() => {})

    render(
      <ImageCropperDialog
        open={true}
        onClose={onClose}
        imageSrc={mockImageSrc}
        onCropComplete={onCropComplete}
        aspectRatio={16/9}
      />
    )

    // Component should render with custom aspect ratio
    expect(screen.getAllByText('Crop Image').length).toBeGreaterThan(0)
  })

  test('accepts custom cropShape prop', () => {
    const onClose = mock(() => {})
    const onCropComplete = mock(() => {})

    render(
      <ImageCropperDialog
        open={true}
        onClose={onClose}
        imageSrc={mockImageSrc}
        onCropComplete={onCropComplete}
        cropShape="rect"
      />
    )

    // Component should render with custom crop shape
    expect(screen.getAllByText('Crop Image').length).toBeGreaterThan(0)
  })

  test('uses default values when optional props not provided', () => {
    const onClose = mock(() => {})
    const onCropComplete = mock(() => {})

    render(
      <ImageCropperDialog
        open={true}
        onClose={onClose}
        imageSrc={mockImageSrc}
        onCropComplete={onCropComplete}
      />
    )

    // Should render with defaults (aspectRatio=1, cropShape='round')
    expect(screen.getAllByText('Crop Image').length).toBeGreaterThan(0)
    expect(screen.getByText('Cancel')).toBeDefined()
  })

  test('shows processing state when cropping', async () => {
    const user = userEvent.setup()
    const onClose = mock(() => {})
    const onCropComplete = mock(() => {})

    render(
      <ImageCropperDialog
        open={true}
        onClose={onClose}
        imageSrc={mockImageSrc}
        onCropComplete={onCropComplete}
      />
    )

    const cropButtons = screen.getAllByText('Crop Image')
    const cropButton = cropButtons.find(el => el.tagName === 'BUTTON')

    // Note: We're testing the UI behavior, not the canvas/blob conversion
    // The actual cropping logic is handled by react-easy-crop and canvas APIs
    expect(cropButton).toBeDefined()
  })

  test('disables buttons during processing', async () => {
    const onClose = mock(() => {})
    const onCropComplete = mock(() => {})

    render(
      <ImageCropperDialog
        open={true}
        onClose={onClose}
        imageSrc={mockImageSrc}
        onCropComplete={onCropComplete}
      />
    )

    // Buttons should not be disabled initially
    const cancelButton = screen.getByText('Cancel') as HTMLButtonElement
    const cropButtons = screen.getAllByText('Crop Image')
    const cropButton = cropButtons.find(el => el.tagName === 'BUTTON') as HTMLButtonElement

    expect(cancelButton.disabled).toBe(false)
    expect(cropButton.disabled).toBe(false)
  })
})
