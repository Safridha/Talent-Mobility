// Education levels used in the employee roster (Akun Pelamar) and the profile settings.
export const EDUCATION_OPTIONS = ['SMA/SMK/SEDERAJAT', 'D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3']

// The application form stores a coarser set of levels; translate the roster value.
export function toApplicationEducation(level) {
  switch (level) {
    case 'SMA/SMK/SEDERAJAT': return 'SMA/SMK'
    case 'D1':
    case 'D2':
    case 'D3':
    case 'S2':
    case 'S3': return level
    case 'D4':
    case 'S1': return 'D4/S1'
    default: return 'Lainnya'
  }
}
