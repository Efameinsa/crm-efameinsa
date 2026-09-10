-- ============================================================
-- CRM EFAMEINSA · Migración 0212 · El mismo señor, con dos fichas
-- ============================================================
-- La señorita C5, 10-09: «Se está duplicando a un mismo número: me derivan a
-- OBED pero tiene el número 928450498 perteneciente a un prospecto también
-- derivado hoy. DONAIRES HUAMAN JORGE - HOTEL IMPERIAL TAHUANTINSUYO tienen el
-- mismo celular, ¿qué pasa? Se supone que es el mismo».
--
-- Es el mismo. Mismo celular 928450498 y MISMO CORREO, bryanzdonaires@gmail.com,
-- pidiendo lo mismo. Entró tres veces:
--
--   PRO-09242  09-09 20:19  formulario de Google Ads      «Obed», sin RUC ni empresa
--   PRO-09257  10-09 11:28  WhatsApp, tomado por Central  Jorge Donaires, RUC 10095615525
--   PRO-09262  10-09 13:06  WhatsApp otra vez             el mismo pedido, ya cotizado
--
-- Los dos primeros se derivaron a C5 y cada uno abrió SU PROPIA FICHA. La de
-- DONAIRES es la de verdad —dos llamadas y las cotizaciones Presu_653-26 y
-- Presu_651-26 del mismo día—; la de «Obed» quedó vacía.
--
-- POR QUÉ. `asignar_lead` SÍ vio que el teléfono ya existía. Lo descartó a
-- propósito, por la regla de la 0144 —el teléfono no puede llevar el caso a una
-- empresa que el contacto nunca nombró—, que se comprueba con los nombres:
--
--     empresa_compatible('DONAIRES HUAMAN JORGE', 'Obed')  ->  false
--
-- {DONAIRES, HUAMAN, JORGE} contra {OBED}: no se tocan. Esa regla protege de
-- meter a alguien en la ficha de una empresa ajena porque comparten un número.
-- Pero acá, al otro lado, NO HAY UNA EMPRESA: hay un cascarón que el propio CRM
-- había abierto esa mañana con el único dato que da el formulario de Ads —un
-- nombre de pila—. La regla protegió a un fantasma. Es la 0200 otra vez
-- («Deysi J. peru» / CANDELA PERÚ), esta vez por el lado de la derivación.
--
-- Y el dato que lo resolvía sin ninguna duda —el correo, idéntico carácter por
-- carácter— no entra en la decisión: `asignar_lead` mira documento y teléfono,
-- nada más. El aviso de la bandeja sí lo cruza, pero el aviso informa; quien
-- decide dónde se archiva es esta función, con otra regla. Central derivó a C5,
-- que era lo correcto, y el CRM partió la ficha igual.
--
-- LO QUE CAMBIA, y solo eso:
--
--   1. EL CASCARÓN NO BLOQUEA EL EMPATE. Si la ficha que empató por teléfono no
--      tiene documento, se llama como el nombre de pila del lead que la abrió y
--      no se trabajó nunca —ni cotización, ni venta, ni informe, ni equipo—,
--      no hay empresa que proteger. La 0144 sigue intacta para toda ficha con
--      identidad, que son las que importan.
--
--   2. TELÉFONO Y CORREO EXACTOS SON LA MISMA PERSONA. Dos datos coincidiendo,
--      no uno. El correo COMPLETO, nunca el dominio suelto: un @gmail
--      compartido no identifica a nadie (esa distinción ya la hace la bandeja).
--
--   3. LA FICHA SE QUEDA CON LA IDENTIDAD BUENA. Aun con el empate arreglado,
--      la ficha encontrada se quedaba llamándose «Obed» y sin RUC: el documento
--      que traía el contacto se perdía. Ahora una ficha SIN_DOC se completa con
--      el RUC/DNI del contacto, y el nombre se reemplaza si el que había era el
--      cascarón. Nunca pisa un documento que ya es de otra ficha.
--
--   4. AL UNIR, EL CONTACTO REPETIDO YA NO ANCLA LA FICHA VACÍA. La 0200 no
--      mueve al contacto cuyo número ya está en el destino —bien: no se clonan
--      personas—, pero después contaba ese contacto como «algo que queda» y
--      dejaba la ficha repetida en pie. Justo con el mismo teléfono, que es el
--      caso que trae a Central. Ahora ese contacto entrega lo que al otro le
--      falta y se va.
--
-- QUÉ NO CAMBIA: la cartera. Nada de esto mueve un cliente de manos ni crea
-- fichas; une lo que ya era del mismo y completa lo que faltaba.
-- ============================================================

-- ¿Esta ficha es un cascarón? Sin documento, con el nombre con que la abrió un
-- contacto que no dijo su empresa, y sin una sola cosa trabajada encima. Es la
-- ficha que el CRM inventa cuando un lead de Ads trae solo nombre y teléfono.
-- Cualquier señal de vida —una cotización, una venta, un informe, un equipo
-- instalado, un caso de postventa— y deja de serlo: ahí ya hay un cliente,
-- aunque le falte el RUC.
create or replace function public.ficha_sin_identidad(p_cuenta uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from cuentas c
     where c.id = p_cuenta
       and c.tipo_doc = 'SIN_DOC'
       and c.cuenta_padre_id is null
       and exists (
         select 1 from leads l
          where l.cuenta_id = c.id
            and coalesce(nullif(btrim(l.razon_social), ''), '') = ''
            and upper(btrim(coalesce(l.nombre_contacto, ''))) = upper(btrim(coalesce(c.razon_social, '')))
       )
       and not exists (select 1 from cotizaciones q join oportunidades o on o.id = q.oportunidad_id where o.cuenta_id = c.id)
       and not exists (select 1 from ventas       v join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = c.id)
       and not exists (select 1 from cotizaciones_historicas h where h.cuenta_id = c.id)
       and not exists (select 1 from informes_cierre     i where i.cuenta_id = c.id)
       and not exists (select 1 from informes_servicio   i where i.cuenta_id = c.id)
       and not exists (select 1 from servicios_postventa s where s.cuenta_id = c.id)
       and not exists (select 1 from soporte_tecnico     s where s.cuenta_id = c.id)
       and not exists (select 1 from equipos_instalados  e where e.cuenta_id = c.id)
       and not exists (select 1 from atenciones          a where a.cuenta_id = c.id)
       and not exists (select 1 from cuentas            h2 where h2.cuenta_padre_id = c.id)
  );
$$;

comment on function public.ficha_sin_identidad(uuid) is
  'La ficha es el cascaron que abrio un lead sin empresa (sin documento, nombre = nombre de pila del contacto, nada trabajado encima). 0212.';

-- ¿El teléfono que empató alcanza para archivar acá?
--
-- SE LLAMA SOLO DESPUÉS DE QUE EL TELÉFONO YA COINCIDIÓ: no decide sola, decide
-- si ese empate se respeta. Vale por tres caminos, en orden de por qué:
--   · el nombre pega (la comprobación de siempre, 0144);
--   · o la ficha es un cascarón y no hay empresa ajena que proteger;
--   · o el correo del contacto ya está EN esa ficha, escrito igual. Teléfono y
--     correo idénticos son la misma persona, se llame como se llame hoy.
create or replace function public.el_telefono_puede_unir(
  p_razon_lead  text,
  p_email_lead  text,
  p_cuenta      uuid,
  p_razon_ficha text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select empresa_compatible(p_razon_lead, p_razon_ficha)
      or ficha_sin_identidad(p_cuenta)
      or (
        position('@' in coalesce(p_email_lead, '')) > 1
        and exists (
          select 1 from contactos ct
           where ct.cuenta_id = p_cuenta
             and lower(btrim(coalesce(ct.email, ''))) = lower(btrim(p_email_lead))
        )
      );
$$;

comment on function public.el_telefono_puede_unir(text, text, uuid, text) is
  'Si el telefono ya empato, dice si ese empate se respeta: nombre compatible (0144), ficha cascaron, o el mismo correo exacto ya en la ficha. 0212.';

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
  select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
  from cuentas c
  where (v_lead.num_doc is not null and c.num_doc = v_lead.num_doc and c.tipo_doc <> 'SIN_DOC')
     or (
       v_lead.telefono_normalizado is not null
       -- El teléfono une al cliente que llama sin dar su RUC, pero no puede
       -- llevar el caso a una empresa que el contacto nunca nombró (0144).
       and el_telefono_puede_unir(v_lead.razon_social, v_lead.email, c.id, c.razon_social)
       and exists (
         select 1 from contactos ct
         where ct.cuenta_id = c.id and ct.telefono_normalizado = v_lead.telefono_normalizado
       )
     )
  limit 1;

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
          from contactos ct
          join cuentas c on c.id = ct.cuenta_id
         where celulares_de(ct.telefono) && v_celulares
           and el_telefono_puede_unir(v_lead.razon_social, v_lead.email, c.id, c.razon_social)
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

CREATE OR REPLACE FUNCTION public.unir_lead_a_cuenta(p_lead_id uuid, p_cuenta_id uuid, p_pin text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_solicitante uuid := auth.uid();
  v_lead        leads%rowtype;
  v_destino     cuentas%rowtype;
  v_origen      cuentas%rowtype;
  v_ventana     bigint := ventana_pin_actual();
  v_pin         text := regexp_replace(coalesce(p_pin, ''), '[^0-9]', '', 'g');
  v_libre       boolean := pin_libre_hasta() is not null;
  v_supervisor  uuid;
  v_ventana_ok  bigint;
  v_fallidos    integer;
  v_sup         record;
  v_motivo      text;
  v_mueve       boolean := false;
  v_nuevo_com   uuid;
  v_movidas     integer := 0;
  v_contactos   integer := 0;
  v_absorbida   boolean := false;
  v_resto       integer;
begin
  if v_solicitante is null then raise exception 'Sesión no válida'; end if;

  if not (coalesce(rol_actual() = 'central', false) or coalesce(es_backoffice(), false)) then
    raise exception 'Solo Central o gerencia pueden unir un contacto a la ficha de un cliente';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué es el mismo cliente (mínimo una frase). Es lo que va a leer el comercial.';
  end if;
  v_motivo := btrim(p_motivo);

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'Ese contacto no existe'; end if;
  if v_lead.estado not in ('pendiente_triaje', 'asignado') then
    raise exception 'Ese contacto ya no está en circulación (%). Retómelo primero.', v_lead.estado;
  end if;

  select * into v_destino from cuentas where id = p_cuenta_id for update;
  if v_destino.id is null then raise exception 'Esa ficha de cliente no existe'; end if;
  if v_destino.id = v_lead.cuenta_id then
    raise exception 'Ese contacto ya está en la ficha de %.', v_destino.razon_social;
  end if;

  -- El banco de pruebas no se mezcla con la cartera real, ni al revés: un
  -- ensayo de capacitación dentro de la ficha de un cliente es un dato falso
  -- que después nadie sabe distinguir (01-09).
  if not v_lead.es_prueba and exists (
    select 1 from perfiles p where p.id = v_destino.comercial_id and p.es_prueba
  ) then
    raise exception 'Esa ficha es del banco de pruebas. No se le puede unir un contacto real.';
  end if;

  -- ¿Esto mueve la cartera? Solo si el contacto YA está derivado y la ficha
  -- destino tiene otro dueño. Mientras siga en la bandeja no hay derivación
  -- que corregir: se está archivando bien antes de repartir.
  v_mueve := v_lead.estado = 'asignado'
         and v_destino.comercial_id is not null
         and v_lead.asignado_a is not null
         and v_destino.comercial_id <> v_lead.asignado_a;

  if v_mueve then
    if v_libre then
      -- Gerencia levantó el código por el día (0111): queda anotado igual y se
      -- dice en el motivo que salió sin código.
      select p.id into v_supervisor from perfiles p
       where p.rol::text in ('gerencia', 'admin') and p.activo
       order by p.created_at limit 1;
      v_ventana_ok := -floor(extract(epoch from now()))::bigint;
      v_motivo := '[sin código — permiso de gerencia del ' ||
                  to_char((now() at time zone 'America/Lima'), 'DD-MM') || '] ' || v_motivo;
    else
      select count(*) into v_fallidos
        from intentos_pin_supervisor
       where solicitante_id = v_solicitante and creado_at > now() - interval '10 minutes';
      if v_fallidos >= 5 then
        raise exception 'Demasiados códigos incorrectos. Espere unos minutos y pida uno nuevo al supervisor.';
      end if;
      if length(v_pin) <> 4 then
        insert into intentos_pin_supervisor (solicitante_id) values (v_solicitante);
        raise exception 'El código de autorización son cuatro dígitos.';
      end if;

      for v_sup in
        select p.id from perfiles p
         where p.activo
           and (p.rol::text in ('gerencia', 'admin', 'operaciones') or p.es_operaciones)
      loop
        if codigo_pin_supervisor(v_sup.id, v_ventana) = v_pin then
          v_supervisor := v_sup.id; v_ventana_ok := v_ventana; exit;
        elsif codigo_pin_supervisor(v_sup.id, v_ventana - 1) = v_pin then
          v_supervisor := v_sup.id; v_ventana_ok := v_ventana - 1; exit;
        end if;
      end loop;

      if v_supervisor is null then
        insert into intentos_pin_supervisor (solicitante_id) values (v_solicitante);
        raise exception 'Código incorrecto o vencido. Pídale al supervisor el que tiene en pantalla ahora.';
      end if;
    end if;

    begin
      insert into autorizaciones_supervisor (
        supervisor_id, solicitante_id, ventana, accion, lead_id,
        comercial_anterior, comercial_nuevo, motivo
      ) values (
        v_supervisor, v_solicitante, v_ventana_ok, 'unir_lead_a_cuenta', p_lead_id,
        v_lead.asignado_a, v_destino.comercial_id,
        format('[unido a %s] %s', v_destino.razon_social, v_motivo)
      );
    exception when unique_violation then
      raise exception 'Ese código ya se usó. Cada autorización sirve para una sola corrección: pida uno nuevo.';
    end;
  end if;

  -- A quién le queda el prospecto: al dueño de la ficha. Si la ficha no tiene
  -- dueño y el contacto sí está derivado, la ficha pasa a ese comercial —el
  -- mismo criterio con el que `asignar_lead` estrena una cuenta huérfana.
  v_nuevo_com := coalesce(v_destino.comercial_id, v_lead.asignado_a);

  select * into v_origen from cuentas where id = v_lead.cuenta_id;

  -- 1) EL CONTACTO PASA A LA FICHA. Y se queda con el documento del cliente:
  -- que el lead no tuviera RUC es justamente por lo que buscarlo por RUC en
  -- los derivados no devolvía nada.
  update leads
     set cuenta_id    = v_destino.id,
         razon_social = v_destino.razon_social,
         num_doc      = case
                          when coalesce(nullif(v_lead.num_doc, ''), '') <> '' then v_lead.num_doc
                          when v_destino.tipo_doc <> 'SIN_DOC' then v_destino.num_doc
                          else v_lead.num_doc
                        end,
         asignado_a   = case when v_mueve then v_nuevo_com else asignado_a end,
         asignado_por = case when v_mueve then v_solicitante else asignado_por end,
         asignado_at  = case when v_mueve then now() else asignado_at end,
         updated_at   = now()
   where id = p_lead_id;

  -- 2) SU EXPEDIENTE. Solo los que nacieron de ESTE contacto: la ficha de
  -- origen puede tener otros casos que no son de este cliente.
  update oportunidades
     set cuenta_id    = v_destino.id,
         comercial_id = case when v_mueve then v_nuevo_com else comercial_id end,
         updated_at   = now()
   where lead_id = p_lead_id
     and cuenta_id is distinct from v_destino.id;
  get diagnostics v_movidas = row_count;

  -- La ficha huérfana estrena dueño con este contacto.
  if v_destino.comercial_id is null and v_nuevo_com is not null then
    update cuentas set comercial_id = v_nuevo_com, cartera_desde = hoy_lima(), updated_at = now()
     where id = v_destino.id;
  end if;

  -- 3) LA PERSONA CON QUIEN SE HABLÓ. Se lleva a la ficha buena, salvo que allá
  -- ya esté por teléfono: el destino manda, no se duplican personas.
  if v_origen.id is not null then
    -- Principal solo hay uno, y es el que ya tenía la ficha del cliente: quien
    -- llega se suma como una persona más, no desplaza al de siempre.
    select count(*) into v_resto from contactos where cuenta_id = v_destino.id and es_principal;
    update contactos ct
       set cuenta_id    = v_destino.id,
           es_principal = case when coalesce(v_resto, 0) > 0 then false else ct.es_principal end
     where ct.cuenta_id = v_origen.id
       and not exists (
         select 1 from contactos otro
          where otro.cuenta_id = v_destino.id
            and otro.telefono_normalizado is not distinct from ct.telefono_normalizado
       );
    get diagnostics v_contactos = row_count;

    -- Y LA QUE NO SE MOVIÓ NO SE QUEDA ANCLANDO LA FICHA VACÍA (0212).
    -- Los contactos que quedaron atrás son los que el destino YA tiene con el
    -- mismo número: son la misma persona escrita dos veces. Mientras se
    -- quedaban en pie, el recuento del paso 5 contaba «un contacto» y dejaba
    -- viva la ficha repetida — justo en el caso del MISMO TELÉFONO, que es el
    -- que trae a Central acá (10-09: la ficha «Obed» y la de DONAIRES HUAMAN
    -- JORGE, mismo 928450498 y mismo correo).
    --
    -- Antes de irse dejan lo que allá falta: correo, documento, cargo y
    -- dirección. Lo único que se pierde es el nombre con que se escribió esta
    -- vez, y ese sigue en el contacto (leads.nombre_contacto), que no se toca.
    -- Solo se absorbe al que tiene teléfono: sin número no hay forma de
    -- afirmar que es la misma persona, y ahí se prefiere dejar la ficha en pie.
    update contactos d
       set email     = coalesce(d.email, o.email),
           documento = coalesce(d.documento, o.documento),
           cargo     = coalesce(d.cargo, o.cargo),
           direccion = coalesce(d.direccion, o.direccion)
      from contactos o
     where o.cuenta_id = v_origen.id
       and o.telefono_normalizado is not null
       and d.cuenta_id = v_destino.id
       and d.telefono_normalizado = o.telefono_normalizado;

    delete from contactos o
     where o.cuenta_id = v_origen.id
       and o.telefono_normalizado is not null
       and exists (
         select 1 from contactos d
          where d.cuenta_id = v_destino.id
            and d.telefono_normalizado = o.telefono_normalizado
       );
  end if;

  -- 4) EL RASTRO DE CARTERA SE VA CON EL CONTACTO. La derivación original
  -- («PRO-09219 → C5, cliente nuevo») está anotada contra la ficha que se
  -- acaba de vaciar: se apunta a la ficha buena, que es donde ahora vive ese
  -- contacto, y se anota el paso de manos. Las pantallas leen estas filas por
  -- `lead_id`, así que la historia del contacto queda entera y en orden.
  update asignaciones set cuenta_id = v_destino.id
   where lead_id = p_lead_id and cuenta_id is distinct from v_destino.id;

  if v_mueve then
    insert into asignaciones (lead_id, cuenta_id, de_comercial, a_comercial, motivo, decidida_por, notas)
    values (p_lead_id, v_destino.id, v_lead.asignado_a, v_nuevo_com, 'decision_gerencia', v_solicitante,
            format('Unido a la ficha de %s. %s', v_destino.razon_social, v_motivo));
  end if;

  -- 5) LA FICHA VACÍA SE VA. Solo si de verdad quedó vacía: si le queda
  -- cualquier cosa —otra oportunidad, una venta, un equipo instalado, un
  -- informe— se deja en pie y se dice. Borrar algo que todavía sostiene datos
  -- sería peor que el duplicado.
  if v_origen.id is not null and v_origen.id <> v_destino.id then
    select
      (select count(*) from leads                  where cuenta_id = v_origen.id)
    + (select count(*) from oportunidades          where cuenta_id = v_origen.id)
    + (select count(*) from contactos              where cuenta_id = v_origen.id)
    + (select count(*) from asignaciones           where cuenta_id = v_origen.id)
    + (select count(*) from atenciones             where cuenta_id = v_origen.id)
    + (select count(*) from cotizaciones_historicas where cuenta_id = v_origen.id)
    + (select count(*) from informes_cierre        where cuenta_id = v_origen.id)
    + (select count(*) from informes_servicio      where cuenta_id = v_origen.id)
    + (select count(*) from servicios_postventa    where cuenta_id = v_origen.id)
    + (select count(*) from soporte_tecnico        where cuenta_id = v_origen.id)
    + (select count(*) from equipos_instalados     where cuenta_id = v_origen.id)
    + (select count(*) from sunat_candidatos       where cuenta_id = v_origen.id or ruc_ya_en_cuenta = v_origen.id)
    + (select count(*) from inventario_equipos     where reservado_para = v_origen.id)
    + (select count(*) from cuentas                where cuenta_padre_id = v_origen.id)
      into v_resto;
    if coalesce(v_resto, 0) = 0 then
      delete from cuentas where id = v_origen.id;
      v_absorbida := true;
    end if;
  end if;

  return format(
    '%s quedó en la ficha de %s%s.%s%s',
    coalesce(v_lead.nombre_contacto, v_lead.codigo, 'El contacto'),
    v_destino.razon_social,
    case when v_destino.tipo_doc <> 'SIN_DOC' and v_destino.num_doc is not null
         then ' (' || v_destino.num_doc || ')' else '' end,
    case when v_mueve then format(' Lo atiende %s, que ya lleva a ese cliente.',
      coalesce((select coalesce(p.codigo_comercial || ' · ', '') || p.nombre from perfiles p where p.id = v_nuevo_com), 'su comercial'))
      else '' end,
    case when v_absorbida then ' Se cerró la ficha repetida que se había abierto.' else '' end
  );
end $function$
;
