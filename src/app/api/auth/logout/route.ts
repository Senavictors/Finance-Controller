import { NextResponse } from 'next/server'
import { destroySession } from '@/server/auth'

export async function POST() {
  try {
    await destroySession()
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
