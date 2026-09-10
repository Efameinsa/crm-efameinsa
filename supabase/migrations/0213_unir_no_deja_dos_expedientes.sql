-- ============================================================
-- CRM EFAMEINSA · Migración 0213 · Unir no deja dos expedientes
-- ============================================================
-- La otra mitad de lo que reportó C5 el 10-09 (ver 0212). Con la 0212 el mismo
-- señor deja de tener dos FICHAS. Pero al unir, el prospecto se lleva su
-- expediente tal cual, así que la ficha quedaba con una sola cara y DOS
-- EXPEDIENTES adentro: el vacío que abrió el lead de Google Ads y el que C5 ya
-- había trabajado y cotizado. Para ella es lo mismo de antes — el mismo cliente
-- dos veces en su lista, uno de ellos pidiéndole una gestión que ya hizo.
--
-- La regla ya existía y ya estaba decidida: Carlos, 01-09, «si el cliente ya
-- tiene un expediente abierto con este mismo comercial, el contacto se suma ahí
-- en vez de abrir un gemelo». `asignar_lead` la aplica desde entonces al
-- derivar. `unir_lead_a_cuenta` no, porque cuando se escribió (0200) el caso
-- era otro: una ficha ajena que había que devolver, no dos expedientes del
-- mismo comercial.
--
-- SOLO SE FUNDE EL QUE LLEGA VACÍO: sin gestión, sin cotización, sin venta, sin
-- informe de cierre y sin caso de postventa. Cualquier cosa adentro y el
-- expediente se queda donde está, aunque sea del mismo cliente y del mismo día:
-- ahí hay trabajo de alguien. Y solo se funde contra un expediente del MISMO
-- comercial, abierto y con movimiento en los últimos 30 días — uno quieto hace
-- un mes es otra consulta, no esta.
--
-- No mueve cartera, no borra nada que sostenga datos, y lo dice en el mensaje
-- que ve Central: «se sumó al expediente que ese cliente ya tenía abierto».
-- ============================================================

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
  v_op_vacia    uuid;
  v_op_viva     uuid;
  v_fundida     boolean := false;
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

  -- 2 bis) Y NO QUEDAN DOS EXPEDIENTES DEL MISMO CLIENTE (0213).
  --
  -- Es la regla de Carlos del 01-09, la que `asignar_lead` ya aplica al
  -- derivar: si el cliente YA tiene un expediente abierto con ese mismo
  -- comercial, el contacto se suma ahí en vez de abrir un gemelo. Al UNIR no se
  -- aplicaba, así que la ficha quedaba con una sola cara pero con dos
  -- expedientes adentro — y el comercial seguía viendo lo mismo dos veces, que
  -- es de lo que se queja (C5, 10-09: el mismo señor entró por Google Ads y por
  -- WhatsApp el mismo día).
  --
  -- SOLO SE FUNDE EL QUE LLEGA VACÍO: sin gestión, sin cotización, sin venta,
  -- sin informe y sin caso de postventa. Un expediente con cualquier cosa
  -- adentro no se toca nunca, aunque sea del mismo cliente y del mismo día:
  -- ahí hay trabajo de alguien y perderlo sería peor que el duplicado.
  select o.id into v_op_vacia
    from oportunidades o
   where o.lead_id = p_lead_id
     and o.cuenta_id = v_destino.id
     and o.tipo_postventa is null
     and o.origen = 'crm'
     and o.etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial')
     and not exists (select 1 from actividades         a where a.oportunidad_id = o.id)
     and not exists (select 1 from cotizaciones        q where q.oportunidad_id = o.id)
     and not exists (select 1 from ventas              v where v.oportunidad_id = o.id)
     and not exists (select 1 from informes_cierre     i where i.oportunidad_id = o.id)
     and not exists (select 1 from servicios_postventa s where s.oportunidad_id = o.id)
     and not exists (select 1 from atenciones          t where t.oportunidad_id = o.id or t.oportunidad_origen = o.id)
   limit 1;

  if v_op_vacia is not null then
    -- El expediente que se queda es el del MISMO comercial y con movimiento
    -- reciente: uno quieto hace un mes es otra consulta, no esta.
    select o.id into v_op_viva
      from oportunidades o
     where o.cuenta_id = v_destino.id
       and o.id <> v_op_vacia
       and o.origen = 'crm'
       and o.tipo_postventa is null
       and o.comercial_id is not distinct from (select o2.comercial_id from oportunidades o2 where o2.id = v_op_vacia)
       and o.etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial')
       and o.updated_at >= now() - interval '30 days'
     order by o.updated_at desc
     limit 1;

    if v_op_viva is not null then
      update leads set oportunidad_id = v_op_viva where id = p_lead_id;
      delete from oportunidades where id = v_op_vacia;
      -- Sumarse cuenta como movimiento: el expediente acaba de recibir otro
      -- contacto del mismo cliente.
      update oportunidades set updated_at = now() where id = v_op_viva;
      v_fundida := true;
    end if;
  end if;

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
    || case when v_fundida then ' Y se sumó al expediente que ese cliente ya tenía abierto, en vez de dejar dos.' else '' end
  );
end $function$
;
