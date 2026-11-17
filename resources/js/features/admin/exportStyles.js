// Shared look of the table exports (PDF and Excel): one soft denim blue plus a tint per status label.
export const EXPORT_BLUE = [74, 103, 184]

export const TABLE_TONES = {
  Masuk: { fill: [231, 237, 250], text: [60, 84, 153] },
  Seleksi: { fill: [241, 237, 252], text: [91, 63, 168] },
  Wawancara: { fill: [253, 243, 222], text: [148, 89, 10] },
  Diterima: { fill: [228, 245, 236], text: [31, 118, 75] },
  Ditolak: { fill: [252, 236, 238], text: [160, 47, 58] },
  Aktif: { fill: [228, 245, 236], text: [31, 118, 75] },
  Nonaktif: { fill: [238, 241, 245], text: [86, 98, 116] },
}

export const DEFAULT_TONE = { fill: [238, 241, 245], text: [86, 98, 116] }

export function toneFor(label) {
  return TABLE_TONES[label] ?? DEFAULT_TONE
}

export function toArgb([red, green, blue]) {
  return `FF${[red, green, blue].map((part) => part.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

export function formatPrintedDate(date = new Date()) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(date)
}

export function cellText(value) {
  if (value == null) return ''
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'short', timeStyle: 'short' }).format(value)
  }
  return String(value)
}
