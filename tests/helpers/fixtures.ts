import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Raiz de `tests/fixtures`. */
export const FIXTURES_DIR = fileURLToPath(new URL('../fixtures', import.meta.url))

/** Lê uma fixture sintética (UTF-8) por caminho relativo a `tests/fixtures`. */
export function readFixture(relativePath: string): string {
  return readFileSync(path.join(FIXTURES_DIR, relativePath), 'utf8')
}
