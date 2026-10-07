/**
 * Gera os PNGs do PWA a partir de `public/icons/source.svg` (FC2-F0-05).
 * Uso: `node scripts/generate-icons.mjs`
 *
 * Depende de `sharp` (já presente como dependência transitiva do Next). Todos os PNGs saem
 * sem canal alfa: o iOS pinta transparência de preto no apple-touch-icon.
 */
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ICONS_DIR = join(ROOT, 'public', 'icons')

// Mesmo valor de --fc-void (src/styles/tokens.css); o teste src/app/pwa.test.ts guarda o manifest.
const VOID = '#04060b'

const TARGETS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  // A arte já respeita a zona segura (moeda em ~66% da tela), então o maskable usa a mesma fonte.
  { file: 'icon-maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
]

await mkdir(ICONS_DIR, { recursive: true })
const svg = await readFile(join(ICONS_DIR, 'source.svg'))

for (const { file, size } of TARGETS) {
  await sharp(svg, { density: (72 * size * 2) / 1024 })
    .resize(size, size)
    .flatten({ background: VOID })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(join(ICONS_DIR, file))
  console.log(`gerado public/icons/${file} (${size}x${size})`)
}
