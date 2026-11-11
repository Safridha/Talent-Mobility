import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ADMIN_PAGE_SIZE } from './useAdminPagination'

export function AdminTablePagination({ total, page, onPageChange }) {
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE))
  const currentPage = Math.min(Math.max(1, page), pageCount)
  const firstItem = total ? (currentPage - 1) * ADMIN_PAGE_SIZE + 1 : 0
  const lastItem = Math.min(currentPage * ADMIN_PAGE_SIZE, total)
  const formatNumber = (number) => number.toLocaleString('id-ID')

  return (
    <nav aria-label="Halaman tabel" className="admin-table-pagination">
      <span>
        Menampilkan <strong>{total ? `${formatNumber(firstItem)}–${formatNumber(lastItem)}` : '0'}</strong>
        {' '}dari <strong>{formatNumber(total)}</strong>
      </span>
      <div>
        <button
          aria-label="Halaman sebelumnya"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={18} />
        </button>
        <span>Halaman {formatNumber(currentPage)} dari {formatNumber(pageCount)}</span>
        <button
          aria-label="Halaman berikutnya"
          disabled={currentPage === pageCount}
          onClick={() => onPageChange(currentPage + 1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      </div>
    </nav>
  )
}
