-- 0350 · «Terminé, pueden recogerlo»: quien tiene el file avisa a Central
--
-- Pedido del ing. Carlos (reunión 30-09 12:35, sobre el préstamo de files):
-- «Lo único que vamos a agregar es ese tema de solicitud de recojo… que me
-- lleve una notificación para ir a recoger el file… el botoncito donde dice
-- files, Terminé». Hasta hoy el circuito era pedido → Central entrega →
-- «Recibí el file» → Central marca «Devuelto», y en medio nadie sabía cuándo
-- ya se podía ir a recogerlo: el file se quedaba en un escritorio hasta que
-- Central preguntara. Ahora quien lo tiene aprieta «Terminé» y a Central le
-- llega el aviso «Recoger file · CLIENTE · de C5 Katerine».
--
-- Cada paso queda con su hora (entregado, recibido, terminé, devuelto) para
-- que «no haya manera de errores»: si Central tardó en recoger, se ve.
--
--   · termine_at        primera vez que avisó que terminó (no cambia después).
--   · termine_aviso_at  último aviso a Central: el primero o un «Recordar».
--   · termine_avisos    cuántas veces avisó (1 = solo el primero).
--
-- No se puede avisar más de una vez cada 30 minutos, para no llenarle la
-- campana a Central; pasado ese tiempo sí, como «Recordar a Central».

alter table public.prestamos_file
  add column if not exists termine_at timestamptz,
  add column if not exists termine_aviso_at timestamptz,
  add column if not exists termine_avisos smallint not null default 0;

-- Central ordena por estos: los listos para recoger van primero.
create index if not exists ix_prestamos_file_por_recoger on public.prestamos_file (termine_at)
  where termine_at is not null and devuelto_at is null and anulado_at is null;

-- p_todo_el_pedido: si del mismo pedido (grupo) tiene varios files en su
-- poder, los marca todos con UN solo aviso («Recoger 3 files · de …»).
-- Devuelve cuántos files quedaron marcados.
create or replace function public.files_termine(p_id uuid, p_todo_el_pedido boolean default false)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo perfiles%rowtype;
  v_p prestamos_file%rowtype;
  v_ids uuid[];
  v_ultimo timestamptz;
  v_es_recordatorio boolean;
  v_n integer;
  v_nombres text;
  v_titulo text;
begin
  select * into v_yo from perfiles where id = auth.uid() and activo;
  if v_yo.id is null then raise exception 'Sesión no válida'; end if;

  select * into v_p from prestamos_file where id = p_id for update;
  if v_p.id is null or v_p.solicitado_por <> v_yo.id then raise exception 'Ese file no está a su nombre'; end if;
  if v_p.anulado_at is not null then raise exception 'Ese pedido fue anulado'; end if;
  if v_p.devuelto_at is not null then raise exception 'Ese file ya volvió al archivador'; end if;
  if v_p.entregado_at is null then raise exception 'Central todavía no le entregó ese file'; end if;

  -- Los files que se marcan: este, o todos los del pedido que siguen en su poder.
  select array_agg(id order by cliente_texto) into v_ids
    from prestamos_file
   where solicitado_por = v_yo.id
     and entregado_at is not null and devuelto_at is null and anulado_at is null
     and (id = p_id or (p_todo_el_pedido and grupo = v_p.grupo));

  -- Para no llenarle la campana a Central: un aviso cada 30 minutos.
  select max(termine_aviso_at) into v_ultimo from prestamos_file where id = any (v_ids);
  if v_ultimo is not null and v_ultimo > now() - interval '30 minutes' then
    raise exception 'Ya le avisó a Central a las %. Podrá recordarle desde las %.',
      to_char(v_ultimo at time zone 'America/Lima', 'HH24:MI'),
      to_char((v_ultimo + interval '30 minutes') at time zone 'America/Lima', 'HH24:MI');
  end if;
  v_es_recordatorio := exists (select 1 from prestamos_file where id = any (v_ids) and termine_at is not null);

  -- Apretar «Terminé» prueba que lo tuvo en la mano: si no había firmado
  -- «Recibí el file», la firma queda con esta hora (como hace «Devuelto»).
  update prestamos_file
     set termine_at = coalesce(termine_at, now()),
         termine_aviso_at = now(),
         termine_avisos = termine_avisos + 1,
         recibido_at = coalesce(recibido_at, now())
   where id = any (v_ids);
  get diagnostics v_n = row_count;

  select string_agg(coalesce(cliente_texto, 'Cliente') ||
                    coalesce(' (' || case empresa when 'open' then 'OPEN' when 'efameinsa' then 'EFAMEINSA' when 'ambos' then 'OPEN y EFAMEINSA' end || ')', ''),
                    ' · ' order by cliente_texto)
    into v_nombres
    from prestamos_file where id = any (v_ids);

  v_titulo := case when v_es_recordatorio then 'Recordatorio · ' else '' end ||
              case when v_n = 1 then 'Recoger file · ' || left(v_nombres, 120)
                   else format('Recoger %s files', v_n) end ||
              ' · de ' || coalesce(v_yo.codigo_comercial || ' ', '') || v_yo.nombre;

  -- Le llega a Central, como el pedido (0334). Una cuenta de práctica no le
  -- avisa a Central real (0336), pero sí a la Central de práctica, para poder
  -- probar el circuito completo.
  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select id, 'file_recoger', v_titulo,
         case when v_n = 1 then 'Ya terminó con el file: puede pasar a recogerlo. Al tenerlo, márquelo «Devuelto».'
              else left(v_nombres, 300) || ' — ya terminó con ellos: puede pasar a recogerlos.' end,
         '/files'
    from perfiles
   where rol = 'central' and activo and coalesce(es_prueba, false) = coalesce(v_yo.es_prueba, false);

  return v_n;
end $$;

revoke all on function public.files_termine(uuid, boolean) from public, anon;
grant execute on function public.files_termine(uuid, boolean) to authenticated, service_role;
