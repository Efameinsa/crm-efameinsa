-- 0510 — LOS ACCESORIOS EN LA GENERACIÓN DE CÓDIGO
--
-- Lesly, 16-10 (buzón, pedido PRODECO DEL SUR con calandria, lavadora y
-- secadora industriales): «en la generación de código la Central debería
-- tener una regla de indicar si los equipos incluyen algún accesorio, y más
-- si son industriales como las lavadoras».
--
-- Central lo dice al pedirle el código al almacén: «no incluye accesorios» o
-- «sí incluye: …» con lo que va. Es del pedido entero (antes de pedir no
-- hay filas por máquina); Central escribe a qué máquina va cada uno. El
-- almacén lo ve en el pedido y en la hoja de la solicitud.

alter table public.servicios_postventa
  add column if not exists accesorios_incluye boolean,
  add column if not exists accesorios_detalle text,
  add column if not exists accesorios_at timestamptz,
  add column if not exists accesorios_por uuid references public.perfiles(id);

comment on column public.servicios_postventa.accesorios_incluye is
  'Central dice al pedir el código si los equipos van con accesorios (0510): true = sí (ver accesorios_detalle), false = no incluye, null = no lo indicó.';

create or replace function public.indicar_accesorios_del_pedido(p_servicio uuid, p_incluye boolean, p_detalle text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_d text := nullif(btrim(coalesce(p_detalle, '')), '');
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if rol_actual() not in ('central', 'gerencia', 'admin', 'operaciones') then
    raise exception 'Los accesorios del pedido los indica Central';
  end if;
  if p_incluye is null then raise exception 'Diga si los equipos incluyen accesorios o no'; end if;
  if p_incluye and (v_d is null or length(v_d) < 3) then
    raise exception 'Escriba qué accesorios van y con qué máquina';
  end if;
  update servicios_postventa
     set accesorios_incluye = p_incluye,
         accesorios_detalle = case when p_incluye then v_d else null end,
         accesorios_at = now(),
         accesorios_por = auth.uid(),
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

revoke all on function public.indicar_accesorios_del_pedido(uuid, boolean, text) from public;
grant execute on function public.indicar_accesorios_del_pedido(uuid, boolean, text) to authenticated;
