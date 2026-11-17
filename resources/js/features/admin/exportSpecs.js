import { applicationStatusOptions } from '../applications/status'

// Data for the table exports (PDF and Excel). Excel gets every column; the PDF folds them into a few
// readable ones. Kept apart from the components so the shapes can be tested on their own.

export function applicationStatusLabel(status) {
  return applicationStatusOptions.find((option) => option.value === status)?.label || status
}

// "Divisi X / Departemen Y / Biro Z" -> "Biro Z" on the first line, its parents muted underneath.
function splitUnitPath(label) {
  const parts = String(label ?? '').split(' / ').filter(Boolean)
  if (parts.length < 2) return parts[0] ?? '-'
  const specific = parts.pop()
  return `${specific}\n${parts.join(' / ')}`
}

export function buildApplicationsExport(applications) {
  const joinLines = (...lines) => lines.filter(Boolean).join('\n')
  return {
    filename: 'lamaran',
    title: 'Lamaran Masuk',
    subtitle: `${applications.length} lamaran`,
    summary: applicationStatusOptions.map((option) => ({
      label: option.label,
      value: applications.filter((application) => application.status === option.value).length,
    })),
    headers: ['ID lamaran', 'Nama pelamar', 'Email', 'NIP', 'Divisi asal', 'Unit asal', 'Unit tujuan', 'Pendidikan', 'Bidang studi', 'Jumlah berkas', 'Status', 'Tanggal lamaran'],
    rows: applications.map((application) => [
      application.id,
      application.applicant_name,
      application.applicant_email,
      application.employee_number,
      application.origin_division || application.current_unit,
      application.origin_unit || application.current_position,
      application.target_label || application.job_title,
      application.education_level,
      application.study_field,
      application.documents_count ?? 0,
      applicationStatusLabel(application.status),
      new Date(application.created_at),
    ]),
    statusColumn: 10,
    pdf: {
      headers: ['Pelamar', 'Unit asal', 'Unit tujuan', 'Pendidikan', 'Berkas', 'Status', 'Tanggal'],
      columns: [
        { weight: 215, type: 'person' },
        { weight: 140, type: 'stack' },
        { weight: 200, type: 'stack' },
        { weight: 95, type: 'stack' },
        { weight: 46, type: 'center' },
        { weight: 90, type: 'status' },
        { weight: 84 },
      ],
      rows: applications.map((application) => [
        joinLines(application.applicant_name, [application.employee_number, application.applicant_email].filter(Boolean).join('  ·  ')),
        joinLines(application.origin_division || application.current_unit || '-', application.origin_unit || application.current_position),
        splitUnitPath(application.target_label || application.job_title),
        joinLines(application.education_level || '-', application.study_field),
        application.documents_count ?? 0,
        applicationStatusLabel(application.status),
        new Date(application.created_at),
      ]),
    },
  }
}

export function buildAccountsExport(isAdminAccount, accounts, adminRoles) {
  const statusLabel = (account) => (account.is_active ? 'Aktif' : 'Nonaktif')
  const headers = isAdminAccount
    ? ['Nama', 'Email', 'Peran', 'Lingkup organisasi', 'Izin aktif', 'Terdaftar', 'Status']
    : ['NIP', 'Nama', 'Divisi', 'Departemen', 'Biro', 'Jabatan', 'Pendidikan', 'Email', 'Lamaran', 'Status']
  return {
    filename: isAdminAccount ? 'akun-admin' : 'akun-pelamar',
    title: isAdminAccount ? 'Akun Admin' : 'Akun Pelamar',
    subtitle: `${accounts.length} akun`,
    summary: ['Aktif', 'Nonaktif'].map((label) => ({ label, value: accounts.filter((account) => statusLabel(account) === label).length })),
    headers,
    statusColumn: headers.length - 1,
    rows: accounts.map((account) => (isAdminAccount
      ? [
          account.name,
          account.email,
          adminRoles.find((role) => role.value === account.admin_role)?.label || account.admin_role,
          account.scope_label,
          (account.permissions || []).length,
          new Date(account.created_at),
          statusLabel(account),
        ]
      : [
          account.employee_number || '-',
          account.name,
          account.division_name || '-',
          account.department_name || '-',
          account.bureau_name || '-',
          account.position_title || '-',
          account.last_education || '-',
          account.email || '-',
          account.applications_count,
          statusLabel(account),
        ])),
    pdf: {
      headers: isAdminAccount
        ? ['Akun', 'Peran', 'Lingkup organisasi', 'Izin', 'Terdaftar', 'Status']
        : ['Pelamar', 'Unit kerja', 'Jabatan', 'Pendidikan', 'Lamaran', 'Status'],
      columns: isAdminAccount
        ? [{ weight: 230, type: 'person' }, { weight: 130 }, { weight: 170 }, { weight: 40, type: 'center' }, { weight: 90 }, { weight: 90, type: 'status' }]
        : [{ weight: 240, type: 'person' }, { weight: 190, type: 'stack' }, { weight: 120 }, { weight: 80 }, { weight: 50, type: 'center' }, { weight: 90, type: 'status' }],
      rows: accounts.map((account) => (isAdminAccount
        ? [
            [account.name, account.email].filter(Boolean).join('\n'),
            adminRoles.find((role) => role.value === account.admin_role)?.label || account.admin_role,
            account.scope_label || '-',
            (account.permissions || []).length,
            new Date(account.created_at).toLocaleDateString('id-ID'),
            statusLabel(account),
          ]
        : [
            [account.name, [account.employee_number, account.email].filter(Boolean).join('  ·  ')].filter(Boolean).join('\n'),
            [account.division_name || '-', [account.department_name, account.bureau_name].filter(Boolean).join(' / ')].filter(Boolean).join('\n'),
            account.position_title || '-',
            account.last_education || '-',
            account.applications_count,
            statusLabel(account),
          ])),
    },
  }
}
