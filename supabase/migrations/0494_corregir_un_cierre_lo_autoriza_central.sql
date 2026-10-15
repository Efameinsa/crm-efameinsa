-- ============================================================
-- CRM EFAMEINSA · Migración 0494 · Corregir un cierre emitido lo autoriza CENTRAL
-- ============================================================
-- Reunión de Carlos con Santos y Central, 15-10-2026 09:53, por OPEN 057-2026
-- (NEWREST): Brenda corrigió su cierre emitido para agregar la orden de
-- servicio con el código de Lesly, y Central se enteró por un correo. Carlos:
-- «hay que quitarle que dé el PIN a ella… tú [Alondra, Central] vas a dar el
-- código sí y solo sí para modificar el cierre… coordinándolo conmigo…
-- solamente para edición de cierres, nada más». Central es quien ejecuta el
-- cierre (lo lee y lo vuelve pedido): si alguien lo cambia, tiene que pasar
-- por ella.
--
-- Qué cambia (solo la edición de cierres emitidos):
--   · Ámbito nuevo 'corregir_cierre' en validar_codigo_autorizacion: valen los
--     códigos de gerencia/admin y de CENTRAL. El de operaciones (Lesly) ya no.
--     Si alguien escribe el código de Lesly, el mensaje lo dice con nombre de
--     área para que no se quede probando.
--   · abrir_correccion_informe (0154) y agregar_adjuntos_cierre_sellado (0342)
--     piden ese ámbito. Lo demás que Lesly autoriza (derivar a postventa,
--     anular, cotizaciones, carteras…) sigue igual.
--   · Central no se autoriza a sí misma una corrección: si Central corrige un
--     cierre, el código lo da gerencia. Para agregar un documento (el voucher
--     que llega tarde) sí puede usar el suyo: es la que lo recibe.
--   · mi_pin_supervisor: Central ve su código en la barra lateral.
--
-- Se hace reemplazando texto en la definición viva (como 0342), para no pisar
-- lo que otras migraciones le agregaron (0343: el código cambia al usarse).
-- Cada reemplazo comprueba que encontró lo que buscaba: si no, falla entera.
-- ============================================================

do $mig$
declare
  v_def  text;
  v_new  text;
begin
  -- ── 1. validar_codigo_autorizacion: el ámbito 'corregir_cierre' ─────────
  v_def := pg_get_functiondef('public.validar_codigo_autorizacion(text,text)'::regprocedure);
  v_new := replace(v_def,
$a$       and (p.rol::text in ('gerencia', 'admin')
            or (p_ambito in ('operaciones', 'derivacion')
                and (p.rol::text = 'operaciones' or p.es_operaciones)))$a$,
$b$       and (p.rol::text in ('gerencia', 'admin')
            or (p_ambito in ('operaciones', 'derivacion')
                and (p.rol::text = 'operaciones' or p.es_operaciones))
            or (p_ambito = 'corregir_cierre'
                and p.rol::text = 'central' and p.es_prueba = es_cuenta_prueba()))$b$);
  if (length(v_def) - length(replace(v_def, $c$or (p_ambito in ('operaciones', 'derivacion')$c$, ''))) / length($c$or (p_ambito in ('operaciones', 'derivacion')$c$) <> 2
     or v_new = v_def then
    raise exception '0494: validar_codigo_autorizacion no tiene la forma esperada (dos lazos de supervisores)';
  end if;

  v_def := v_new;
  v_new := replace(v_def,
$a$  insert into intentos_pin_supervisor (solicitante_id) values (v_solicitante);
  raise exception 'El código no es válido o ya venció. Pídale uno nuevo a gerencia o a operaciones.';$a$,
$b$  -- 0494: el código de operaciones ya no corrige cierres. Se dice claro.
  if p_ambito = 'corregir_cierre' then
    for v_sup in
      select p.id from perfiles p
       where p.activo and (p.rol::text = 'operaciones' or p.es_operaciones)
         and p.rol::text not in ('gerencia', 'admin', 'central')
    loop
      if v_pin = codigo_pin_supervisor(v_sup.id, v_ventana)
         or v_pin = codigo_pin_supervisor(v_sup.id, v_ventana - 1) then
        raise exception 'Ese código es de operaciones. Desde el 15-10 la corrección de un cierre emitido la autoriza Central (o gerencia): pídale el código a Central.';
      end if;
    end loop;
  end if;

  insert into intentos_pin_supervisor (solicitante_id) values (v_solicitante);
  raise exception 'El código no es válido o ya venció. Pídale uno nuevo a %.',
    case when p_ambito = 'corregir_cierre' then 'Central o a gerencia' else 'gerencia o a operaciones' end;$b$);
  if v_new = v_def then raise exception '0494: no se encontró el mensaje final de validar_codigo_autorizacion'; end if;
  execute v_new;

  -- ── 2. abrir_correccion_informe: ámbito nuevo y nadie se autoriza solo ───
  v_def := pg_get_functiondef('public.abrir_correccion_informe(uuid,text,text)'::regprocedure);
  v_new := replace(v_def,
$a$  v_autorizo := validar_codigo_autorizacion(p_pin, 'operaciones');$a$,
$b$  v_autorizo := validar_codigo_autorizacion(p_pin, 'corregir_cierre');

  -- 0494: Central autoriza las correcciones de los demás, no las suyas.
  if v_autorizo = v_quien
     and not exists (select 1 from perfiles where id = v_quien and rol::text in ('gerencia', 'admin')) then
    raise exception 'No puede autorizar su propia corrección: para corregir este cierre pídale el código a gerencia.';
  end if;$b$);
  if v_new = v_def then raise exception '0494: abrir_correccion_informe no tiene la forma esperada'; end if;
  execute v_new;

  -- ── 3. Agregar documentos a un cierre sellado: mismo ámbito ─────────────
  v_def := pg_get_functiondef('public.agregar_adjuntos_cierre_sellado(uuid,jsonb,text)'::regprocedure);
  v_new := replace(v_def,
    $a$validar_codigo_autorizacion(p_pin, 'operaciones')$a$,
    $b$validar_codigo_autorizacion(p_pin, 'corregir_cierre')$b$);
  if v_new = v_def then raise exception '0494: agregar_adjuntos_cierre_sellado no tiene la forma esperada'; end if;
  execute v_new;

  -- ── 4. Central ve su código ─────────────────────────────────────────────
  v_def := pg_get_functiondef('public.mi_pin_supervisor()'::regprocedure);
  v_new := replace(v_def,
    $a$v_rol not in ('gerencia', 'admin')) and not es_operaciones()$a$,
    $b$v_rol not in ('gerencia', 'admin', 'central')) and not es_operaciones()$b$);
  v_new := replace(v_new,
    $a$'Solo gerencia o el administrador de operaciones puede autorizar'$a$,
    $b$'Solo gerencia, Central o el administrador de operaciones puede autorizar'$b$);
  if v_new = v_def then raise exception '0494: mi_pin_supervisor no tiene la forma esperada'; end if;
  execute v_new;
end
$mig$;

comment on function public.abrir_correccion_informe(uuid, text, text) is
  'Abre la media hora para corregir un cierre emitido. Código de Central o gerencia (ámbito corregir_cierre, 0494); Central no se autoriza a sí misma.';
