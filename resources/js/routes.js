// Central list of URL paths per audience. Anything not listed renders the "Halaman tidak ditemukan" page.
export const ADMIN_VIEW_ROUTES = {
  dashboard: 'dashboard',
  applications: 'lamaran',
  accounts: 'manajemen-akun',
  units: 'unit-kerja',
  'application-limit': 'batas-lamaran',
  audit: 'audit-log',
}

export const LEGACY_ADMIN_ROUTE_ALIASES = {
  'admin/divisi': 'units',
  'admin/departemen': 'units',
  'admin/biro': 'units',
}

export const ADMIN_ROUTES = [
  ...Object.values(ADMIN_VIEW_ROUTES).map((view) => `admin/${view}`),
  ...Object.keys(LEGACY_ADMIN_ROUTE_ALIASES),
  'admin/account/profile', 'admin/account/security',
]

// Signed-in applicants.
export const APPLICANT_ROUTES = ['lowongan', 'lamaran', 'akun/profil', 'akun/keamanan']

// Visitors who are not signed in can only see the public job page.
export const GUEST_ROUTES = ['lowongan']
