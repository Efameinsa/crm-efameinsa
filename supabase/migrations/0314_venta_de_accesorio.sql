-- ============================================================
-- CRM EFAMEINSA · Migración 0314 · Venta de accesorio
-- ============================================================
-- Rubí, 26-09, en el pedido de Andinas Service Tours (un coche de transporte
-- de ropa): el circuito le pedía probado y embalado, plano, llamada de
-- preinstalación y puesta en marcha, y la apertura mostraba «plano pendiente»
-- y el aviso de preinstalación de provincia. Un coche no se conecta a agua,
-- gas ni energía: se entrega y se cierra. Propuso «accesorio» en «Qué se
-- vendió»; Santos: «implementa como creas conveniente».
--
-- Qué es un accesorio: lo que no se conecta. Hoy, los coches y carros de
-- lavandería (categoría «coche» del catálogo). Mesas de planchado, calderines
-- y mesas vaporizadoras se conectan y siguen siendo equipo.
--
-- 1. El tipo `accesorio` en servicios_postventa.tipo_pedido.
-- 2. El pedido nace accesorio cuando TODO lo vendido en el cierre es un coche o
--    un carro. Un coche junto a una lavadora sigue siendo equipo: la lavadora
--    necesita todo el recorrido.
-- 3. «Traer un pedido anterior» acepta accesorio (y embalaje, que desde la 0301
--    se ofrecía en pantalla pero la base rechazaba).
-- 4. Los tres pedidos abiertos que son solo coches pasan a accesorio.

alter table servicios_postventa drop constraint if exists servicios_postventa_tipo_pedido_check;
alter table servicios_postventa add constraint servicios_postventa_tipo_pedido_check
  check (tipo_pedido = any (array['equipo', 'repuesto', 'mantenimiento', 'revision', 'embalaje', 'accesorio']));

create or replace function public.tipo_pedido_del_informe(p_items jsonb)
returns text
language sql
immutable
as $function$
  with v as (
    select coalesce(x->>'tipo', 'equipo') as tipo, lower(coalesce(x->>'descripcion', '')) as d
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x
     where coalesce(x->>'bloque', 'venta') = 'venta'
  )
  select case
    when not exists (select 1 from v) then 'equipo'
    -- 0314: coches y carros de lavandería no se conectan: se entregan y se cierran.
    when bool_and(d ~ '^[[:space:]]*(coche|carro)[[:space:]]') then 'accesorio'
    when bool_and(tipo = 'repuesto') then 'repuesto'
    -- 0301: el embalaje (jaula, enjaulado) es un servicio que se cierra con fotos, no con informe.
    when bool_and(tipo = 'servicio') and bool_and(d ~ '(embala|jaula|enjaul)') then 'embalaje'
    when bool_and(tipo = 'servicio') and bool_or(d ~ 'revisi') and not bool_or(d ~ 'manteni') then 'revision'
    when bool_and(tipo = 'servicio') then 'mantenimiento'
    else 'equipo' end
  from v;
$function$;

-- 3. Traer un pedido anterior: acepta accesorio y embalaje. Se parcha la
--    definición viva solo en las líneas que cambian (regla de la casa: no
--    copiar funciones largas a mano).
do $$
declare
  d text := pg_get_functiondef('public.traer_pedido_antiguo'::regproc);
begin
  -- La definición viva se guardó con saltos de Windows: se normalizan antes
  -- de buscar las líneas (no cambia lo que hace la función).
  d := replace(d, chr(13) || chr(10), chr(10));
  d := replace(d,
    $q$if p_tipo not in ('equipo', 'repuesto', 'mantenimiento', 'revision') then
    raise exception 'Diga qué se vendió: equipo, repuesto, mantenimiento o revisión';$q$,
    $q$if p_tipo not in ('equipo', 'repuesto', 'mantenimiento', 'revision', 'embalaje', 'accesorio') then
    raise exception 'Diga qué se vendió: equipo, repuesto, accesorio, mantenimiento, revisión o embalaje';$q$);
  d := replace(d,
    $q$case p_tipo when 'equipo' then 'ENTREGA DE EQUIPO' when 'repuesto' then 'REPUESTO' when 'revision' then 'SERVICIO DE REVISIÓN' else 'MANTENIMIENTO' end$q$,
    $q$case p_tipo when 'equipo' then 'ENTREGA DE EQUIPO' when 'repuesto' then 'REPUESTO' when 'accesorio' then 'ACCESORIO' when 'embalaje' then 'EMBALAJE' when 'revision' then 'SERVICIO DE REVISIÓN' else 'MANTENIMIENTO' end$q$);
  d := replace(d,
    $q$case when p_tipo = 'repuesto' then p_entrega_en else null end,
    case when p_tipo = 'repuesto' then p_con_instalacion else null end,$q$,
    $q$case when p_tipo in ('repuesto', 'accesorio') then p_entrega_en else null end,
    case when p_tipo = 'repuesto' then p_con_instalacion when p_tipo = 'accesorio' then false else null end,$q$);
  if position($q$'revision', 'embalaje', 'accesorio')$q$ in d) = 0
     or position($q$when 'accesorio' then 'ACCESORIO'$q$ in d) = 0
     or position($q$p_tipo in ('repuesto', 'accesorio') then p_entrega_en$q$ in d) = 0 then
    raise exception 'No se pudo parchar traer_pedido_antiguo: cambió su definición';
  end if;
  execute d;
end $$;

-- 4. Los pedidos abiertos que son solo un coche o un carro.
update servicios_postventa
   set tipo_pedido = 'accesorio', con_instalacion = false
 where id in ('0e2ec12d-dc7f-49a1-84ec-9b095014406e',   -- Antapaccay, coche HM-402
              'be324a2b-f16e-40d5-80c7-fed1e38d6a25',   -- Grupo Alimenticio San José, carro HM-408
              '9c53679b-5463-412f-bdc4-9806fc11ac5d')   -- Andinas Service Tours, coche HM-408
   and coalesce(tipo_pedido, 'equipo') = 'equipo'
   and cerrado_at is null;
