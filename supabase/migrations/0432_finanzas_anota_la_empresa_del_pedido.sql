-- 0432 · Finanzas anota de qué empresa es un pedido que no tiene cierre.
-- Buzón, Jhon (Finanzas) 10-10: «en la pantalla de detalle, que aparezca de
-- qué empresa es la operación (OPEN o EFAMEINSA) para hacer la búsqueda
-- directamente en la carpeta de la empresa y banco».
--
-- Con cierre manda informes_cierre.serie; sin cierre, la empresa elegida en
-- la apertura (servicios_postventa.apertura_empresa, 0421). Los pedidos que
-- vienen del Excel de postventa no tienen ninguna de las dos: Finanzas, que
-- ve en qué banco entró el abono, la deja anotada en la misma columna (así la
-- apertura sale con esa empresa). Nunca pisa la serie de un cierre.

create or replace function public.finanzas_anotar_empresa(p_servicio uuid, p_empresa text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(es_finanzas(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La empresa del pedido la anota Finanzas';
  end if;
  if p_empresa is null or p_empresa not in ('EFAMEINSA', 'OPEN') then
    raise exception 'Elija Efameinsa u Open Investments';
  end if;
  if exists (select 1 from servicios_postventa where id = p_servicio and informe_cierre_id is not null) then
    raise exception 'Este pedido tiene cierre: la empresa es la de la serie del cierre';
  end if;
  update servicios_postventa
     set apertura_empresa = p_empresa, updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

revoke all on function public.finanzas_anotar_empresa(uuid, text) from public;
grant execute on function public.finanzas_anotar_empresa(uuid, text) to authenticated;
