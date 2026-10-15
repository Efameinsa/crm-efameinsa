-- ============================================================
-- CRM EFAMEINSA · Migración 0495 · Al corregir un cierre, el código se pide a CENTRAL
-- ============================================================
-- Santos, 15-10 (sobre la 0494): «solo para el procedimiento de editar un
-- cierre debe salir ahí que solo se le puede pedir código a Central (no
-- pongas a nadie más)». Los mensajes que ve quien corrige o adjunta a un
-- cierre emitido ya no nombran a gerencia. Las reglas no cambian.
-- ============================================================
do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.validar_codigo_autorizacion(text,text)'::regprocedure);
  v_new := replace(v_def, $a$then 'Central o a gerencia' else$a$, $b$then 'Central' else$b$);
  v_new := replace(v_new, $a$la autoriza Central (o gerencia): pídale el código a Central.$a$, $b$la autoriza Central: pídale el código a Central.$b$);
  if v_new = v_def or v_new like '%Central o a gerencia%' or v_new like '%Central (o gerencia)%' then
    raise exception '0495: validar_codigo_autorizacion no tiene la forma esperada';
  end if;
  execute v_new;
end
$mig$;
