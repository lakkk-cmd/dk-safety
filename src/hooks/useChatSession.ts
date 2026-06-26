import { useEffect, useRef, useCallback } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  tool_calls?: object
}

export function useChatSession(messages: Message[]) {
  const sessionId = useRef(
    `session-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  const isSaving = useRef(false)

  const saveSession = useCallback(async (isFinal = false) => {
    if (isSaving.current) return
    if (messages.length < 2) return
    isSaving.current = true
    try {
      // 클라이언트에서 시크릿 키 사용 금지.
      // /api/chat/end-session은 관리자 쿠키(dk_admin_auth)로 인증하며
      // 내부에서 summary + save를 모두 처리한다.
      await fetch('/api/chat/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId.current,
          messages: messages.map(m => ({
            role: m.role,
            content: typeof m.content === 'string'
              ? m.content : JSON.stringify(m.content),
          })),
        }),
        keepalive: isFinal,
      })
    } catch (e) {
      console.error('대화 저장 실패:', e)
    } finally {
      isSaving.current = false
    }
  }, [messages])

  // ① 창 닫기 시 자동 저장
  useEffect(() => {
    const handleUnload = () => { void saveSession(true) }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [saveSession])

  // ② 30분마다 자동 중간 저장
  useEffect(() => {
    const interval = setInterval(() => { void saveSession(false) }, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [saveSession])

  // ③ 메시지 10개마다 자동 저장
  useEffect(() => {
    if (messages.length > 0 && messages.length % 10 === 0) {
      void saveSession(false)
    }
  }, [messages.length, saveSession])

  return { sessionId: sessionId.current, saveSession }
}
