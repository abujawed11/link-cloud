export function formatBytes(bytes) {
  const n = Number(bytes)
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  const v = n / 1024 ** i
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

export function formatDate(value) {
  return new Date(value).toLocaleString()
}

export function formatSpeed(bytesPerSecond) {
  const n = Number(bytesPerSecond)
  if (!n || n < 1) return ''
  return `${formatBytes(n)}/s`
}

export function formatEta(bytesDone, bytesTotal, bytesPerSecond) {
  const left = Number(bytesTotal) - Number(bytesDone)
  const rate = Number(bytesPerSecond)
  if (!bytesTotal || !rate || left <= 0) return ''
  return formatDuration(Math.round(left / rate))
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
