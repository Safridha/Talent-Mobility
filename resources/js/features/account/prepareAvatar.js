// Turns any photo the user picks into a small square JPEG so phone photos (several MB, rotated,
// HEIC, ...) always fit the upload limit and look the same everywhere. Large photos are compressed
// step by step until the result is small.
const MAX_SIDE = 512
const MIN_SIDE = 192
const TARGET_BYTES = 300 * 1024
const READ_ERROR = 'Foto tidak dapat dibaca. Coba foto lain (JPG, PNG, WebP, atau HEIC).'

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

function encode(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

export async function prepareAvatar(file) {
  // Anything the browser can decode is accepted (the type check is left to decoding, so HEIC from iOS works).
  const { source, width, height } = await loadImage(file)
  if (!width || !height) throw new Error(READ_ERROR)
  const side = Math.min(width, height)
  const cropX = (width - side) / 2
  const cropY = (height - side) / 2

  let size = Math.min(MAX_SIDE, side)
  let quality = 0.88
  let blob = null
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size, size)
    context.drawImage(source, cropX, cropY, side, side, 0, 0, size, size)
    blob = await encode(canvas, quality)
    if (!blob) throw new Error(READ_ERROR)
    if (blob.size <= TARGET_BYTES) break
    // Too big: lower the quality first, then the dimensions.
    if (quality > 0.55) quality = Math.max(0.5, quality - 0.1)
    else if (size > MIN_SIDE) size = Math.max(MIN_SIDE, Math.floor(size * 0.8))
    else break
  }
  if (typeof source.close === 'function') source.close()
  return new File([blob], 'foto-profil.jpg', { type: 'image/jpeg' })
}
