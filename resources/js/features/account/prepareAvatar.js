// Turns any photo the user picks into a small square JPEG so phone photos (several MB, rotated,
// HEIC-converted, ...) always fit the 2 MB upload limit and look the same everywhere.
const MAX_SIDE = 512
const READ_ERROR = 'Foto tidak dapat dibaca. Gunakan file JPG, PNG, atau WebP.'

async function loadImage(file) {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height }
    } catch {
      // Fall back to an <img> element below.
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(READ_ERROR))
    }
    image.src = url
  })
}

export async function prepareAvatar(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
    throw new Error('Foto harus berupa JPG, PNG, atau WebP.')
  }
  const { source, width, height } = await loadImage(file)
  if (!width || !height) throw new Error(READ_ERROR)
  const side = Math.min(width, height)
  const size = Math.min(MAX_SIDE, side)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)
  context.drawImage(source, (width - side) / 2, (height - side) / 2, side, side, 0, 0, size, size)
  if (typeof source.close === 'function') source.close()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
  if (!blob) throw new Error(READ_ERROR)
  return new File([blob], 'foto-profil.jpg', { type: 'image/jpeg' })
}
