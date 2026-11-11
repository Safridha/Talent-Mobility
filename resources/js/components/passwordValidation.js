export function getPasswordRequirements(password, confirmation = '') {
  return [
    { id: 'length', label: 'Minimal 8 karakter', valid: password.length >= 8 },
    { id: 'uppercase', label: 'Mengandung huruf besar (A-Z)', valid: /[A-Z]/.test(password) },
    { id: 'lowercase', label: 'Mengandung huruf kecil (a-z)', valid: /[a-z]/.test(password) },
    { id: 'number', label: 'Mengandung angka (0-9)', valid: /[0-9]/.test(password) },
    { id: 'confirmation', label: 'Konfirmasi sama dengan kata sandi baru', valid: Boolean(confirmation) && password === confirmation },
  ]
}

export function meetsPasswordRequirements(password) {
  return getPasswordRequirements(password).slice(0, 4).every((requirement) => requirement.valid)
}
