import { NextResponse } from 'next/server'
import { getAgentSupabase } from '@/lib/agent-db'

export const revalidate = 0

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params
  const supabase = getAgentSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase 미설정' }, { status: 503 })
  }

  const { data, error } = await supabase
    .from('site_config')
    .select('key, value, updated_at')
    .eq('key', key)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '키를 찾을 수 없습니다' }, { status: 404 })
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store' }
  })
}