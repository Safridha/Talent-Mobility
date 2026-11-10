export function getJobTargetLabels(job) {
  const labels = [job.division]
  if (job.target_level === 'secretariat') labels.push(job.unit)
  if (job.target_level === 'department' || job.target_level === 'bureau') labels.push(job.department)
  if (job.target_level === 'bureau') labels.push(job.unit)
  return labels.filter(Boolean)
}
