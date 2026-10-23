-- ============================================================
-- CRM EFAMEINSA · Migración 0597 · Central deriva a Postventa como ÁREA
-- ============================================================
-- Santos, 23-10: «central solo debe derivar a postventa y postventa es un
-- área y cada integrante solito toma el caso como si fuera suyo, pero entre
-- comillas suyo porque es del área; si lo asigna a un personal ya sería un
-- problema». Medido: en 30 días Central mandó 153 de 158 casos a una persona
-- (PV1 72, PV2-GP 51, PV2 17, PV3 14) y 5 al área.
--
--   1. asignar_lead: si quien asigna es Central y el destino es una persona
--      de postventa, el caso va a «Postventa (área)». La pantalla ya no las
--      ofrece; esto es la red de seguridad.
--   2. marcar_atencion_tomada_por_gestion: la primera gestión de una persona
--      de postventa deja el caso del área a su nombre (antes quedaba «tomado»
--      pero a nombre del área para siempre).
--   3. derivar_aviso: la nota dice QUIÉN escribió, igual que 0596.
--   4. El único caso abierto del área que ya gestionó alguien (CASO-00019,
--      PV1) pasa a su nombre.
-- ============================================================

CREATE OR REPLACE FUNCTION public.asignar_lead(p_lead_id uuid, p_comercial_id uuid, p_motivo motivo_asignacion DEFAULT NULL::motivo_asignacion, p_tipo_postventa tipo_postventa DEFAULT NULL::tipo_postventa)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reabre_id uuid;
  v_reabre_cerrada timestamptz;
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
  v_en_carpeta    boolean := false;
begin
  -- AUTODERIVADO (0327): postventa se asigna a sí misma el caso que acaba de
  -- registrar, solo cuando la llamada viene de registrar_caso_autoderivado.
  if rol_actual() not in ('central', 'gerencia', 'admin')
     and not (coalesce(current_setting('app.autoderivar', true), '') = 'si'
              and coalesce(puede_postventa(), false)
              and p_comercial_id = auth.uid()) then
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

  -- CENTRAL DERIVA AL ÁREA, NO A UNA PERSONA (0597, Santos 23-10): «central
  -- solo debe derivar a postventa, y postventa es un área: cada integrante
  -- solito toma el caso como si fuera suyo, pero entre comillas suyo porque es
  -- del área; si lo asigna a un personal ya sería un problema». En 30 días
  -- Central había mandado 153 de 158 casos a una persona. Si elige a alguien
  -- de postventa, va a «Postventa (área)»: el aviso suena a las tres, la
  -- carpeta que ya tenía dueña se queda con ella (caso_postventa_pasa_a no se
  -- la quita al área) y el caso es de quien lo gestione primero (0597, abajo).
  if rol_actual() = 'central'
     and exists (select 1 from perfiles p
                  where p.id = p_comercial_id and p.es_postventa
                    and not es_cuenta_area_postventa(p.id)
                    and not coalesce(p.es_prueba, false)) then
    select p.id into p_comercial_id
      from perfiles p
     where p.codigo_comercial = 'PV' and p.es_postventa
     limit 1;
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
    if v_cuenta_id is null and length(coalesce(v_lead.telefono_normalizado, '')) >= 6 then
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

  -- 0236: el correo del lead siempre llega a la ficha. Con teléfono, se crea el
  -- contacto o se le completa el correo al que ya existía; sin teléfono, se crea
  -- el contacto solo con el correo. La comercial gestiona con todo lo que llegó.
  if length(coalesce(v_lead.telefono_normalizado, '')) >= 6 then
    if not exists (
      select 1 from contactos ct
      where ct.cuenta_id = v_cuenta_id and ct.telefono_normalizado = v_lead.telefono_normalizado
    ) then
      insert into contactos (cuenta_id, nombre, telefono, email, es_principal)
      values (v_cuenta_id, coalesce(v_lead.nombre_contacto, 'Contacto'), v_lead.telefono, v_lead.email, true);
    elsif nullif(trim(v_lead.email), '') is not null then
      update contactos ct
         set email = trim(v_lead.email)
       where ct.cuenta_id = v_cuenta_id
         and ct.telefono_normalizado = v_lead.telefono_normalizado
         and nullif(trim(ct.email), '') is null;
    end if;
  elsif nullif(trim(v_lead.email), '') is not null and not exists (
    select 1 from contactos ct
    where ct.cuenta_id = v_cuenta_id and lower(trim(ct.email)) = lower(trim(v_lead.email))
  ) then
    insert into contactos (cuenta_id, nombre, telefono, email, es_principal)
    values (
      v_cuenta_id,
      coalesce(nullif(trim(v_lead.nombre_contacto), ''), 'Contacto'),
      null,
      trim(v_lead.email),
      not exists (select 1 from contactos ct where ct.cuenta_id = v_cuenta_id and ct.es_principal)
    );
  end if;

  -- CONSOLIDAR (Carlos, reunión 01-09): si el cliente ya tiene un expediente
  -- ABIERTO con este MISMO comercial, el contacto se suma ahí en vez de
  -- abrir un gemelo. Solo casos comerciales (postventa siempre abre el
  -- suyo: «ese es otro expediente totalmente independiente»), solo
  -- expedientes del CRM (no cascarones del Excel histórico) y solo con
  -- movimiento reciente: un expediente quieto hace un mes es otra consulta.
  -- POSTVENTA TAMBIÉN CONSOLIDA LO SUYO (Carlos, 22-09). Inversiones Huamán
  -- Ruiz pidió el mismo kit de interruptor de puerta el 19 y otra vez el 21:
  -- dos expedientes, media gestión cada uno y el cliente dos días esperando.
  -- «Ese es un error, vamos a consolidarlo». Un caso de postventa se suma al
  -- de postventa del MISMO cliente y del MISMO tipo (repuesto con repuesto)
  -- si sigue abierto y se movió este mes. Con otro tipo, o pasado el mes,
  -- sigue abriendo el suyo; y nunca se funde con un expediente comercial,
  -- que es la parte de la regla del 01-09 que no se toca.
  -- 0530: UNA CARPETA DE POSTVENTA POR CLIENTE (Santos, 17-10). La 0267 solo
  -- juntaba el mismo tipo y del último mes: 73 de 248 expedientes del mes
  -- nacieron teniendo el cliente otro abierto. Ahora toda derivación de
  -- postventa entra a la carpeta abierta del cliente, del tipo que sea; el
  -- asunto nuevo es un caso dentro de ella (sumar_a_carpeta_postventa).
  if p_tipo_postventa is not null then
    v_oportunidad_id := carpeta_postventa(v_cuenta_id, (select coalesce(es_prueba, false) from perfiles where id = p_comercial_id));
    v_en_carpeta := v_oportunidad_id is not null;
  end if;

  if v_oportunidad_id is null and not v_postventa and p_tipo_postventa is null then
    select o.id into v_oportunidad_id
      from oportunidades o
     where o.cuenta_id = v_cuenta_id
       and o.comercial_id = p_comercial_id
       -- Del CRM, o del Excel pero YA trabajado acá (Dance Sologuren, 21-09:
       -- 20 llamadas y 3 cotizaciones en el CRM sobre un expediente del
       -- Excel, y la derivación abrió un gemelo sin cotizaciones). Un
       -- cascarón quieto del Excel sigue sin contar.
       and (o.origen = 'crm'
            or exists (select 1 from actividades a where a.oportunidad_id = o.id and a.tipo <> 'nota' and a.realizada_at >= now() - interval '90 days')
            or exists (select 1 from cotizaciones c where c.oportunidad_id = o.id))
       and o.tipo_postventa is null
       and o.etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial')
       and o.updated_at >= now() - interval '30 days'
     order by o.updated_at desc
     limit 1;
  end if;

  -- VOLVIÓ TRAS EL RECHAZO (Moisés, 16-10, SUITE GENERIS): el cliente rechazado
  -- ayer escribió «Hola» hoy y Central lo derivó a su mismo comercial; como el
  -- expediente estaba cerrado, se abrió un gemelo y la cotización quedó en el
  -- rechazado. Igual que wa_abrir_seguimiento (0408), si este comercial le
  -- cerró como rechazado un expediente en los últimos 30 días, se reabre en
  -- seguimiento en vez de abrir otro. Solo casos comerciales.
  if v_oportunidad_id is null and not v_postventa and p_tipo_postventa is null then
    select o.id, o.cerrada_at into v_reabre_id, v_reabre_cerrada
      from oportunidades o
     where o.cuenta_id = v_cuenta_id
       and o.comercial_id = p_comercial_id
       and o.tipo_postventa is null
       and o.etapa = 'rechazada'
       and (o.origen = 'crm'
            or exists (select 1 from cotizaciones c where c.oportunidad_id = o.id))
       and coalesce(o.cerrada_at, o.updated_at) >= now() - interval '30 days'
     order by coalesce(o.cerrada_at, o.updated_at) desc
     limit 1;
    if v_reabre_id is not null then
      update oportunidades
         set etapa = 'seguimiento',
             cerrada_at = null,
             motivo_rechazo_id = null,
             updated_at = now()
       where id = v_reabre_id;
      insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
      values (
        v_reabre_id,
        'nota',
        format(
          'El cliente volvió a escribir (%s) el %s, después de que el expediente se cerrara como rechazado el %s: se reabre el seguimiento aquí en vez de abrir otro expediente.',
          coalesce(v_lead.codigo, 'contacto nuevo'),
          to_char(coalesce(v_lead.recibido_at, now()) at time zone 'America/Lima', 'DD-MM-YYYY HH24:MI'),
          coalesce(to_char(v_reabre_cerrada at time zone 'America/Lima', 'DD-MM-YYYY'), 'antes')
        ),
        coalesce(auth.uid(), p_comercial_id),
        now()
      );
      v_oportunidad_id := v_reabre_id;
    end if;
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

  -- 0530: la derivación que entra a una carpeta abre su caso, le pone la
  -- próxima acción de hoy y la carpeta pasa a quien la recibe.
  if v_en_carpeta then
    perform sumar_a_carpeta_postventa(v_oportunidad_id, p_lead_id, p_comercial_id, p_tipo_postventa);
  end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.derivar_aviso(p_lead uuid, p_finanzas boolean DEFAULT false, p_postventa boolean DEFAULT false, p_comercial boolean DEFAULT false, p_detalle text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead      leads;
  v_cuenta    cuentas;
  v_op        oportunidades;
  v_pedido    servicios_postventa;
  v_detalle   text := btrim(coalesce(p_detalle, ''));
  v_area      area_destino;
  v_hecho     text[] := '{}';
  v_falta     text[] := '{}';
  v_actividad uuid;
  v_servicio  uuid;
  v_linea     text;
  v_aviso     uuid;
  v_n         integer;
  v_clave     text;
  v_quien     text;
begin
  if not (es_backoffice() or rol_actual() = 'central' or es_operaciones()) then
    raise exception 'Solo Central o gerencia derivan un aviso';
  end if;
  if not (p_finanzas or p_postventa or p_comercial) then
    raise exception 'Elija al menos un destino: Finanzas, postventa o el comercial';
  end if;
  if length(v_detalle) < 10 then
    raise exception 'Escriba qué avisó el cliente: es lo único que van a leer las áreas';
  end if;

  select * into v_lead from leads where id = p_lead;
  if not found then raise exception 'Ese contacto ya no está'; end if;

  -- QUIÉN escribió (0596/0597): nombre, teléfono y correo del contacto, solo lo
  -- que el texto de Central todavía no dice (teléfono comparado por dígitos).
  v_quien := concat_ws(' · ',
    case when nullif(btrim(coalesce(v_lead.nombre_contacto, '')), '') is not null
          and v_lead.nombre_contacto <> 'Sin nombre'
          and position(lower(btrim(v_lead.nombre_contacto)) in lower(v_detalle)) = 0
         then btrim(v_lead.nombre_contacto) end,
    case when length(regexp_replace(coalesce(v_lead.telefono, ''), '\D', '', 'g')) >= 6
          and position(regexp_replace(v_lead.telefono, '\D', '', 'g') in regexp_replace(v_detalle, '\D', '', 'g')) = 0
         then 'Tel. ' || btrim(v_lead.telefono) end,
    case when nullif(btrim(coalesce(v_lead.email, '')), '') is not null
          and position(lower(btrim(v_lead.email)) in lower(v_detalle)) = 0
         then btrim(v_lead.email) end);
  if v_quien <> '' then
    v_detalle := v_detalle || ' — Escribió: ' || v_quien;
  end if;

  -- ── De qué cliente estamos hablando ──────────────────────────────────
  if v_lead.cuenta_id is not null then
    select * into v_cuenta from cuentas where id = v_lead.cuenta_id;
  end if;

  if v_cuenta.id is null and nullif(btrim(coalesce(v_lead.num_doc, '')), '') is not null then
    select * into v_cuenta from cuentas where num_doc = btrim(v_lead.num_doc) limit 1;
  end if;

  if v_cuenta.id is null and nullif(coalesce(v_lead.telefono_normalizado, ''), '') is not null then
    select count(*) into v_n
      from cuentas cu
     where exists (select 1 from contactos k
                    where k.cuenta_id = cu.id
                      and k.telefono_normalizado = v_lead.telefono_normalizado);
    if v_n = 1 then
      select cu.* into v_cuenta
        from cuentas cu
       where exists (select 1 from contactos k
                      where k.cuenta_id = cu.id
                        and k.telefono_normalizado = v_lead.telefono_normalizado);
    elsif v_n > 1 then
      v_falta := array_append(v_falta,
        'ese teléfono está en ' || v_n || ' fichas distintas: hay que unirlas antes de que el aviso pueda llegar al comercial');
    end if;
  end if;

  if v_cuenta.id is null and nullif(btrim(coalesce(v_lead.razon_social, '')), '') is not null then
    v_clave := upper(regexp_replace(v_lead.razon_social, '[^A-Za-z0-9]', '', 'g'));
    select count(*) into v_n
      from cuentas cu
     where upper(regexp_replace(cu.razon_social, '[^A-Za-z0-9]', '', 'g')) = v_clave;
    if v_n = 1 then
      select cu.* into v_cuenta
        from cuentas cu
       where upper(regexp_replace(cu.razon_social, '[^A-Za-z0-9]', '', 'g')) = v_clave;
    elsif v_n > 1 then
      v_falta := array_append(v_falta,
        'ese nombre está en ' || v_n || ' fichas distintas: hay que unirlas antes de que el aviso pueda llegar al comercial');
    end if;
  end if;

  -- Encontrada la ficha, el contacto queda atado a ella: el próximo aviso ya
  -- no busca, y Central lo ve enlazado en el resto de las pantallas.
  if v_cuenta.id is not null and v_lead.cuenta_id is null then
    update leads set cuenta_id = v_cuenta.id where id = p_lead;
  end if;

  -- ── AL COMERCIAL: queda en el historial de su oportunidad ────────────
  if p_comercial then
    if v_cuenta.id is null then
      v_falta := array_append(v_falta, 'no se pudo ubicar la ficha del cliente: el aviso no entró en el historial de ningún comercial');
    else
      select * into v_op from oportunidades
       where cuenta_id = v_cuenta.id and etapa <> 'historico'
       order by (cerrada_at is null) desc, created_at desc
       limit 1;
      if v_op.id is null then
        v_falta := array_append(v_falta, 'el cliente no tiene ninguna oportunidad abierta donde anotar el aviso');
      else
        insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
        values (v_op.id, 'nota', '[Aviso de Central] ' || v_detalle, auth.uid(), now())
        returning id into v_actividad;
        v_hecho := array_append(v_hecho, 'anotado en el historial del cliente');
      end if;
    end if;
  end if;

  -- ── A POSTVENTA: se anota en el pedido en curso ──────────────────────
  if p_postventa then
    if v_cuenta.id is null then
      v_falta := array_append(v_falta, 'sin ficha de cliente no se pudo ubicar su pedido en postventa');
    else
      select * into v_pedido from servicios_postventa
       where cuenta_id = v_cuenta.id and cerrado_at is null and not completado
       order by created_at desc
       limit 1;
      if v_pedido.id is null then
        v_falta := array_append(v_falta, 'ese cliente no tiene ningún pedido abierto en postventa');
      else
        v_linea := to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI') ||
                   ' · Aviso de Central: ' || v_detalle;
        update servicios_postventa
           set observaciones = btrim(coalesce(observaciones, '') || chr(10) || v_linea),
               updated_at = now()
         where id = v_pedido.id;
        v_servicio := v_pedido.id;
        v_hecho := array_append(v_hecho, 'anotado en el pedido de postventa');
      end if;
    end if;
  end if;

  -- ── El contacto sale de la bandeja hacia el área que corresponda ─────
  v_area := case when p_finanzas then 'finanzas'::area_destino
                 when p_postventa then 'postventa'::area_destino
                 else 'comercial'::area_destino end;
  update leads
     set estado = 'derivado_area',
         area_destino = v_area,
         asignado_por = auth.uid(),
         asignado_at = now()
   where id = p_lead;

  if p_finanzas then v_hecho := array_append(v_hecho, 'derivado a Finanzas'); end if;

  insert into avisos_derivados (
    lead_id, a_finanzas, a_postventa, a_comercial, detalle,
    actividad_id, servicio_id, linea_pedido,
    estado_anterior, area_anterior, derivado_por
  ) values (
    p_lead, p_finanzas, p_postventa, p_comercial, v_detalle,
    v_actividad, v_servicio, v_linea,
    v_lead.estado, v_lead.area_destino, auth.uid()
  ) returning id into v_aviso;

  return jsonb_build_object(
    'aviso', v_aviso,
    'hecho', v_hecho,
    'falta', v_falta,
    'cliente', coalesce(v_cuenta.razon_social, v_lead.razon_social, v_lead.nombre_contacto),
    'documento', coalesce(v_cuenta.num_doc, v_lead.num_doc),
    'telefono', v_lead.telefono,
    'codigo', v_lead.codigo,
    'detalle', v_detalle,
    'finanzas', p_finanzas,
    -- PARA QUE EL AVISO AVISE (0215). Hasta hoy esto anotaba la nota en el
    -- historial del cliente y nada más: el comercial se enteraba cuando abría
    -- esa ficha, que puede ser al día siguiente, y mientras tanto el cliente
    -- esperaba. Devolviendo a quién le tocaba y en qué expediente quedó, la
    -- pantalla puede mandarle la campanita — «Su cliente volvió a escribir»—
    -- sin que la nota deje de ser una nota.
    'oportunidad', v_op.id,
    'comercial_id', v_op.comercial_id
  );
end $function$;

CREATE OR REPLACE FUNCTION public.marcar_atencion_tomada_por_gestion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.oportunidad_id is null then
    return new;
  end if;
  update atenciones a
     set tomada_at  = coalesce(new.realizada_at, now()),
         tomada_por = new.realizada_por
   where a.oportunidad_id = new.oportunidad_id
     and a.tomada_at is null
     and a.cerrado_at is null;
  -- «Suyo entre comillas» (0597): el caso que Central derivó al área pasa a
  -- nombre de la persona de postventa que lo gestiona primero. Sigue siendo
  -- del área para todo lo demás (lo ven y ayudan las tres; 0530).
  if exists (select 1 from perfiles p
              where p.id = new.realizada_por and p.es_postventa
                and not es_cuenta_area_postventa(p.id)) then
    update atenciones a
       set asignado_a = new.realizada_por,
           updated_at = now()
     where a.oportunidad_id = new.oportunidad_id
       and a.cerrado_at is null
       and es_cuenta_area_postventa(a.asignado_a);
  end if;
  return new;
end $function$;

-- 4. Casos abiertos del área que ya gestionó una persona de postventa.
update atenciones a
   set asignado_a = x.quien, updated_at = now()
  from (select distinct on (a2.id) a2.id, ac.realizada_por as quien
          from atenciones a2
          join actividades ac on ac.oportunidad_id = a2.oportunidad_id and ac.realizada_at >= a2.created_at
          join perfiles p on p.id = ac.realizada_por and p.es_postventa and not es_cuenta_area_postventa(p.id)
         where a2.cerrado_at is null and es_cuenta_area_postventa(a2.asignado_a)
         order by a2.id, ac.realizada_at) x
 where a.id = x.id;
