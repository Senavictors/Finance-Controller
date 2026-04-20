export type UserChipPalette = {
  bg: string
  border: string
  text: string
  dotBg: string
}

const PALETTES: UserChipPalette[] = [
  {
    bg: 'bg-teal-100 dark:bg-teal-900/30',
    border: 'border-teal-200 dark:border-teal-800',
    text: 'text-teal-900 dark:text-teal-100',
    dotBg: 'bg-teal-500 text-white',
  },
  {
    bg: 'bg-emerald-100 dark:bg-emerald-900/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-900 dark:text-emerald-100',
    dotBg: 'bg-emerald-500 text-white',
  },
  {
    bg: 'bg-sky-100 dark:bg-sky-900/30',
    border: 'border-sky-200 dark:border-sky-800',
    text: 'text-sky-900 dark:text-sky-100',
    dotBg: 'bg-sky-500 text-white',
  },
  {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-900 dark:text-blue-100',
    dotBg: 'bg-blue-500 text-white',
  },
  {
    bg: 'bg-cyan-100 dark:bg-cyan-900/30',
    border: 'border-cyan-200 dark:border-cyan-800',
    text: 'text-cyan-900 dark:text-cyan-100',
    dotBg: 'bg-cyan-500 text-white',
  },
]

export function getUserChipPalette(seed: string): UserChipPalette {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return PALETTES[hash % PALETTES.length]
}

export function getInitials(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).slice(0, 2)
  return parts
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
}
