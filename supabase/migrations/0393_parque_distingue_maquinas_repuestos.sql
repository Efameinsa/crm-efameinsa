-- ============================================================
-- CRM EFAMEINSA · Migración 0393 · Las ventas del parque dicen qué se vendió:
-- máquina, repuesto o mantenimiento
-- ============================================================
-- Gabriela (PV2), 05-10-2026, en «Las ventas de la empresa»: «colocar un
-- ítem donde pueda discriminar máquinas de repuestos». La venta ya lo sabe
-- por su oportunidad: sin `tipo_postventa` es una máquina (la vendió un
-- comercial); con él, `repuesto` o `mantenimiento`. Se agregan dos conteos
-- al final; el resto de la función no cambia (de_comercial = máquinas).
-- Cambia el tipo de retorno, así que se borra y se vuelve a crear.
-- ============================================================

drop function if exists public.ventas_para_el_parque(uuid);

create function public.ventas_para_el_parque(p_comercial uuid default null::uuid)
returns table(cuenta_id uuid, razon_social text, num_doc text, zona text, comercial_codigo text, comercial_nombre text,
              ultima_venta date, ventas integer, de_postventa integer, de_comercial integer, equipos text[], no_contactar boolean,
              de_repuesto integer, de_mantenimiento integer)
language sql
stable security definer
set search_path to 'public'
as $function$
  select o.cuenta_id,
         max(c.razon_social),
         max(c.num_doc),
         coalesce(max(c.distrito), max(c.provincia)),
         max(p.codigo_comercial),
         max(p.nombre),
         max(v.fecha_venta)::date,
         count(*)::integer,
         count(*) filter (where o.tipo_postventa is not null)::integer,
         count(*) filter (where o.tipo_postventa is null)::integer,
         (array_agg(distinct nullif(btrim(v.equipo_historico), '')))[1:4],
         bool_or(c.no_contactar_at is not null),
         count(*) filter (where o.tipo_postventa = 'repuesto')::integer,
         count(*) filter (where o.tipo_postventa = 'mantenimiento')::integer
    from ventas v
    join oportunidades o on o.id = v.oportunidad_id
    join cuentas c on c.id = o.cuenta_id
    left join perfiles p on p.id = c.comercial_id
   where v.anulada_at is null
     and o.cuenta_id is not null
     and (
       (select es_backoffice()) or (select puede_postventa())
       or c.comercial_id = (select auth.uid())
     )
     and (p_comercial is null or c.comercial_id = p_comercial)
   group by o.cuenta_id
$function$;

revoke all on function public.ventas_para_el_parque(uuid) from public, anon;
grant execute on function public.ventas_para_el_parque(uuid) to authenticated, service_role;
