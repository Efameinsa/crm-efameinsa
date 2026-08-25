-- ============================================================
-- CRM EFAMEINSA · Migración 0080 · Derivar a postventa no mueve la cartera
-- ============================================================
-- Postventa entró ayer al CRM como «un perfil comercial más» (0075), que fue la
-- instrucción de Carlos para poder arrancar el mismo día. El efecto que nadie
-- buscó: `asignar_lead` le entrega la CUENTA a quien recibe el lead —así es
-- como un lead se convierte en cartera— y al derivarle un caso a Post Venta el
-- cliente SALÍA de la cartera del comercial.
--
-- Pasó 5 veces en dos días. El caso que mejor lo explica: el 25-08 a las 9:31
-- Central le derivó a Katerine el lead PRO-08954 de HOTEL SANTA LUCILA, y a las
-- 9:41 derivó PRO-08955 del mismo cliente a Post Venta. Diez minutos después
-- Katerine tenía una oportunidad abierta de un cliente cuya ficha ya no podía
-- abrir, porque la policy `cuentas_comercial` exige ser el dueño de la cuenta.
--
-- LA REGLA QUE FALTABA: atender una garantía no te hace el vendedor del
-- cliente. Un cliente pertenece al comercial que lo atendió (regla del 14-08) y
-- postventa es un ÁREA que atiende casos, no una cartera.
--
-- Lo que sí se duplica es el TRABAJO, no el cliente: cada derivación crea su
-- propia oportunidad, y los números de postventa ya quedan fuera de los
-- indicadores de venta (`es_postventa`, migración 0075). Una sola ficha por
-- cliente es justamente lo que deja que el comercial vea que a su cliente le
-- atendieron una garantía —señal de que la máquina tiene años y toca ofrecerle
-- una nueva— y que postventa vea qué se le vendió y cuándo, que es como sabe
-- si está en garantía.
--
-- ------------------------------------------------------------
-- Y DE QUÉ CLASE ES EL CASO
-- ------------------------------------------------------------
-- La 0075 creó `oportunidades.tipo_postventa` (garantía / repuesto /
-- mantenimiento) pero ninguna pantalla lo escribía: los 5 casos derivados
-- llegaron con el campo vacío y la vista de postventa no puede distinguir un
-- reclamo de garantía de un pedido de repuesto. Ahora la función lo exige
-- cuando el destino es postventa, y el diálogo de Central lo pregunta.

drop function if exists asignar_lead(uuid, uuid, motivo_asignacion);

create or replace function asignar_lead(
  p_lead_id uuid,
  p_comercial_id uuid,
  p_motivo motivo_asignacion default null,
  p_tipo_postventa tipo_postventa default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead          leads%rowtype;
  v_cuenta_id     uuid;
  v_dueño_actual  uuid;
  v_motivo        motivo_asignacion;
  v_oportunidad_id uuid;
  v_postventa     boolean;
begin
  if rol_actual() not in ('central', 'gerencia', 'admin') then
    raise exception 'No autorizado para asignar leads';
  end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead is null then
    raise exception 'Lead % no encontrado', p_lead_id;
  end if;
  if v_lead.estado <> 'pendiente_triaje' then
    raise exception 'El lead % ya fue procesado (estado actual: %)', v_lead.codigo, v_lead.estado;
  end if;
  if v_lead.area_destino <> 'comercial' then
    raise exception 'El lead % no es comercial (área: %); no se asigna, se deriva', v_lead.codigo, v_lead.area_destino;
  end if;

  select coalesce(es_postventa, false) into v_postventa from perfiles where id = p_comercial_id;
  if v_postventa and p_tipo_postventa is null then
    raise exception 'Indique de qué clase es el caso: garantía, repuesto o mantenimiento';
  end if;

  select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
  from cuentas c
  where (v_lead.num_doc is not null and c.num_doc = v_lead.num_doc and c.tipo_doc <> 'SIN_DOC')
     or (
       v_lead.telefono_normalizado is not null
       and exists (
         select 1 from contactos ct
         where ct.cuenta_id = c.id and ct.telefono_normalizado = v_lead.telefono_normalizado
       )
     )
  limit 1;

  if v_cuenta_id is null then
    -- Cliente nuevo. Si el caso es de postventa la ficha nace SIN dueño
    -- comercial: nadie le vendió todavía y postventa no toma carteras. Queda
    -- para que gerencia o Central la asignen el día que haya venta.
    insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, cartera_desde)
    values (
      (case
        when v_lead.num_doc is null or v_lead.num_doc = '' then 'SIN_DOC'
        when length(v_lead.num_doc) = 11 then 'RUC'
        when length(v_lead.num_doc) = 8 then 'DNI'
        else 'SIN_DOC'
      end)::tipo_documento,
      nullif(v_lead.num_doc, ''),
      coalesce(nullif(v_lead.razon_social, ''), v_lead.nombre_contacto, 'Sin nombre'),
      case when v_postventa then null else p_comercial_id end,
      case when v_postventa then null else now() end
    )
    returning id into v_cuenta_id;
    v_motivo := case when v_postventa then null else coalesce(p_motivo, 'nuevo_lead') end;
  elsif v_postventa then
    -- El cliente ya existe: la cartera se queda como está, sea de quien sea o
    -- de nadie. Esto es lo que arregla la migración.
    v_motivo := null;
  elsif v_dueño_actual is null then
    update cuentas set comercial_id = p_comercial_id, cartera_desde = now() where id = v_cuenta_id;
    v_motivo := coalesce(p_motivo, 'nuevo_lead');
  elsif v_dueño_actual = p_comercial_id then
    v_motivo := coalesce(p_motivo, 'cartera_existente');
  else
    update cuentas set comercial_id = p_comercial_id, cartera_desde = now() where id = v_cuenta_id;
    v_motivo := coalesce(p_motivo, 'decision_gerencia');
  end if;

  if v_lead.telefono is not null and not exists (
    select 1 from contactos ct
    where ct.cuenta_id = v_cuenta_id and ct.telefono_normalizado = v_lead.telefono_normalizado
  ) then
    insert into contactos (cuenta_id, nombre, telefono, email, es_principal)
    values (v_cuenta_id, coalesce(v_lead.nombre_contacto, 'Contacto'), v_lead.telefono, v_lead.email, true);
  end if;

  insert into oportunidades (cuenta_id, lead_id, comercial_id, etapa, tipo_postventa)
  values (v_cuenta_id, v_lead.id, p_comercial_id, 'asignada', p_tipo_postventa)
  returning id into v_oportunidad_id;

  update leads set
    estado = 'asignado',
    cuenta_id = v_cuenta_id,
    asignado_a = p_comercial_id,
    asignado_at = now(),
    asignado_por = auth.uid()
  where id = p_lead_id;

  -- `asignaciones` es el registro de quién se quedó con la cartera. Un caso de
  -- postventa sobre un cliente que ya existía no la mueve, así que no deja
  -- fila: la derivación queda registrada en `leads` y en la oportunidad, que
  -- es donde de verdad ocurrió.
  if v_motivo is not null then
    insert into asignaciones (lead_id, cuenta_id, de_comercial, a_comercial, motivo, decidida_por)
    values (p_lead_id, v_cuenta_id, v_dueño_actual, p_comercial_id, v_motivo, auth.uid());
  end if;

  return v_oportunidad_id;
end;
$$;

comment on function asignar_lead(uuid, uuid, motivo_asignacion, tipo_postventa) is
  'Deriva un contacto de la bandeja de Central a un comercial y le abre la oportunidad. Si el destino es el área de postventa, crea el caso pero NO toca la cartera del cliente (migración 0080).';

-- ------------------------------------------------------------
-- Corregir una derivación equivocada tampoco entrega el cliente
-- ------------------------------------------------------------
-- `redirigir_lead` (0079) mueve las tres cosas juntas —lead, oportunidad y
-- cuenta— porque el nuevo comercial no podría abrir la ficha si no. Con
-- postventa vale lo mismo que arriba: se le pasa el caso, no el cliente, y
-- ahora la ficha la ve por la policy de más abajo.
create or replace function redirigir_lead(p_lead_id uuid, p_comercial_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead        leads%rowtype;
  v_oportunidad oportunidades%rowtype;
  v_cuenta      cuentas%rowtype;
  v_n           integer;
  v_postventa   boolean;
begin
  if not (rol_actual() = 'central'::rol_usuario or es_backoffice()) then
    raise exception 'Solo Central puede corregir una derivación';
  end if;

  select * into v_lead from leads where id = p_lead_id;
  if v_lead is null then
    raise exception 'No existe ese contacto';
  end if;
  if v_lead.estado <> 'asignado' then
    raise exception 'Ese contacto no está derivado a nadie';
  end if;
  if v_lead.asignado_a = p_comercial_id then
    raise exception 'Ese contacto ya está con ese comercial';
  end if;

  if not exists (
    select 1 from perfiles
     where id = p_comercial_id and rol = 'comercial' and activo
  ) then
    raise exception 'El destino no es un comercial activo';
  end if;
  select coalesce(es_postventa, false) into v_postventa from perfiles where id = p_comercial_id;

  select * into v_oportunidad from oportunidades where lead_id = p_lead_id order by created_at limit 1;

  if v_oportunidad.id is not null then
    select count(*) into v_n from cotizaciones where oportunidad_id = v_oportunidad.id;
    if v_n > 0 then
      raise exception 'No se puede: ese comercial ya hizo % cotización(es). Un cliente cotizado se traspasa con autorización de gerencia.', v_n;
    end if;

    select count(*) into v_n from actividades where oportunidad_id = v_oportunidad.id;
    if v_n > 0 then
      raise exception 'No se puede: ese comercial ya registró % gestión(es) sobre este contacto. Pídalo a gerencia.', v_n;
    end if;

    select * into v_cuenta from cuentas where id = v_oportunidad.cuenta_id;

    -- Estos dos límites cuidan la CARTERA, y a postventa no se le entrega
    -- ninguna: un caso de garantía sobre un cliente con historia es
    -- exactamente lo normal, no algo que deba ir a pedirle permiso a gerencia.
    if not v_postventa then
      select count(*) into v_n from oportunidades
       where cuenta_id = v_oportunidad.cuenta_id and id <> v_oportunidad.id;
      if v_n > 0 then
        raise exception 'No se puede: este cliente ya tenía % oportunidad(es) antes de esta derivación. Pídalo a gerencia.', v_n;
      end if;

      if v_cuenta.ultima_venta_at is not null then
        raise exception 'No se puede: a este cliente ya se le vendió. Traspasarlo es decisión de gerencia.';
      end if;
    end if;

    update oportunidades set comercial_id = p_comercial_id, updated_at = now()
     where id = v_oportunidad.id;
    if not v_postventa then
      update cuentas set comercial_id = p_comercial_id, cartera_desde = current_date
       where id = v_oportunidad.cuenta_id;
    end if;
  end if;

  update leads
     set asignado_a = p_comercial_id,
         asignado_por = auth.uid(),
         asignado_at = now(),
         updated_at = now()
   where id = p_lead_id;

  return v_oportunidad.id;
end $$;

comment on function redirigir_lead(uuid, uuid) is
  'Corrige una derivación equivocada de Central: mueve lead, oportunidad y cuenta al comercial correcto. Se niega si el comercial anterior ya cotizó, ya gestionó o el cliente ya era suyo — eso es un traspaso de cartera y lo decide gerencia (0079). Al área de postventa se le pasa el caso sin la cuenta (0080).';

-- ------------------------------------------------------------
-- Postventa ve la ficha de los clientes donde tiene trabajo
-- ------------------------------------------------------------
-- Hasta ahora la veía porque era la dueña de la cuenta. Sin eso necesita una
-- puerta propia, y es la simétrica de la que ya existe para las oportunidades
-- (migración 0013): se ve la ficha del cliente sobre el que uno tiene un caso.
--
-- Se limita a postventa a propósito. La misma regla abierta a todos dejaría a
-- un comercial abrir la ficha de un cliente de otro con solo tener una venta
-- vieja encima, y la instrucción de Carlos es que un comercial no ve los datos
-- de otro. Compartir la ficha entre el comercial dueño y el área que atiende
-- la garantía no es lo mismo que cruzar dos carteras.
drop policy if exists cuentas_postventa_select on cuentas;
create policy cuentas_postventa_select on cuentas for select to authenticated
  using (
    es_postventa()
    and (
      exists (select 1 from oportunidades o where o.cuenta_id = cuentas.id and o.comercial_id = auth.uid())
      or exists (select 1 from servicios_postventa s where s.cuenta_id = cuentas.id)
      or exists (select 1 from soporte_tecnico s where s.cuenta_id = cuentas.id)
    )
  );

-- Y el teléfono al que tiene que llamar: sin los contactos, la ficha no le
-- sirve para atender el caso.
drop policy if exists contactos_postventa_select on contactos;
create policy contactos_postventa_select on contactos for select to authenticated
  using (
    es_postventa()
    and exists (
      select 1 from cuentas c
      where c.id = contactos.cuenta_id
        and (
          exists (select 1 from oportunidades o where o.cuenta_id = c.id and o.comercial_id = auth.uid())
          or exists (select 1 from servicios_postventa s where s.cuenta_id = c.id)
          or exists (select 1 from soporte_tecnico s where s.cuenta_id = c.id)
        )
    )
  );
