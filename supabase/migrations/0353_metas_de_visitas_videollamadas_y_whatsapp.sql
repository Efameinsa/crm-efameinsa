-- 0353 · Metas de visitas, videollamadas y WhatsApp de campaña, editables por
-- gerencia y con registro de quién cambió qué (30-09-2026).
--
-- Ing. Carlos, reunión 30-09 12:35: «Dentro de todo lo que siempre medimos en
-- la parte comercial son las visitas… Visitas y videollamadas… ¿Cuántas vas?
-- No lo sé. Esos dos puntos tienen que estar en su reporte diario, reporte
-- semanal, reporte mensual, todo». Y del WhatsApp de campaña: «La idea es
-- independizar… WhatsApp es una corrida. El otro es tu gestión».
--
-- El cálculo vive en TypeScript (src/lib/indicadores-comerciales.ts): acá solo
-- se guardan las metas, porque tienen que poder cambiarse sin desplegar.
--
-- 1. Las metas, en `parametros` (la misma tabla de la meta de seguimientos y
--    el tipo de cambio). Valores de la propuesta a gerencia:
--      · meta_visitas_semana = 2       (visita al cliente + visita a planta)
--      · meta_videollamadas_semana = 5
--      · meta_wa_tipificados_pct = 100 (chats de anuncio calificados el mismo día)
--      · meta_wa_respuesta_min = 15    (mediana de 1.ª respuesta, minutos de oficina)
--      · metas_visitas_desde = 20261012 (AAAAMMDD: `valor` es numérico). Hasta
--        esa fecha visitas y videollamadas se miden pero no se pintan en rojo
--        ni ámbar: no hay línea base (5 visitas en 5 semanas en todo el equipo).
--    NO se toca `perfiles.meta_gestiones_diarias` de nadie: esa la decide el
--    ing. Carlos (propuesta: 25; C2 20; C9 15) y se cambia desde la pantalla
--    nueva, con registro.
--
-- 2. `metas_historial`: una fila por cada cambio (qué, de quién, de cuánto a
--    cuánto, quién y cuándo). La única puerta de escritura es `guardar_meta`,
--    que solo abre a gerencia y admin. Ya existía la política
--    `parametros_write` para backoffice (tipo de cambio); esta función no la
--    reemplaza, la acompaña con el registro.

insert into parametros (clave, valor, descripcion) values
  ('meta_visitas_semana', 2, 'Visitas por comercial por semana: al cliente (gestión «Visita») o del cliente a la planta (visita a planta cerrada / «Showroom»). 0353.'),
  ('meta_videollamadas_semana', 5, 'Videollamadas por comercial por semana (gestión «Videollamada», antes «Reunión online»). 0353.'),
  ('meta_wa_tipificados_pct', 100, 'Porcentaje de chats de anuncio que el comercial debe calificar el mismo día en que llegan. 0353.'),
  ('meta_wa_respuesta_min', 15, 'Mediana de minutos de oficina (L-V 08:30-18:00, S 08:30-13:00) hasta la primera respuesta de una persona en un chat de anuncio. 0353.'),
  ('metas_visitas_desde', 20261012, 'Desde qué fecha (AAAAMMDD) visitas y videollamadas se juzgan con color; antes, «En medición». 0353.')
on conflict (clave) do nothing;

create table if not exists public.metas_historial (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  comercial_id uuid references public.perfiles(id),
  valor_anterior numeric,
  valor_nuevo numeric,
  cambiado_por uuid not null references public.perfiles(id),
  cambiado_at timestamptz not null default now()
);

comment on table public.metas_historial is 'Quién cambió qué meta, de cuánto a cuánto y cuándo (0353). Se escribe solo por guardar_meta().';

create index if not exists ix_metas_historial_fecha on public.metas_historial (cambiado_at desc);

alter table public.metas_historial enable row level security;

drop policy if exists metas_historial_lectura on public.metas_historial;
create policy metas_historial_lectura on public.metas_historial
  for select to authenticated
  using ((select es_backoffice()));

-- La puerta de escritura. p_comercial nulo = meta del equipo (parametros);
-- con p_comercial = la meta de gestiones diarias de esa persona.
create or replace function public.guardar_meta(p_clave text, p_valor numeric, p_comercial uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quien uuid := auth.uid();
  v_antes numeric;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if not coalesce(es_backoffice(), false) then
    raise exception 'Las metas las cambia gerencia';
  end if;
  if p_valor is null then raise exception 'Falta el valor'; end if;

  if p_comercial is not null then
    if p_clave <> 'meta_gestiones_diarias' then raise exception 'Esa meta no es por comercial'; end if;
    if p_valor < 1 or p_valor > 200 or p_valor <> trunc(p_valor) then
      raise exception 'La meta de gestiones va de 1 a 200 al día';
    end if;
    select meta_gestiones_diarias into v_antes from perfiles where id = p_comercial and rol = 'comercial';
    if not found then raise exception 'Ese comercial no existe'; end if;
    if v_antes is not distinct from p_valor then return; end if;
    update perfiles set meta_gestiones_diarias = p_valor::integer where id = p_comercial;
  else
    if p_clave = 'meta_visitas_semana' or p_clave = 'meta_videollamadas_semana' then
      if p_valor < 0 or p_valor > 50 or p_valor <> trunc(p_valor) then raise exception 'Esa meta va de 0 a 50 por semana'; end if;
    elsif p_clave = 'meta_wa_tipificados_pct' then
      if p_valor < 1 or p_valor > 100 then raise exception 'El porcentaje va de 1 a 100'; end if;
    elsif p_clave = 'meta_wa_respuesta_min' then
      if p_valor < 1 or p_valor > 600 then raise exception 'Los minutos van de 1 a 600'; end if;
    elsif p_clave = 'metas_visitas_desde' then
      if p_valor < 20260101 or p_valor > 20301231 or p_valor <> trunc(p_valor)
         or to_char(to_date(p_valor::bigint::text, 'YYYYMMDD'), 'YYYYMMDD') <> p_valor::bigint::text then
        raise exception 'La fecha no es válida';
      end if;
    elsif p_clave = 'meta_seguimientos_diarios' then
      if p_valor < 1 or p_valor > 200 or p_valor <> trunc(p_valor) then raise exception 'La meta de gestiones va de 1 a 200 al día'; end if;
    else
      raise exception 'Esa meta no se edita desde acá';
    end if;
    select valor into v_antes from parametros where clave = p_clave;
    if v_antes is not distinct from p_valor then return; end if;
    insert into parametros (clave, valor, updated_at, updated_by)
    values (p_clave, p_valor, now(), v_quien)
    on conflict (clave) do update set valor = excluded.valor, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  end if;

  insert into metas_historial (clave, comercial_id, valor_anterior, valor_nuevo, cambiado_por)
  values (p_clave, p_comercial, v_antes, p_valor, v_quien);
end $$;

revoke all on function public.guardar_meta(text, numeric, uuid) from public, anon;
grant execute on function public.guardar_meta(text, numeric, uuid) to authenticated, service_role;
revoke all on public.metas_historial from anon;
grant select on public.metas_historial to authenticated;
grant all on public.metas_historial to service_role;

-- Piloto local (29-09): la tabla se copia entre la PC y la nube como las demás.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.metas_historial';
    execute 'create trigger zz_sync after insert or update or delete on public.metas_historial for each row execute function sync.capturar(''id'')';
  end if;
end $$;
