-- 0482 · POSTVENTA CORRIGE LA RAZÓN SOCIAL Y EL RUC DEL CLIENTE SIN DUEÑO
-- (Rubí, 14-10, apertura del HOSPITAL CHANKA - GOBIERNOR REGIONAL ANDAHUAYLAS)
--
-- La ficha no tenía RUC ni la razón social como tal, y al corregirla salía
-- «Solo el dueño actual de la cartera puede corregir los datos del cliente».
-- Desde el 28-09 los clientes de postventa quedan SIN dueño de cartera
-- (cuentas.comercial_id null: postventa no tiene cartera propia), y la única
-- política de edición de `cuentas` es la del dueño (o backoffice). Postventa
-- solo podía leer. Regla de Santos: si un permiso depende de «ser el dueño»,
-- para postventa depende del área.
--
-- Esta función deja a postventa corregir SOLO la identidad (tipo y número de
-- documento, razón social y rubro) de un cliente SIN dueño. No da permiso de
-- editar nada más ni de tocar la cartera de un comercial: si el cliente tiene
-- dueño, lo corrige su comercial, como siempre. El RUC repetido lo sigue
-- frenando uq_cuentas_doc / trg_documento_unico igual que al comercial.

create or replace function public.postventa_corregir_identidad_cuenta(
  p_cuenta uuid,
  p_tipo_doc text,
  p_num_doc text,
  p_razon_social text,
  p_rubro_id integer default null,
  p_tocar_rubro boolean default false
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
         rubro_id = case when p_tocar_rubro then p_rubro_id else rubro_id end
   where id = p_cuenta and comercial_id is null;
  return found;
end $$;

revoke all on function public.postventa_corregir_identidad_cuenta(uuid, text, text, text, integer, boolean) from public, anon;
grant execute on function public.postventa_corregir_identidad_cuenta(uuid, text, text, text, integer, boolean) to authenticated;
