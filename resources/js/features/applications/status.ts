export const applicationStatusOptions = [
  { value: 'submitted', label: 'Masuk' },
  { value: 'screening', label: 'Seleksi' },
  { value: 'interview', label: 'Wawancara' },
  { value: 'accepted', label: 'Diterima' },
  { value: 'rejected', label: 'Ditolak' },
] as const

export type ApplicationStatus = typeof applicationStatusOptions[number]['value']

export const applicationStatusTransitions: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  submitted: ['screening', 'interview'],
  screening: ['interview', 'accepted', 'rejected'],
  interview: ['accepted', 'rejected'],
  accepted: [],
  rejected: [],
}

export const applicationStatusDescriptions: Record<ApplicationStatus, string> = {
  submitted: 'Lamaran Anda sudah diterima dan menunggu peninjauan awal.',
  screening: 'Tim Human Capital sedang meninjau kesesuaian kualifikasi Anda.',
  interview: 'Anda masuk tahap wawancara. Pantau informasi lanjutan dari tim Human Capital.',
  accepted: 'Selamat, lamaran Anda diterima. Tim Human Capital akan menghubungi Anda untuk langkah berikutnya.',
  rejected: 'Lamaran belum dapat dilanjutkan untuk posisi ini. Terima kasih atas partisipasi Anda.',
}

export function isApplicationStatus(status: string): status is ApplicationStatus {
  return applicationStatusOptions.some((option) => option.value === status)
}

export function getAvailableApplicationStatuses(currentStatus: string) {
  const allowedStatuses = isApplicationStatus(currentStatus)
    ? applicationStatusTransitions[currentStatus]
    : []

  return applicationStatusOptions.filter((option) => (
    option.value === currentStatus || allowedStatuses.includes(option.value)
  ))
}

export function getApplicationStatusDescription(status: string) {
  return isApplicationStatus(status) ? applicationStatusDescriptions[status] : undefined
}
