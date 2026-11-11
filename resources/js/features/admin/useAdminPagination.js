import { useState } from 'react'

export const ADMIN_PAGE_SIZE = 5

export function useAdminPagination(items) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(items.length / ADMIN_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)

  return {
    items: items.slice((currentPage - 1) * ADMIN_PAGE_SIZE, currentPage * ADMIN_PAGE_SIZE),
    page: currentPage,
    setPage: (nextPage) => setPage(Math.min(Math.max(1, nextPage), pageCount)),
  }
}
