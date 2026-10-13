-- 0453 · LA APERTURA DE SERVICIO DESDE UN CASO LLEVA LOS EQUIPOS DEL CLIENTE
-- (Santos, 13-10, con AGROCASAGRANDE: «en la apertura no jala dos equipos, solo
-- jala una serie; debe permitir seleccionar los equipos del cliente»).
--
-- `apertura_desde_caso` (0407…0441) arma el pedido de servicio con UN texto de
-- equipo: el que se anotó en el caso. Un cliente con dos secadoras recibía la
-- visita de una sola en la hoja. Ahora postventa marca en el formulario los
-- equipos de la ficha que atiende el técnico, y esta función los pone como
-- filas del pedido —una por equipo, con su serie— igual que un pedido que viene
-- de un cierre: la hoja los agrupa («CANTIDAD: 2 … Series: A · B»).
--
-- Solo sobre el pedido recién emitido desde un caso, por quien lo emitió, sin
-- filas todavía, y con equipos de la MISMA ficha.

create or replace function public.apertura_equipos_del_caso(p_servicio uuid, p_equipos uuid[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s servicios_postventa%rowtype;
  v_n int := 0;
  v_e record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'Los equipos de la apertura los elige postventa';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if v_s.origen <> 'caso' then raise exception 'Solo la apertura que sale de un caso elige los equipos así'; end if;
  if v_s.apertura_despacho_por is distinct from auth.uid() and not coalesce(es_backoffice(), false) then
    raise exception 'Los equipos los pone quien emitió la apertura';
  end if;
  if exists (select 1 from pedido_equipos where servicio_id = p_servicio) then
    raise exception 'Esta apertura ya tiene sus equipos';
  end if;
  if coalesce(array_length(p_equipos, 1), 0) = 0 then return 0; end if;

  for v_e in
    select e.id, upper(btrim(e.serie)) as serie,
           -- La serie va en su línea: sin ella en la descripción, dos máquinas
           -- iguales se agrupan en una sola línea con sus dos series.
           coalesce(nullif(btrim(regexp_replace(regexp_replace(coalesce(e.modelo_texto, ''), '\s*/?\s*Serie:\s*[^/]*', '', 'gi'), '\s*/\s*$', '')), ''), 'EQUIPO') as descripcion
      from equipos_instalados e
     where e.id = any (p_equipos)
       and e.cuenta_id = v_s.cuenta_id
     order by e.modelo_texto, e.serie
  loop
    v_n := v_n + 1;
    insert into pedido_equipos (servicio_id, orden, descripcion, serie, equipo_id, es_prueba)
    values (p_servicio, v_n, v_e.descripcion, nullif(v_e.serie, ''), v_e.id, v_s.es_prueba);
  end loop;

  if v_n = 0 then raise exception 'Esos equipos no son de la ficha de este cliente'; end if;

  update servicios_postventa
     set equipo = (select string_agg(distinct descripcion, E'\n') from pedido_equipos where servicio_id = p_servicio),
         updated_at = now()
   where id = p_servicio;
  return v_n;
end $$;

revoke all on function public.apertura_equipos_del_caso(uuid, uuid[]) from public, anon;
grant execute on function public.apertura_equipos_del_caso(uuid, uuid[]) to authenticated;

comment on function public.apertura_equipos_del_caso(uuid, uuid[]) is
  '0453: los equipos de la ficha que lleva la apertura de servicio emitida desde un caso, una fila por equipo con su serie (Santos 13-10, AGROCASAGRANDE).';
