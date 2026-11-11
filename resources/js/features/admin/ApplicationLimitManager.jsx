import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../../api'
import SuccessPopup from '../../components/SuccessPopup'
import { ConfirmDialog } from './AdminPrimitives'
import { queryKeys } from '../../query/queryKeys'

const MAX_APPLICATION_LIMIT = 10000

export default function ApplicationLimitManager() {
  const queryClient = useQueryClient()
  const [maxApplications, setMaxApplications] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
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
    try {
      await saveMutation.mutateAsync({ max_applications: value, isEditing: hasLimit })
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
          message="Setelah batas dihapus, setiap pelamar dapat mengirim lamaran tanpa batas. Riwayat lamaran yang sudah masuk tidak akan dihapus."
          onCancel={() => { setIsDeleteOpen(false); setError('') }}
          onConfirm={() => void deleteLimit()}
          title="Hapus batas lamaran?"
        />
      )}
    </section>
  )
}
