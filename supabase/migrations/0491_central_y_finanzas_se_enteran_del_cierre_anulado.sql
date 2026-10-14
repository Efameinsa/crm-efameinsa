-- 0491 — CENTRAL Y FINANZAS SE ENTERAN CUANDO SE ANULA UN CIERRE
--
-- Central, 14-10 (buzón ca4cc11b): «se estaba realizando el pedido de
-- AGROCASAGRANDE, el CRM se actualizó y se borró el cierre de hoy». No se
-- borró: Ariana anuló su cierre EFAMEINSA 010-2026 (servicio de puesta en
-- marcha, USD 531, pedido PED-0028-2026) a las 17:47 con el código de admin,
-- como permite desde hoy 0490 («quien lo emitió lo anula, con código»). Pero
-- anular_cierre solo avisaba a quien lo había emitido, porque hasta 0490 el
-- que anulaba era Central. Ahora que lo anula también quien lo emitió,
-- operaciones o gerencia, Central veía «desaparecer» el cierre de su lista
-- (pasa a «Anulados») sin saber por qué, y Finanzas seguía con la urgencia
-- de liquidar un pedido que ya no existía.
--
-- Va como disparador, no dentro de anular_cierre, para no pisar esa función:
-- vale para cualquier camino que anule un cierre.
--   · Central: si no fue Central quien lo anuló.
--   · Finanzas: si el cierre ya tenía pedido generado (Central se lo pasó).
-- El aviso dice quién lo anuló, el motivo y qué pasó con el pedido.
-- Un cierre de práctica no avisa a nadie real (como 0339).

create or replace function public.avisar_cierre_anulado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_rol text;
  v_quien text;
  v_pedido text;
  v_titulo text;
  v_cuerpo text;
begin
  if coalesce(new.es_prueba, false) then return new; end if;

  select rol::text, coalesce(codigo_comercial || ' · ', '') || nombre
    into v_rol, v_quien
    from perfiles where id = new.anulado_por;

  select string_agg(coalesce(sp.numero_pedido_erp, 'sin número'), ', ')
    into v_pedido
    from servicios_postventa sp
   where sp.informe_cierre_id = new.id and sp.pedido_generado_at is not null;

  v_titulo := format('Cierre %s anulado · %s', coalesce(new.codigo, ''),
                     left(coalesce(new.cliente_nombre, 'Cliente'), 80));
  v_cuerpo := format('Lo anuló %s. Motivo: %s.%s No se borró: queda en «Anulados». Si la venta sigue en pie, se emite un cierre nuevo.',
                     coalesce(v_quien, 'alguien sin nombre'),
                     coalesce(nullif(btrim(new.anulado_motivo), ''), 'sin motivo'),
                     case when v_pedido is not null
                          then format(' Su pedido %s quedó cerrado.', v_pedido) else '' end);

  -- Solo personas reales: ni las cuentas de práctica ni las «Propuesta ·»
  -- (tienen rol finanzas y se llevarían una docena de avisos), como 0351.
  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select p.id, 'cierre_anulado', v_titulo, v_cuerpo, '/central/cierres'
    from perfiles p
   where v_rol is distinct from 'central'
     and p.rol = 'central'::rol_usuario
     and p.activo and not coalesce(p.es_prueba, false)
     and p.nombre not like 'Propuesta ·%'
  union all
  select p.id, 'cierre_anulado', v_titulo, v_cuerpo || ' Ya no hay que liquidarlo.', '/finanzas/liquidar'
    from perfiles p
   where v_pedido is not null
     and p.rol = 'finanzas'::rol_usuario
     and p.activo and not coalesce(p.es_prueba, false)
     and p.nombre not like 'Propuesta ·%';

  return new;
end $$;

drop trigger if exists central_y_finanzas_se_enteran_del_cierre_anulado on public.informes_cierre;
create trigger central_y_finanzas_se_enteran_del_cierre_anulado
  after update of anulado_at on public.informes_cierre
  for each row
  when (old.anulado_at is null and new.anulado_at is not null)
  execute function public.avisar_cierre_anulado();

insert into _migraciones_aplicadas (archivo) values ('0491_central_y_finanzas_se_enteran_del_cierre_anulado.sql')
on conflict do nothing;
