-- EL COMERCIAL VINCULA OTRA RAZÓN SOCIAL DEL MISMO CLIENTE (reunión 28-09
-- 14:18, con KARINA SAAVEDRA HOSPEDAJE y AMAZONAS GRANDEZ INVERSIONES).
--
-- «La cliente está asociada con nuestras dos razones sociales… hay bastantes
-- casos de esa naturaleza, que el cliente tiene varias razones sociales… pero
-- eso, que lo permita hacer el comercial». Hasta hoy el grupo económico
-- (cuenta_padre_id, 0052) solo se armaba por script: el 23-09 la ficha de
-- Karina Saavedra se creó a mano para que Katerine pudiera cotizarle.
--
-- La función: con el RUC (o DNI) y la razón social de la otra empresa,
--   · si ya hay una ficha con ese documento, la cuelga del grupo del cliente;
--   · si no la hay, la crea en la misma cartera y colgada del grupo.
-- No toma clientes de otro comercial (eso lo decide gerencia), no mueve una
-- ficha que ya está en otro grupo y no fusiona nada: son contribuyentes
-- distintos y cada cotización sale a nombre de uno.

create or replace function vincular_otra_razon_social(p_cuenta uuid, p_num_doc text, p_razon_social text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_madre cuentas%rowtype;
  v_raiz uuid;
  v_doc text := regexp_replace(coalesce(p_num_doc, ''), '[^0-9]', '', 'g');
  v_razon text := upper(btrim(coalesce(p_razon_social, '')));
  v_otra cuentas%rowtype;
  v_id uuid;
begin
  select * into v_madre from cuentas where id = p_cuenta;
  if v_madre.id is null then raise exception 'Ese cliente no existe'; end if;
  v_raiz := coalesce(v_madre.cuenta_padre_id, v_madre.id);
  select * into v_madre from cuentas where id = v_raiz;

  if not (v_madre.comercial_id = auth.uid()
          or coalesce(es_backoffice(), false)
          or coalesce(rol_actual() = 'central', false)) then
    raise exception 'Esto lo hace el comercial dueño del cliente, Central o gerencia';
  end if;
  if length(v_doc) not in (8, 11) then
    raise exception 'Escriba el RUC (11 dígitos) o el DNI (8) de la otra empresa';
  end if;

  select * into v_otra from cuentas where num_doc = v_doc and fusionada_en is null order by created_at limit 1;
  if v_otra.id is not null then
    if v_otra.id = v_raiz or v_otra.cuenta_padre_id = v_raiz then
      raise exception '% ya es parte de este cliente', v_otra.razon_social;
    end if;
    if v_otra.cuenta_padre_id is not null then
      raise exception '% ya está en el grupo de otra empresa: pídaselo a gerencia', v_otra.razon_social;
    end if;
    if exists (select 1 from cuentas c where c.cuenta_padre_id = v_otra.id) then
      raise exception '% es la empresa madre de otro grupo: pídaselo a gerencia', v_otra.razon_social;
    end if;
    if v_otra.comercial_id is not null and v_otra.comercial_id is distinct from v_madre.comercial_id
       and not coalesce(es_backoffice(), false) then
      raise exception '% es cliente de %: vincularlas le cambia el dueño, eso lo autoriza gerencia',
        v_otra.razon_social, coalesce((select nombre from perfiles where id = v_otra.comercial_id), 'otro comercial');
    end if;
    update cuentas
       set cuenta_padre_id = v_raiz,
           comercial_id = coalesce(comercial_id, v_madre.comercial_id),
           updated_at = now()
     where id = v_otra.id;
    return v_otra.id;
  end if;

  if length(v_razon) < 3 then
    raise exception 'Escriba la razón social de la otra empresa';
  end if;
  insert into cuentas (tipo_doc, num_doc, razon_social, rubro_id, departamento, provincia, distrito,
                       comercial_id, cartera_desde, cuenta_padre_id, notas)
  values (case when length(v_doc) = 11 then 'RUC'::tipo_documento else 'DNI'::tipo_documento end,
          v_doc, v_razon, v_madre.rubro_id, v_madre.departamento, v_madre.provincia, v_madre.distrito,
          v_madre.comercial_id, hoy_lima(), v_raiz,
          format('Otra razón social de %s, vinculada el %s por %s.', v_madre.razon_social,
                 to_char(now() at time zone 'America/Lima', 'DD-MM-YYYY'),
                 coalesce((select nombre from perfiles where id = auth.uid()), 'el CRM')))
  returning id into v_id;
  return v_id;
end $$;

grant execute on function vincular_otra_razon_social(uuid, text, text) to authenticated;
