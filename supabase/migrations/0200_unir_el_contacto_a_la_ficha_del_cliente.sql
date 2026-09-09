-- UNIR UN CONTACTO A LA FICHA DEL CLIENTE QUE YA EXISTE.
--
-- Central, 09-09: «el día de ayer le indiqué sobre unir dos informaciones
-- porque el prospecto era de un cliente de Maryory; algo igual sucedió ahora,
-- para unir DEYSI J con el cliente COMERCIO ALTERNATIVO DE PRODUCTOS NO
-- TRADICIONALES Y DESARROLLO EN LATINOAMERICA-PERU / CANDELA PERU».
--
-- QUÉ PASÓ EN ESE CASO. El PRO-09219 entró por el formulario de Google Ads
-- como «Deysi J. peru», sin RUC y sin razón social —el formulario de Ads solo
-- pide nombre, teléfono y ciudad—, así que el CRM lo trató como cliente nuevo:
-- le abrió una ficha propia y la derivó a C5. Pero el correo con el que llegó
-- era `aseguramientocalidad@candelaperu.net`: es CANDELA PERÚ, cliente de C4
-- desde 2021, que en el sistema ya tiene su ficha con el RUC 20110804483 y su
-- contacto `monica.soto@candelaperu.net`. El cruce automático compara el
-- correo COMPLETO, no el dominio, así que no lo vio (eso se arregla aparte, en
-- la bandeja) y quedaron dos fichas del mismo cliente.
--
-- Y NO HABÍA CÓMO ARREGLARLO. «Cambiar de comercial» mueve a quién está
-- derivado, pero se lleva la ficha nueva con él: el duplicado sobrevive. Por
-- eso Central buscó el RUC 20110804483 en sus derivados y no encontró nada —el
-- cliente estaba, pero el prospecto de hoy colgaba de OTRA ficha, la que se
-- acababa de crear—. Es la regla de un expediente por cliente (0141) rota por
-- la puerta de atrás.
--
-- QUÉ HACE ESTO. Mueve el contacto —y su expediente, y su persona de
-- contacto— a la ficha del cliente de verdad, y borra la ficha vacía que había
-- quedado. No inventa clientes: la ficha destino la elige Central de la lista
-- que ya existe.
--
-- QUÉ NO HACE: NO le quita el cliente a nadie. La ficha destino conserva a su
-- comercial de siempre; lo que se mueve es el prospecto, que pasa a manos de
-- quien ya atiende a ese cliente. Es la dirección conservadora —devolver, no
-- arrebatar—, y aun así pide el código de supervisor cuando el contacto ya
-- está derivado a otro, porque Central no corrige sola una derivación (regla
-- del ing. Carlos, 27-08). Si gerencia decide después que ese cliente cambie
-- de cartera, eso es «Cambiar de comercial», que es otro botón y otra firma.

create or replace function public.unir_lead_a_cuenta(
  p_lead_id   uuid,
  p_cuenta_id uuid,
  p_pin       text default null,
  p_motivo    text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
end $$;

comment on function public.unir_lead_a_cuenta(uuid, uuid, text, text) is
  'Une un contacto (y su expediente y su persona de contacto) a la ficha de un cliente que ya existe, y cierra la ficha repetida si quedó vacía. Pide código de supervisor solo cuando el contacto ya estaba derivado a otro comercial. No cambia de dueño a la ficha destino.';

revoke all on function public.unir_lead_a_cuenta(uuid, uuid, text, text) from public;
grant execute on function public.unir_lead_a_cuenta(uuid, uuid, text, text) to authenticated;
