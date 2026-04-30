import { useState, useCallback } from 'react'
import type { Area } from 'react-easy-crop';
import Cropper from 'react-easy-crop'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog'
import { Button } from './button'
import { Slider } from './slider'
import { Loader2 } from 'lucide-react'

interface ImageCropperDialogProps {
  open: boolean
  onClose: () => void
  imageSrc: string
  onCropComplete: (croppedFile: File) => void
  aspectRatio?: number
  cropShape?: 'rect' | 'round'
}

/**
 * Create a cropped image file from the crop area
 */
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  cropShape: 'rect' | 'round' = 'round'
): Promise<File> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  if (!ctx) {
    throw new Error('No 2d context')
  }

  // Set canvas size to match the crop area
  canvas.width = pixelCrop.width
  canvas.height = pixelCrop.height

  // Draw the cropped image
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  )

  // For circular crops, apply circular mask
  if (cropShape === 'round') {
    ctx.globalCompositeOperation = 'destination-in'
    ctx.beginPath()
    ctx.arc(
      pixelCrop.width / 2,
      pixelCrop.height / 2,
      pixelCrop.width / 2,
      0,
      Math.PI * 2
    )
    ctx.fill()
  }

  // Convert canvas to blob then to file
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas is empty'))
        return
      }
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
      resolve(file)
    }, 'image/jpeg', 0.95)
  })
}

/**
 * Create an image element from a source URL
 */
function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.src = url
  })
}

export function ImageCropperDialog({
  open,
  onClose,
  imageSrc,
  onCropComplete,
  aspectRatio = 1,
  cropShape = 'round',
}: ImageCropperDialogProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const onCropChange = useCallback((location: { x: number; y: number }) => {
    setCrop(location)
  }, [])

  const onZoomChange = useCallback((zoom: number) => {
    setZoom(zoom)
  }, [])

  const onCropAreaChange = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleCrop = async () => {
    if (!croppedAreaPixels) return

    try {
      setIsProcessing(true)
      const croppedFile = await getCroppedImg(imageSrc, croppedAreaPixels, cropShape)
      onCropComplete(croppedFile)
      onClose()
    } catch (error) {
      console.error('Failed to crop image:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCancel = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop Image</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Cropper Area */}
          <div className="relative h-96 bg-muted rounded-lg overflow-hidden">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspectRatio}
              cropShape={cropShape}
              showGrid={false}
              onCropChange={onCropChange}
              onZoomChange={onZoomChange}
              onCropComplete={onCropAreaChange}
            />
          </div>

          {/* Zoom Slider */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Zoom</label>
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.1}
              onValueChange={(values) => setZoom(values[0] ?? 1)}
              className="w-full"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isProcessing}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCrop}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cropping...
              </>
            ) : (
              'Crop Image'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}