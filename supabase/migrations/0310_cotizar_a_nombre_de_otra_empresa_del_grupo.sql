-- COTIZAR A NOMBRE DE OTRA EMPRESA DEL GRUPO (25-09, Katerine).
--
-- CONGELADOS Y FRESCOS S.A.C. pidió una cotización a nombre de otra razón
-- social suya: CORPORACION REFRIGERADOS INY S.A.C. Hasta hoy eso obligaba a
-- abrir otra ficha con otro expediente, y la historia del cliente se partía
-- en dos (el «caso pasado» se unió a mano con un script).
--
-- Lo que hacen los CRM para esto es la cuenta con empresas del grupo: el
-- cliente es uno —un expediente, un comercial, una historia— y cada
-- documento sale a nombre de la razón social que factura. Acá:
--
--   · agregar_empresa_del_grupo: el comercial registra (o engancha) el RUC
--     de la otra empresa como hija de la ficha madre (cuenta_padre_id, 0158).
--   · cotizar_a_nombre_de: el borrador sale a nombre de esa empresa; el
--     expediente sigue siendo el mismo. cotizaciones.facturar_a_cuenta_id
--     deja constancia y el cliente_snapshot (lo que imprime el PDF) cambia.

alter table cotizaciones
  add column if not exists facturar_a_cuenta_id uuid references cuentas(id);

comment on column cotizaciones.facturar_a_cuenta_id is
  'Empresa del mismo grupo a cuyo nombre sale la cotización (0310). Null = la cuenta del expediente.';

create or replace function agregar_empresa_del_grupo(
  p_cuenta uuid,
  p_ruc text,
  p_razon text,
  p_direccion text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta   cuentas%rowtype;
  v_raiz     cuentas%rowtype;
  v_ruc      text := regexp_replace(coalesce(p_ruc, ''), '[^0-9]', '', 'g');
  v_razon    text := upper(btrim(regexp_replace(coalesce(p_razon, ''), '[[:space:]]+', ' ', 'g')));
  v_existe   cuentas%rowtype;
  v_cuantas  int;
  v_dueno    text;
  v_id       uuid;
begin
  select * into v_cuenta from cuentas where id = p_cuenta;
  if v_cuenta.id is null then
    raise exception 'El cliente no existe';
  end if;
  select * into v_raiz from cuentas where id = coalesce(v_cuenta.cuenta_padre_id, v_cuenta.id);

  if v_raiz.comercial_id is distinct from auth.uid()
     and v_cuenta.comercial_id is distinct from auth.uid()
     and not es_backoffice()
     and coalesce(rol_actual()::text, '') <> 'operaciones' then
    raise exception 'Solo el comercial del cliente (o gerencia) agrega empresas a su grupo';
  end if;
  if length(v_ruc) <> 11 or left(v_ruc, 1) not in ('1', '2') then
    raise exception 'El RUC tiene que tener 11 dígitos (empieza con 10 o 20)';
  end if;
  if length(v_razon) < 3 then
    raise exception 'Falta la razón social de la empresa';
  end if;

  -- ¿Ese RUC ya tiene ficha?
  select count(*) into v_cuantas from cuentas where regexp_replace(coalesce(num_doc, ''), '[^0-9]', '', 'g') = v_ruc and fusionada_en is null;
  if v_cuantas > 0 then
    -- Ya es del grupo: no hay nada que hacer.
    select * into v_existe from cuentas c
     where regexp_replace(coalesce(c.num_doc, ''), '[^0-9]', '', 'g') = v_ruc
       and (c.id = v_raiz.id or c.cuenta_padre_id = v_raiz.id)
     limit 1;
    if v_existe.id is not null then
      return v_existe.id;
    end if;
    if v_cuantas > 1 then
      raise exception 'Ese RUC tiene varias fichas (sedes). Pídale a gerencia que lo una al grupo';
    end if;
    select * into v_existe from cuentas c where regexp_replace(coalesce(c.num_doc, ''), '[^0-9]', '', 'g') = v_ruc and c.fusionada_en is null;
    if exists (select 1 from cuentas h where h.cuenta_padre_id = v_existe.id) then
      raise exception 'Esa empresa ya es madre de otro grupo. Pídale a gerencia que junte los dos grupos';
    end if;
    if v_existe.cuenta_padre_id is not null then
      raise exception 'Esa empresa ya pertenece a otro grupo. Pídale a gerencia que la mueva';
    end if;
    -- De otro comercial: no se la lleva sin permiso (se pide con el código).
    if v_existe.comercial_id is not null
       and v_existe.comercial_id is distinct from auth.uid()
       and v_existe.comercial_id is distinct from v_raiz.comercial_id
       and not es_backoffice()
       and coalesce(rol_actual()::text, '') <> 'operaciones' then
      select nombre into v_dueno from perfiles where id = v_existe.comercial_id;
      raise exception 'Ese RUC ya es cliente de la cartera de %: pídalo con el código antes de unirlo', coalesce(v_dueno, 'otro comercial');
    end if;
    update cuentas
       set cuenta_padre_id = v_raiz.id,
           comercial_id = coalesce(v_raiz.comercial_id, comercial_id),
           direccion = coalesce(nullif(btrim(direccion), ''), nullif(btrim(p_direccion), ''))
     where id = v_existe.id;
    return v_existe.id;
  end if;

  insert into cuentas (razon_social, tipo_doc, num_doc, direccion, comercial_id, cartera_desde, cuenta_padre_id, rubro_id)
  values (v_razon, 'RUC', v_ruc, nullif(btrim(p_direccion), ''), v_raiz.comercial_id, now(), v_raiz.id, v_raiz.rubro_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function agregar_empresa_del_grupo(uuid, text, text, text) from public, anon;
grant execute on function agregar_empresa_del_grupo(uuid, text, text, text) to authenticated;

create or replace function cotizar_a_nombre_de(p_cotizacion uuid, p_cuenta uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cot       cotizaciones%rowtype;
  v_op        oportunidades%rowtype;
  v_expediente cuentas%rowtype;
  v_destino   cuentas%rowtype;
  v_direccion text;
begin
  select * into v_cot from cotizaciones where id = p_cotizacion;
  if v_cot.id is null then
    raise exception 'La cotización no existe';
  end if;
  select * into v_op from oportunidades where id = v_cot.oportunidad_id;
  if v_op.comercial_id is distinct from auth.uid() and not es_backoffice() then
    raise exception 'No autorizado para cambiar esta cotización';
  end if;
  if v_cot.estado <> 'borrador' or v_cot.enviada_at is not null then
    raise exception 'Esta cotización ya salió al cliente: su razón social no se cambia. Haga una copia y cámbiela ahí';
  end if;

  select * into v_expediente from cuentas where id = v_op.cuenta_id;
  select * into v_destino from cuentas where id = coalesce(p_cuenta, v_op.cuenta_id);
  if v_destino.id is null then
    raise exception 'Esa empresa no existe';
  end if;
  if coalesce(v_destino.cuenta_padre_id, v_destino.id) <> coalesce(v_expediente.cuenta_padre_id, v_expediente.id) then
    raise exception 'Esa empresa no es del mismo grupo que el cliente';
  end if;

  -- Como crear_cotizacion: la dirección del contacto principal del
  -- expediente; si sale a nombre de otra empresa, la dirección fiscal de ella.
  if v_destino.id = v_op.cuenta_id then
    select coalesce(
      (select c.direccion from contactos c where c.cuenta_id = v_op.cuenta_id and c.es_principal limit 1),
      v_expediente.direccion
    ) into v_direccion;
  else
    v_direccion := v_destino.direccion;
  end if;

  update cotizaciones
     set facturar_a_cuenta_id = case when v_destino.id = v_op.cuenta_id then null else v_destino.id end,
         cliente_snapshot = coalesce(cliente_snapshot, '{}'::jsonb) || jsonb_build_object(
           'razon_social', v_destino.razon_social,
           'tipo_doc', v_destino.tipo_doc,
           'num_doc', v_destino.num_doc,
           'direccion', v_direccion
         )
   where id = p_cotizacion;
end;
$$;

revoke all on function cotizar_a_nombre_de(uuid, uuid) from public, anon;
grant execute on function cotizar_a_nombre_de(uuid, uuid) to authenticated;
