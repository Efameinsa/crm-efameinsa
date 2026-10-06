-- 0406 · La apertura corregida vuelve a Finanzas. Reunión de gerencia 06-10
-- 11:01: «¿qué pasa si me equivoco en la apertura y la quiero corregir?… hasta
-- la dirección errada puede poner… y es necesario siempre que le apruebe otra
-- vez». Si postventa cambia lo que va impreso en la apertura (dirección, quien
-- recibe, fecha, guía pedida) y el pedido todavía no salió, la autorización de
-- la guía que dio Finanzas queda sin efecto: Finanzas la vuelve a revisar y el
-- almacén no emite la guía con los datos viejos. El comprobante que había
-- puesto Finanzas se conserva como referencia para la nueva autorización.

create or replace function public.apertura_corregida(p_servicio uuid, p_que text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s servicios_postventa%rowtype;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'Solo postventa corrige la apertura';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio for update;
  if v_s.id is null or v_s.apertura_despacho_at is null or v_s.despachado_at is not null then
    return false;
  end if;
  update servicios_postventa
     set observaciones = concat_ws(E'\n', observaciones,
           format('Apertura corregida el %s (%s)%s.',
                  to_char(now() at time zone 'America/Lima', 'DD/MM HH24:MI'), btrim(coalesce(p_que, 'datos')),
                  case when v_s.guia_confirmada_at is not null then ': la autorización de la guía de Finanzas queda sin efecto hasta que la vuelva a dar' else '' end)),
         guia_confirmada_at = null,
         guia_confirmada_por = null,
         updated_at = now()
   where id = p_servicio;
  return v_s.guia_confirmada_at is not null;
end $$;

grant execute on function public.apertura_corregida(uuid, text) to authenticated;
