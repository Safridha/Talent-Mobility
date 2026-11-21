// Batch dates are plain calendar days (YYYY-MM-DD, Asia/Jakarta) — parse them as local dates so they never shift a day.
export function parseBatchDate(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatBatchDate(value, options = { day: 'numeric', month: 'long', year: 'numeric' }) {
  return parseBatchDate(value).toLocaleDateString('id-ID', options)
}

// "10 November - 30 November 2026" (drops the year on the first date when both share it).
export function formatBatchRange(start, end) {
  const from = parseBatchDate(start)
  const to = parseBatchDate(end)
  const sameYear = from.getFullYear() === to.getFullYear()
  const left = from.toLocaleDateString('id-ID', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })
  return `${left} - ${to.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseBatchDate(toIso) - parseBatchDate(fromIso)) / 86_400_000)
}

// Where `today` falls in a batch: upcoming, registration, selection (selection + interviews) or finished.
export function batchPhase(batch, today) {
  if (today < batch.registration_start) return 'upcoming'
  if (today <= batch.registration_end) return 'registration'
  if (today <= batch.interview_end) return 'selection'
  return 'finished'
}

export const batchPhaseLabels = {
  upcoming: 'Terjadwal',
  registration: 'Pendaftaran dibuka',
  selection: 'Seleksi dan wawancara',
  finished: 'Selesai',
}

// Local calendar day as YYYY-MM-DD (never shifted by the time zone).
export function toBatchIso(date) {
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function addBatchDays(iso, days) {
  const date = parseBatchDate(iso)
  date.setDate(date.getDate() + days)
  return toBatchIso(date)
}
