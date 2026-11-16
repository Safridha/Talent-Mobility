import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../../api'
import SuccessPopup from '../../components/SuccessPopup'
import { Pencil } from 'lucide-react'
import { ConfirmDialog } from './AdminPrimitives'
import { queryKeys } from '../../query/queryKeys'

const MAX_APPLICATION_LIMIT = 10000

export default function ApplicationLimitManager() {
  const queryClient = useQueryClient()
  const [maxApplications, setMaxApplications] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [pendingEditValue, setPendingEditValue] = useState(null)
  const limitQuery = useQuery({
    queryKey: queryKeys.adminApplicationLimit,
    queryFn: () => apiRequest('/admin/application-limit'),
  })
  const currentLimit = limitQuery.data?.max_applications ?? null
  const hasLimit = currentLimit !== null

  const limitInputValue = maxApplications ?? (hasLimit ? String(currentLimit) : '')

  const saveMutation = useMutation({
    mutationFn: ({ max_applications, isEditing }) => apiRequest('/admin/application-limit', {
      method: isEditing ? 'PUT' : 'POST',
      body: JSON.stringify({ max_applications }),
    }),
    onSuccess: async (_, { max_applications, isEditing }) => {
      setMaxApplications(String(max_applications))
      setError('')
      setNotice(isEditing ? 'Batas lamaran berhasil diperbarui.' : 'Batas lamaran berhasil dibuat.')
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminApplicationLimit })
    },
  })
  const deleteMutation = useMutation({
    mutationFn: () => apiRequest('/admin/application-limit', {
      method: 'DELETE',
    }),
    onSuccess: async () => {
      setMaxApplications(null)
      setIsDeleteOpen(false)
      setError('')
      setNotice('Batas lamaran dihapus. Pelamar tidak memiliki batas jumlah lamaran.')
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminApplicationLimit })
    },
  })

  async function saveLimit(event) {
    event.preventDefault()
    setError('')
    const value = Number(limitInputValue)
    if (!Number.isInteger(value) || value < 1 || value > MAX_APPLICATION_LIMIT) {
      setError(`Masukkan bilangan bulat antara 1 dan ${MAX_APPLICATION_LIMIT}.`)
      return
    }
    if (hasLimit) {
      if (value === currentLimit) {
        setError('Nilai batas sama dengan batas saat ini. Ubah angkanya terlebih dahulu.')
        return
      }
      setPendingEditValue(value)
      return
    }
    await persistLimit(value)
  }

  async function persistLimit(value) {
    try {
      await saveMutation.mutateAsync({ max_applications: value, isEditing: hasLimit })
      setPendingEditValue(null)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function deleteLimit() {
    setError('')
    try {
      await deleteMutation.mutateAsync()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <section className="admin-application-limit">
      <header className="admin-table-heading">
        <div>
          <h2>Batas lamaran per pelamar</h2>
          <p>Atur batas bersama untuk setiap orang. Ini berbeda dari kuota pada lowongan.</p>
        </div>
      </header>
      {limitQuery.isPending ? (
        <div className="admin-loading">Memuat pengaturan batas lamaran...</div>
      ) : limitQuery.isError ? (
        <p className="admin-alert error" role="alert">{limitQuery.error.message}</p>
      ) : (
        <>
          <div className={`admin-application-limit-current${hasLimit ? '' : ' unlimited'}`}>
            <span>Batas saat ini</span>
            <strong>{hasLimit ? `${currentLimit} lamaran per orang` : 'Belum dibatasi'}</strong>
            <p>
              {hasLimit
                ? 'Jumlah ini menghitung semua lamaran yang pernah dikirim, termasuk lamaran yang ditolak.'
                : 'Pelamar dapat mengirim lamaran tanpa batas sampai Anda menetapkan batas.'}
            </p>
          </div>
          <form className="admin-application-limit-form" onSubmit={saveLimit}>
            <label htmlFor="admin-application-limit-value">
              <span>Maksimal lamaran yang boleh dikirim setiap pelamar</span>
              <input
                id="admin-application-limit-value"
                max={MAX_APPLICATION_LIMIT}
                min="1"
                onChange={(event) => setMaxApplications(event.target.value)}
                required
                step="1"
                type="number"
                value={limitInputValue}
              />
            </label>
            {error && <p className="admin-alert error" role="alert">{error}</p>}
            <div className="admin-application-limit-actions">
              <button className="apply-button" disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? 'Menyimpan...' : hasLimit ? 'Simpan perubahan' : 'Buat batas'}
              </button>
              {hasLimit && (
                <button className="admin-small-button danger" disabled={deleteMutation.isPending} onClick={() => setIsDeleteOpen(true)} type="button">
                  Hapus batas
                </button>
              )}
            </div>
          </form>
        </>
      )}
      <SuccessPopup message={notice} onClose={setNotice} />
      {isDeleteOpen && (
        <ConfirmDialog
          error={error}
          isBusy={deleteMutation.isPending}
          details={[
            'Perubahan berlaku langsung untuk semua pelamar, termasuk yang saat ini sedang membuka halaman lowongan.',
            'Indikator sisa kesempatan melamar akan hilang dan tombol Apply aktif kembali bagi pelamar yang sebelumnya sudah mencapai batas.',
            'Riwayat lamaran yang sudah masuk tidak dihapus.',
            'Tindakan ini dicatat di audit log. Batas dapat dibuat lagi kapan saja.',
          ]}
          message={`Batas saat ini ${currentLimit} lamaran per orang akan dihapus, sehingga pelamar dapat mengirim lamaran tanpa batas.`}
          onCancel={() => { setIsDeleteOpen(false); setError('') }}
          onConfirm={() => void deleteLimit()}
          title="Hapus batas lamaran?"
        />
      )}
      {pendingEditValue !== null && (
        <ConfirmDialog
          busyLabel="Menyimpan..."
          confirmLabel="Ya, simpan perubahan"
          details={[
            'Perubahan berlaku langsung untuk semua pelamar.',
            'Jumlah yang dihitung adalah semua lamaran yang pernah dikirim, termasuk yang ditolak.',
            pendingEditValue > currentLimit
              ? 'Pelamar yang sebelumnya sudah mencapai batas dapat melamar lagi sampai batas baru.'
              : 'Pelamar yang jumlah lamarannya sudah sama atau melebihi batas baru tidak dapat melamar lagi. Lamaran mereka yang sudah masuk tidak dihapus.',
            'Perubahan dicatat di audit log.',
          ]}
          error={error}
          icon={Pencil}
          isBusy={saveMutation.isPending}
          message={`Batas lamaran akan diubah dari ${currentLimit} menjadi ${pendingEditValue} lamaran per orang.`}
          onCancel={() => { setPendingEditValue(null); setError('') }}
          onConfirm={() => void persistLimit(pendingEditValue)}
          title="Ubah batas lamaran?"
          tone="primary"
        />
      )}
    </section>
  )
}
