-- ============================================================
-- CRM EFAMEINSA · Migración 0562 · La dirección de la EMPRESA se corrige
-- ============================================================
-- Santos, 20-10-2026: «Brenda quiere editar una dirección de una empresa y no
-- puede». Caso: FAMILY FARMS PERÚ S.R.L. (C5). Brenda ya había corregido la
-- dirección del contacto (Magdalena del Mar), pero la cabecera de la ficha
-- muestra `cuentas.direccion` («CAR. PANAMERICANA SUR KM 245… HUMAY»), que
-- no se podía editar en ninguna pantalla: el 26-08 se decidió que la dirección
-- vive por contacto y la de la cuenta quedó como dato importado. Sigue siendo
-- lo que se lee en la cabecera, lo que la apertura sugiere y lo que la
-- cotización imprime si el contacto principal no tiene dirección.
--
-- Las dos funciones de corrección reciben la dirección (opcional: la pantalla
-- vieja que no la manda no la toca). El dueño y backoffice la guardan con el
-- update normal (cuentas_comercial / cuentas_backoffice).
-- ============================================================

drop function if exists public.corregir_identidad_cuenta_global(uuid, text, text, text, integer, boolean);
create or replace function public.corregir_identidad_cuenta_global(
  p_cuenta uuid,
  p_tipo_doc text,
  p_num_doc text,
  p_razon_social text,
  p_rubro_id integer default null,
  p_tocar_rubro boolean default false,
  p_direccion text default null,
  p_tocar_direccion boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(edita_clientes_global(), false) then
    return false;
  end if;
  if btrim(coalesce(p_razon_social, '')) = '' then
    raise exception 'La razón social no puede ir vacía';
  end if;
  update cuentas
     set tipo_doc = p_tipo_doc::tipo_documento,
         num_doc = nullif(btrim(coalesce(p_num_doc, '')), ''),
         razon_social = btrim(p_razon_social),
         rubro_id = case when p_tocar_rubro then p_rubro_id else rubro_id end,
         direccion = case when p_tocar_direccion then nullif(btrim(coalesce(p_direccion, '')), '') else direccion end
   where id = p_cuenta;
  return found;
end $$;
revoke all on function public.corregir_identidad_cuenta_global(uuid, text, text, text, integer, boolean, text, boolean) from public, anon;
grant execute on function public.corregir_identidad_cuenta_global(uuid, text, text, text, integer, boolean, text, boolean) to authenticated;

drop function if exists public.postventa_corregir_identidad_cuenta(uuid, text, text, text, integer, boolean);
create or replace function public.postventa_corregir_identidad_cuenta(
  p_cuenta uuid,
  p_tipo_doc text,
  p_num_doc text,
  p_razon_social text,
  p_rubro_id integer default null,
  p_tocar_rubro boolean default false,
  p_direccion text default null,
  p_tocar_direccion boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dueno uuid;
begin
  if not coalesce(es_postventa(), false) then
    return false;
  end if;
  select comercial_id into v_dueno from cuentas where id = p_cuenta;
  if not found or v_dueno is not null then
    return false;
  end if;
  if btrim(coalesce(p_razon_social, '')) = '' then
    raise exception 'La razón social no puede ir vacía';
  end if;
  update cuentas
     set tipo_doc = p_tipo_doc::tipo_documento,
         num_doc = nullif(btrim(coalesce(p_num_doc, '')), ''),
         razon_social = btrim(p_razon_social),
         rubro_id = case when p_tocar_rubro then p_rubro_id else rubro_id end,
         direccion = case when p_tocar_direccion then nullif(btrim(coalesce(p_direccion, '')), '') else direccion end
   where id = p_cuenta and comercial_id is null;
  return found;
end $$;
revoke all on function public.postventa_corregir_identidad_cuenta(uuid, text, text, text, integer, boolean, text, boolean) from public, anon;
grant execute on function public.postventa_corregir_identidad_cuenta(uuid, text, text, text, integer, boolean, text, boolean) to authenticated;
notify pgrst, 'reload schema';
