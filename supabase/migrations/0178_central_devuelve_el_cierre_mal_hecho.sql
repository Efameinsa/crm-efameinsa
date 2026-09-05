-- ============================================================
-- CRM EFAMEINSA · Migración 0178 · Central devuelve el cierre mal hecho
-- ============================================================
-- Reunión del 05-09 (11:29). Una comercial emitió su cierre y le adjuntó un
-- voucher que no tenía nada que ver. Central lo vio y lo derivó igual, y
-- Carlos paró ahí:
--
--   «¿Qué has hecho con ese registro que lo ha ingresado de manera incorrecta?
--    ¿Pero para qué, si está mal? Tendrías que rechazarlo y que lo haga bien.
--    (…) Estás juntando un documento que no tiene nada que ver. Vamos a
--    deformar el CRM; el CRM es sensible, hay que tratarlo con cariño si no se
--    nos complica en los números.»
--
-- QUÉ NO SE HACE, Y POR QUÉ. Devolver NO es anular. El cierre ya salió con su
-- número y ese número no se toca: la regla de la casa es anular, no borrar, y
-- un correlativo emitido no vuelve atrás. Devolver es otra cosa: sacarlo de la
-- cola de Central y ponérselo al comercial delante, con el motivo escrito,
-- hasta que lo arregle. Para corregir el contenido ya existe el camino de la
-- 0154 (código de autorización y ventana de corrección); esto solo dice QUIÉN
-- lo tiene que hacer y POR QUÉ.
--
-- QUEDA EL RASTRO DE CADA VUELTA. Una tabla y no un par de columnas: si un
-- cierre se devuelve tres veces, las tres quedan, con su motivo y su fecha.
-- Es exactamente lo que gerencia va a querer mirar cuando pregunte por qué un
-- pedido salió tarde.
-- ============================================================

create table if not exists public.devoluciones_cierre (
  id             uuid primary key default gen_random_uuid(),
  informe_id     uuid not null references informes_cierre (id) on delete cascade,
  motivo         text not null,
  devuelto_por   uuid not null references perfiles (id),
  devuelto_at    timestamptz not null default now(),
  -- Cuando el comercial dice «ya lo corregí» y vuelve a la cola de Central.
  resuelto_at    timestamptz,
  resuelto_por   uuid references perfiles (id),
  resuelto_nota  text,
  es_prueba      boolean not null default es_cuenta_prueba(),
  constraint motivo_con_contenido check (length(btrim(motivo)) >= 15)
);

comment on table public.devoluciones_cierre is
  'Cada vez que Central devuelve un cierre al comercial por estar mal hecho, con el motivo. No anula el cierre ni toca su número: solo lo saca de la cola hasta que se arregle (Carlos, 05-09).';

create index if not exists devoluciones_abiertas_idx
  on public.devoluciones_cierre (informe_id) where resuelto_at is null;

alter table public.devoluciones_cierre enable row level security;

-- La ve Central, gerencia, operaciones y el comercial dueño del cierre.
drop policy if exists devoluciones_lectura on public.devoluciones_cierre;
create policy devoluciones_lectura on public.devoluciones_cierre
  for select to authenticated
  using (
    (es_backoffice() or es_operaciones() or rol_actual() = 'central'::rol_usuario
     or exists (select 1 from informes_cierre i where i.id = informe_id and i.creado_por = (select auth.uid())))
    and es_prueba = es_cuenta_prueba()
  );


-- ------------------------------------------------------------
-- Central devuelve
-- ------------------------------------------------------------
create or replace function public.devolver_cierre(p_informe uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inf    informes_cierre%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_id     uuid;
begin
  if not (es_backoffice() or es_operaciones() or rol_actual() = 'central'::rol_usuario) then
    raise exception 'Solo Central, operaciones o gerencia devuelven un cierre';
  end if;
  if length(v_motivo) < 15 then
    raise exception 'Escriba qué está mal. El comercial solo va a leer eso para corregirlo';
  end if;

  select * into v_inf from informes_cierre where id = p_informe;
  if not found then raise exception 'Ese cierre ya no está'; end if;
  if v_inf.emitido_at is null then
    raise exception 'Ese cierre todavía es un borrador: no hay nada que devolver';
  end if;
  if v_inf.anulado_at is not null then
    raise exception 'Ese cierre está anulado. Devolver no aplica';
  end if;
  if exists (select 1 from devoluciones_cierre d where d.informe_id = p_informe and d.resuelto_at is null) then
    raise exception 'Ese cierre ya está devuelto y esperando corrección';
  end if;

  insert into devoluciones_cierre (informe_id, motivo, devuelto_por)
  values (p_informe, v_motivo, auth.uid())
  returning id into v_id;

  return jsonb_build_object('devolucion', v_id, 'codigo', v_inf.codigo, 'comercial', v_inf.creado_por);
end $function$;

comment on function public.devolver_cierre(uuid, text) is
  'Central devuelve al comercial un cierre mal hecho, con el motivo. No lo anula ni le quita el número (Carlos, 05-09).';


-- ------------------------------------------------------------
-- El comercial lo corrige y lo vuelve a mandar
-- ------------------------------------------------------------
create or replace function public.reenviar_cierre_devuelto(p_informe uuid, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inf informes_cierre%rowtype;
  v_dev devoluciones_cierre%rowtype;
begin
  select * into v_inf from informes_cierre where id = p_informe;
  if not found then raise exception 'Ese cierre ya no está'; end if;

  -- Lo reenvía quien lo hizo. Gerencia y operaciones también, para destrabar.
  if not (es_backoffice() or es_operaciones() or v_inf.creado_por = auth.uid()) then
    raise exception 'Este cierre no es suyo';
  end if;

  select * into v_dev from devoluciones_cierre
   where informe_id = p_informe and resuelto_at is null
   order by devuelto_at desc limit 1;
  if v_dev.id is null then
    raise exception 'Ese cierre no está devuelto';
  end if;

  update devoluciones_cierre
     set resuelto_at = now(), resuelto_por = auth.uid(), resuelto_nota = nullif(btrim(coalesce(p_nota, '')), '')
   where id = v_dev.id;

  return jsonb_build_object('codigo', v_inf.codigo, 'motivo', v_dev.motivo);
end $function$;

comment on function public.reenviar_cierre_devuelto(uuid, text) is
  'El comercial declara corregido un cierre que Central le devolvió, y vuelve a la cola de Central (0178).';
