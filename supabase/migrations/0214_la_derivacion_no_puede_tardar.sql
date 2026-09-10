-- ============================================================
-- CRM EFAMEINSA · Migración 0214 · La derivación no puede tardar
-- ============================================================
-- Lo encontró la verificación de la 0212, antes que Central: al derivar un
-- contacto cuyo teléfono empata pero cuyo nombre NO —el caso 3, el que tiene
-- que abrir ficha nueva— la llamada se pasaba del tiempo permitido y volvía
-- «canceling statement due to statement timeout». O sea: Central aprieta
-- «Derivar» y no pasa nada.
--
-- POR QUÉ. La comprobación que decide si un empate por teléfono se respeta
-- vivía dentro del `where` sobre `cuentas`:
--
--     from cuentas c
--     where (documento…) or (teléfono… and el_telefono_puede_unir(…) and exists(…))
--
-- Mientras esa comprobación fue `empresa_compatible` —comparar dos textos— dio
-- igual correrla 16.000 veces. La 0212 le sumó `ficha_sin_identidad`, que mira
-- diez tablas por ficha, y correrla una vez por cada una de las ~16.000 fichas
-- del sistema es otra cosa completamente distinta.
--
-- QUÉ CAMBIA. La misma búsqueda, en dos tiempos: primero por documento (que va
-- por índice), y si no, se juntan LOS POCOS candidatos que de verdad empataron
-- por número —eso también sale del índice de `contactos`— y recién sobre esos
-- se pregunta si el empate se respeta. La pregunta cara se hace sobre dos o
-- tres fichas, no sobre dieciséis mil. Igual en la búsqueda de respaldo de la
-- 0201 (el mismo celular escrito de otra forma).
--
-- Y de paso la búsqueda por teléfono queda ORDENADA: la ficha con RUC manda
-- sobre la que no lo tiene. Antes era un `limit 1` sin orden — con dos fichas
-- candidatas, la que salía dependía del plan de la base. Es el mismo criterio
-- que la 0201 ya usaba en su búsqueda de respaldo.
--
-- NO CAMBIA NINGUNA DECISIÓN: las mismas fichas empatan, con las mismas reglas.
-- Cambia cuántas veces se pregunta, y en qué orden se devuelven los empates.
-- ============================================================

CREATE OR REPLACE FUNCTION public.asignar_lead(p_lead_id uuid, p_comercial_id uuid, p_motivo motivo_asignacion DEFAULT NULL::motivo_asignacion, p_tipo_postventa tipo_postventa DEFAULT NULL::tipo_postventa)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead          leads%rowtype;
  v_cuenta_id     uuid;
  v_dueño_actual  uuid;
  v_motivo        motivo_asignacion;
  v_oportunidad_id uuid;
  v_postventa     boolean;
  v_sede          uuid;
  v_celulares     text[];
  v_cascaron      boolean;
  v_doc           text;
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
  -- La 0132 manda a esta misma cola las atenciones que registra postventa
  -- (area_destino = 'servicio_tecnico'): estar en `pendiente_triaje` ES la
  -- definición de «esto lo reparte Central». Lo que no le toca repartir sale
  -- de la cola por otro estado y lo frena la comprobación de arriba (0143).
  if v_lead.area_destino not in ('comercial', 'servicio_tecnico') then
    raise exception 'El lead % no es comercial (área: %); no se asigna, se deriva', v_lead.codigo, v_lead.area_destino;
  end if;

  select coalesce(es_postventa, false) into v_postventa from perfiles where id = p_comercial_id;
  if v_postventa and p_tipo_postventa is null then
    raise exception 'Indique de qué clase es el caso: garantía, repuesto o mantenimiento';
  end if;

  -- Una atención de postventa nace sobre una ficha concreta (0132): esa es
  -- la ficha, no una que se parezca. Buscarla otra vez por documento o
  -- teléfono es lo que abre la ficha gemela cuando el cliente no tiene RUC
  -- cargado o el contacto no tiene teléfono (0143).
  if v_lead.cuenta_id is not null then
    select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
      from cuentas c where c.id = v_lead.cuenta_id;
  end if;

  if v_cuenta_id is null then
    -- POR DOCUMENTO PRIMERO. Es el dato que no se comparte, y va por índice.
    if coalesce(nullif(v_lead.num_doc, ''), '') <> '' then
      select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
        from cuentas c
       where c.num_doc = v_lead.num_doc
         and c.tipo_doc <> 'SIN_DOC'
       limit 1;
    end if;

    -- POR TELÉFONO EXACTO, EN DOS TIEMPOS (0214). Primero se juntan los pocos
    -- candidatos que de verdad empataron por número —eso sale del índice de
    -- `contactos`— y RECIÉN sobre esos se pregunta si el empate se respeta
    -- (0144 / 0212). Preguntarlo dentro del `where` sobre `cuentas` obligaba a
    -- correr esa comprobación una vez por cada una de las ~16.000 fichas, y la
    -- derivación se pasaba del tiempo permitido: Central veía «cancelada por
    -- tiempo» al derivar. Medido en el banco de pruebas antes de subirlo.
    --
    -- La ficha con RUC manda sobre la que no lo tiene: es la de verdad, la
    -- otra es el duplicado que dejó un contacto sin documento.
    if v_cuenta_id is null and v_lead.telefono_normalizado is not null then
      select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
        from (
          select distinct ct.cuenta_id
            from contactos ct
           where ct.telefono_normalizado = v_lead.telefono_normalizado
        ) cand
        join cuentas c on c.id = cand.cuenta_id
       where el_telefono_puede_unir(v_lead.razon_social, v_lead.email, c.id, c.razon_social)
       order by (c.tipo_doc <> 'SIN_DOC') desc, c.created_at
       limit 1;
    end if;

    -- EL MISMO CELULAR ESCRITO DE OTRA FORMA (0201). Solo si arriba no se
    -- encontró nada: acá la alternativa no es «otra ficha», es «ficha nueva».
    -- Un dedazo adelante del número o dos veces el mismo número pegados hacían
    -- que GRUPO SANTA ELENA y NEWREST abrieran ficha por cada consulta, y el
    -- área veía la misma solicitud derivada tres veces (09-09).
    -- Se entra por `contactos` y no por `cuentas`: así el celular de cada
    -- contacto se lee UNA vez (14.122 filas, 200 ms medidos) en vez de una vez
    -- por cada ficha. Y solo se llega acá cuando lo de arriba no encontró nada.
    if v_cuenta_id is null and v_lead.telefono is not null then
      v_celulares := celulares_de(v_lead.telefono);
      if cardinality(v_celulares) > 0 then
        select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
          from (
            select distinct ct.cuenta_id
              from contactos ct
             where celulares_de(ct.telefono) && v_celulares
          ) cand
          join cuentas c on c.id = cand.cuenta_id
         where el_telefono_puede_unir(v_lead.razon_social, v_lead.email, c.id, c.razon_social)
         -- La ficha con RUC manda sobre la que no lo tiene: es la de verdad,
         -- la otra es el duplicado que dejó un contacto sin documento.
         order by (c.tipo_doc <> 'SIN_DOC') desc, c.created_at
         limit 1;
      end if;
    end if;

    -- Una institución con sedes bajo un mismo RUC (ESSALUD, Marina, MINSA)
    -- no es una ficha: es una familia. La sede sale del nombre que dio
    -- Central y, si no existe, se crea con ese nombre (0158).
    if v_cuenta_id is not null then
      v_sede := sede_para_lead(v_cuenta_id, v_lead.razon_social, true);
      if v_sede is not null and v_sede <> v_cuenta_id then
        select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual from cuentas c where c.id = v_sede;
      end if;
    end if;

    -- LA FICHA SE QUEDA CON LA IDENTIDAD BUENA (0212). Encontrarla no bastaba:
    -- si la ficha era el cascarón que abrió un lead de Ads —sin RUC y con un
    -- nombre de pila— el contacto se sumaba ahí y el RUC que SÍ traía este
    -- contacto se perdía. El cliente se quedaba llamándose «Obed» y sin
    -- documento, o sea invisible para cualquier búsqueda por RUC.
    --
    -- Solo se completa lo que falta: una ficha que ya tiene documento no se
    -- toca, y el nombre se reemplaza únicamente si el que había era el
    -- cascarón. Y no se pisa un documento que ya es de otra ficha (uq_cuentas_doc).
    if v_cuenta_id is not null then
      v_doc := regexp_replace(coalesce(v_lead.num_doc, ''), '[^0-9]', '', 'g');
      if length(v_doc) in (8, 11) then
        v_cascaron := ficha_sin_identidad(v_cuenta_id);
        update cuentas c
           set tipo_doc     = (case when length(v_doc) = 11 then 'RUC' else 'DNI' end)::tipo_documento,
               num_doc      = v_doc,
               razon_social = case
                                when v_cascaron and coalesce(nullif(btrim(v_lead.razon_social), ''), '') <> ''
                                  then btrim(v_lead.razon_social)
                                else c.razon_social
                              end,
               updated_at   = now()
         where c.id = v_cuenta_id
           and c.tipo_doc = 'SIN_DOC'
           and c.cuenta_padre_id is null
           and not exists (
             select 1 from cuentas otra
              where otra.num_doc = v_doc
                and otra.tipo_doc <> 'SIN_DOC'
                and otra.cuenta_padre_id is null
           );
      end if;
    end if;
  end if;

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

  -- CONSOLIDAR (Carlos, reunión 01-09): si el cliente ya tiene un expediente
  -- ABIERTO con este MISMO comercial, el contacto se suma ahí en vez de
  -- abrir un gemelo. Solo casos comerciales (postventa siempre abre el
  -- suyo: «ese es otro expediente totalmente independiente»), solo
  -- expedientes del CRM (no cascarones del Excel histórico) y solo con
  -- movimiento reciente: un expediente quieto hace un mes es otra consulta.
  if not v_postventa and p_tipo_postventa is null then
    select o.id into v_oportunidad_id
      from oportunidades o
     where o.cuenta_id = v_cuenta_id
       and o.comercial_id = p_comercial_id
       and o.origen = 'crm'
       and o.tipo_postventa is null
       and o.etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial')
       and o.updated_at >= now() - interval '30 days'
     order by o.updated_at desc
     limit 1;
  end if;

  if v_oportunidad_id is null then
    insert into oportunidades (cuenta_id, lead_id, comercial_id, etapa, tipo_postventa)
    values (v_cuenta_id, v_lead.id, p_comercial_id, 'asignada', p_tipo_postventa)
    returning id into v_oportunidad_id;
  else
    -- Sumarse cuenta como movimiento: el expediente acaba de recibir un
    -- contacto nuevo del cliente.
    update oportunidades set updated_at = now() where id = v_oportunidad_id;
  end if;

  update leads set
    estado = 'asignado',
    oportunidad_id = v_oportunidad_id,
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
$function$
;
