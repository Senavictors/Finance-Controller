import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/server/auth'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
const MAX_SIZE_BYTES = 5 * 1024 * 1024

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await requireAuth()

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Arquivo nao enviado' }, { status: 400 })
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Formato invalido. Use JPG, PNG, WebP ou AVIF.' },
        { status: 415 },
      )
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'Imagem muito grande. Tamanho maximo: 5 MB.' },
        { status: 413 },
      )
    }

    const ext = MIME_TO_EXT[file.type]
    const uniqueId = Math.random().toString(36).slice(2, 10)
    const filename = `${userId}-${Date.now()}-${uniqueId}.${ext}`
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'wishlist')
    const filePath = join(uploadDir, filename)

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    return NextResponse.json({ url: `/uploads/wishlist/${filename}` }, { status: 201 })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    return NextResponse.json({ error: 'Erro interno ao salvar imagem' }, { status: 500 })
  }
}
