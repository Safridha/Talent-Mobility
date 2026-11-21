import { CalendarClock, CalendarDays, Hourglass, Lock } from 'lucide-react'
import { daysBetween, formatBatchDate, formatBatchRange } from './batchFormat'

const STEPS = ['Pendaftaran', 'Seleksi dan wawancara', 'Selesai']

function describe(data) {
  const { phase, batch, previous_batch: previous, next_batch: next, today } = data
  if (phase === 'registration') {
    const daysLeft = daysBetween(today, batch.registration_end)
    return {
      tone: 'open',
      icon: CalendarDays,
      step: 0,
      badge: 'Pendaftaran dibuka',
      title: `${batch.name} sedang dibuka`,
      lines: [
        `Pendaftaran aktif pada ${formatBatchRange(batch.registration_start, batch.registration_end)}.`,
        batch.all_units ? 'Semua unit kerja dibuka untuk batch ini.' : 'Hanya unit kerja tertentu yang dibuka untuk batch ini.',
        daysLeft === 0 ? 'Hari ini adalah hari terakhir pendaftaran.' : `Sisa ${daysLeft} hari lagi untuk mendaftar.`,
      ],
    }
  }
  if (phase === 'selection') {
    return {
      tone: 'selection',
      icon: Hourglass,
      step: 1,
      badge: 'Seleksi dan wawancara',
      title: `Pendaftaran ${batch.name} sudah berakhir`,
      lines: [
        `Sedang berlangsung proses seleksi & wawancara pada ${formatBatchRange(batch.interview_start, batch.interview_end)}.`,
        'Unit kerja batch sebelumnya tetap dapat dilihat, tetapi belum dapat dilamar.',
      ],
    }
  }
  return {
    tone: 'idle',
    icon: previous ? Lock : CalendarClock,
    step: previous ? 2 : -1,
    badge: previous ? 'Selesai' : 'Belum dibuka',
    title: 'Batch baru belum dibuka',
    lines: [
      previous ? `${previous.name} telah selesai pada ${formatBatchDate(previous.interview_end)}.` : null,
      next
        ? `${next.name} dijadwalkan dibuka pada ${formatBatchDate(next.registration_start)}.`
        : 'Pantau halaman ini untuk jadwal pendaftaran berikutnya.',
      'Unit kerja batch sebelumnya tetap dapat dilihat, tetapi belum dapat dilamar.',
    ].filter(Boolean),
  }
}

/** Status banner for the recruitment batch, shown between the hero and the unit picker. */
export default function BatchBanner({ data }) {
  if (!data) return null
  const view = describe(data)
  const Icon = view.icon
  return (
    <section aria-label="Status batch pendaftaran" className={`batch-banner is-${view.tone}`} role="status">
      <div className="batch-banner-head">
        <span aria-hidden="true" className="batch-banner-icon"><Icon size={20} /></span>
        <h2>{view.title}</h2>
        <span className="batch-banner-badge">{view.badge}</span>
      </div>
      <ol aria-label="Tahapan batch" className="batch-banner-steps">
        {STEPS.map((label, index) => (
          <li className={index < view.step ? 'is-done' : index === view.step ? 'is-current' : ''} key={label}>
            <span aria-hidden="true" className="batch-banner-dot" />
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <div className="batch-banner-copy">
        {view.lines.map((line) => <p key={line}>{line}</p>)}
      </div>
    </section>
  )
}
