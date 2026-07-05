-- src/app/api/chat/decision/route.ts가 site_decisions INSERT → site_config UPSERT →
-- (실패 시) site_config 롤백 + site_decisions status='failed' 갱신을 4개의 별도 요청으로
-- 실행하고 있어, 롤백 단계 자체가 중간에 실패하면 site_config는 복구됐는데 site_decisions는
-- 'pending'에 멈춰있는 등 데이터 불일치가 발생할 수 있었다 (Gemini 코드 리뷰에서 지적됨).
-- 전체 과정을 단일 PL/pgSQL 함수(=단일 트랜잭션)로 묶어 원자성을 보장한다.

DROP FUNCTION IF EXISTS public.apply_site_decision(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.apply_site_decision(
  p_session_id text,
  p_decision_type text,
  p_target_page text,
  p_key text,
  p_value text,
  p_label text
) RETURNS TABLE(id uuid, prev_value text, status text, error_message text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_value text;
  v_id uuid;
BEGIN
  SELECT sc.value INTO v_prev_value FROM public.site_config sc WHERE sc.key = p_key;
  v_prev_value := COALESCE(v_prev_value, '');

  INSERT INTO public.site_decisions
    (session_id, decision_type, target_page, key, value, prev_value, label, status, boss_confirmed)
  VALUES
    (p_session_id, p_decision_type, p_target_page, p_key, p_value, v_prev_value, p_label, 'pending', false)
  RETURNING site_decisions.id INTO v_id;

  BEGIN
    INSERT INTO public.site_config (key, value, updated_at, updated_by)
    VALUES (p_key, p_value, now(), 'boss')
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;

    UPDATE public.site_decisions SET status = 'applied', applied_at = now() WHERE site_decisions.id = v_id;

    RETURN QUERY SELECT v_id, v_prev_value, 'applied'::text, NULL::text;
  EXCEPTION WHEN OTHERS THEN
    -- site_config INSERT/UPSERT는 중첩 블록 안에서 실패했으므로 이 지점까지 자동 롤백되어
    -- site_config는 손대지 않은 상태로 남는다. site_decisions만 'failed'로 남겨 감사 기록을 보존한다.
    UPDATE public.site_decisions SET status = 'failed' WHERE site_decisions.id = v_id;
    RETURN QUERY SELECT v_id, v_prev_value, 'failed'::text, SQLERRM;
  END;
END;
$$;
