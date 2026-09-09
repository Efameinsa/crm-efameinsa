-- ============================================================
-- CRM EFAMEINSA · Migración 0204 · Pedir el cliente que está en otra cartera
-- ============================================================
-- Ariana, por Santos, 09-09: quiso gestionar a RIVERA TRIGOSO JORGE RICARDO
-- —ya había hablado con Katerine, el cliente lo sigue ella— y al poner el RUC
-- el CRM le contestó: «Ese RUC/DNI ya está registrado en el CRM. Está en la
-- cartera de C5 (Katerine Tello). Un cliente tiene una sola ficha: pida a
-- gerencia el traspaso de cartera o la unión de las fichas».
--
-- El mensaje es correcto y termina en una pared: le dice a quién pedírselo y
-- no le da con qué pedirlo. Santos: «ella debería poder hacerlo o solicitar
-- hacerlo; en esa ventanita emergente debería decirle que puede solicitar su
-- cambio a su cartera con un PIN».
--
-- Es la hermana de la 0202. Aquella mueve UN EXPEDIENTE y deja la ficha donde
-- está; esta mueve LA FICHA DEL CLIENTE, que es lo que hacía falta cuando el
-- cliente entero cambió de manos. Hasta hoy eso solo existía como
-- `reasignar_cartera` (0080), que es de gerencia y vive en otra pantalla: el
-- comercial quedaba esperando a que alguien la abriera.
--
-- LAS CUATRO DEFINICIONES QUE DIO SANTOS (09-09), Y CÓMO QUEDARON:
--
--  1. «¿El código de supervisor alcanza para mover cartera?» → SÍ. El código
--     lo dicta gerencia desde su pantalla, así que sigue decidiendo gerencia;
--     lo que cambia es que decide en el momento y no al día siguiente. Es la
--     misma regla del ing. Carlos del 27-08 para corregir una derivación.
--
--  2. «¿Se mueve el cliente entero o solo la ficha que tocó?» → «Por ahora
--     vamos a darle todo, luego vamos a pensar bien eso». Acá «todo» es la
--     ficha del RUC con TODOS sus expedientes vivos y archivados y sus
--     derivaciones. Lo que queda pendiente de pensar —y está agendado— son las
--     fichas partidas SIN documento del mismo cliente: no se pueden reconocer
--     por el RUC (Rivera tenía tres fichas y dos no lo llevaban) y unirlas por
--     nombre es justamente lo que no se hace solo.
--
--  3. «¿Las ventas viejas se quedan con quien las hizo?» → SÍ. Los expedientes
--     en `venta`, `rechazada` o `derivada` NO se mueven, igual que en 0080: de
--     quién es una venta no lo cambia un código de diez minutos. La ficha
--     cambia de dueño; la venta de marzo sigue siendo de quien la hizo.
--
--  4. «¿A quiénes aplica?» → «A todos». Cualquier comercial activo puede
--     pedirlo, no es un permiso de nadie en particular.
--
-- LO QUE NO HACE, Y ES A PROPÓSITO:
--
--  · NO MUEVE INSTITUCIONES CON SEDES. Desde la 0158 varias fichas comparten
--    el RUC (ESSALUD, la Marina, MINSA: una madre y sus sedes). Mover eso con
--    un código sería mover una institución entera de cartera sin que nadie lo
--    haya mirado. Se rechaza diciendo cuántas sedes son y que eso es de
--    gerencia.
--
--  · NO ES UN AUTOSERVICIO. El código se quema al usarse —uno por corrección—,
--    el motivo es obligatorio, y al que pierde el cliente le llega el aviso
--    con ese motivo escrito. Sin eso, la cartera se movería en silencio.
--
--  · NO MEZCLA EL BANCO DE PRUEBAS con la cartera real, ni al revés (01-09).

create or replace function public.pedir_cartera(
  p_num_doc text,
  p_pin     text default null,
  p_motivo  text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitante uuid := auth.uid();
  v_doc         text := nullif(btrim(coalesce(p_num_doc, '')), '');
  v_cuenta      cuentas%rowtype;
  v_yo          perfiles%rowtype;
  v_antes       perfiles%rowtype;
  v_ventana     bigint := ventana_pin_actual();
  v_pin         text := regexp_replace(coalesce(p_pin, ''), '[^0-9]', '', 'g');
  v_libre       boolean := pin_libre_hasta() is not null;
  v_supervisor  uuid;
  v_ventana_ok  bigint;
  v_fallidos    integer;
  v_sup         record;
  v_motivo      text;
  v_sedes       integer;
  v_ops         integer := 0;
  v_leads       integer := 0;
  v_quedan      integer := 0;
begin
  if v_solicitante is null then raise exception 'Sesión no válida'; end if;

  select * into v_yo from perfiles where id = v_solicitante;
  if v_yo.id is null or not v_yo.activo then raise exception 'Sesión no válida'; end if;
  if not (v_yo.rol::text = 'comercial' or coalesce(es_backoffice(), false)) then
    raise exception 'Solo un comercial puede pedir un cliente para su cartera';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué este cliente es suyo (una frase). Es lo que va a leer quien lo tiene hoy.';
  end if;
  v_motivo := btrim(p_motivo);
  if v_doc is null then raise exception 'Falta el RUC o DNI del cliente'; end if;

  -- La ficha madre del documento: el índice único la garantiza sola cuando no
  -- hay sedes (uq_cuentas_doc es parcial, `cuenta_padre_id is null`).
  select * into v_cuenta
    from cuentas
   where num_doc = v_doc and tipo_doc <> 'SIN_DOC' and cuenta_padre_id is null
   for update;
  if v_cuenta.id is null then
    raise exception 'No hay ninguna ficha con ese RUC/DNI. Si el cliente es nuevo, créelo desde su propia ficha.';
  end if;
  if v_cuenta.comercial_id = v_solicitante then
    raise exception 'Ese cliente ya está en su cartera.';
  end if;

  select count(*) into v_sedes from cuentas where cuenta_padre_id = v_cuenta.id;
  if coalesce(v_sedes, 0) > 0 then
    raise exception 'Ese RUC es de una institución con % sede(s) (%). Mover una institución entera de cartera lo decide gerencia.',
      v_sedes, v_cuenta.razon_social;
  end if;

  select * into v_antes from perfiles where id = v_cuenta.comercial_id;
  if coalesce(v_yo.es_prueba, false) <> coalesce(v_antes.es_prueba, false) and v_antes.id is not null then
    raise exception 'Uno de los dos es del banco de pruebas. Eso no se mezcla con la cartera real.';
  end if;

  -- ── El código del supervisor, igual que en 0195, 0200 y 0202 ────────────
  if v_libre then
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
      supervisor_id, solicitante_id, ventana, accion,
      comercial_anterior, comercial_nuevo, motivo
    ) values (
      v_supervisor, v_solicitante, v_ventana_ok, 'pedir_cartera',
      v_cuenta.comercial_id, v_solicitante,
      format('[cartera de %s · %s] %s', coalesce(v_cuenta.razon_social, 'cliente sin nombre'), v_doc, v_motivo)
    );
  exception when unique_violation then
    raise exception 'Ese código ya se usó. Cada autorización sirve para una sola: pida uno nuevo.';
  end;

  -- ── La ficha cambia de dueño, con sus expedientes vivos y archivados ────
  update cuentas
     set comercial_id = v_solicitante, cartera_desde = hoy_lima(), updated_at = now()
   where id = v_cuenta.id;

  with movidas as (
    update oportunidades
       set comercial_id = v_solicitante, updated_at = now()
     where cuenta_id = v_cuenta.id
       and etapa in ('asignada', 'filtrada', 'cotizada', 'seguimiento', 'potencial', 'historico')
       and comercial_id is distinct from v_solicitante
    returning id, lead_id, etapa
  ), leads_movidos as (
    update leads l
       set asignado_a = v_solicitante, updated_at = now()
      from movidas m
     where l.id = m.lead_id and l.estado = 'asignado'
    returning l.id
  ), anotadas as (
    -- Queda escrito DENTRO de cada expediente vivo, que es donde lo lee quien
    -- entre después. Los archivados no se anotan: serían ruido en el archivo.
    insert into actividades (oportunidad_id, tipo, nota, realizada_por)
    select m.id, 'nota',
           format('Cliente pasado a la cartera de %s%s (antes de %s). Motivo: %s',
                  coalesce(v_yo.codigo_comercial || ' · ', ''), v_yo.nombre,
                  coalesce(v_antes.nombre, 'sin dueño'), v_motivo),
           v_solicitante
      from movidas m
     where m.etapa <> 'historico'
    returning id
  )
  select (select count(*) from movidas), (select count(*) from leads_movidos)
    into v_ops, v_leads;

  -- Lo que NO se movió: las ventas y los cierres quedan contados a quien los
  -- hizo (decisión de Santos, 09-09). Se dice en la respuesta para que nadie
  -- crea que se llevó también el historial de plata.
  select count(*) into v_quedan
    from oportunidades
   where cuenta_id = v_cuenta.id and etapa in ('venta', 'rechazada', 'derivada');

  -- Y AL QUE LO TENÍA SE LE AVISA, con el motivo escrito.
  if v_cuenta.comercial_id is not null then
    perform crear_notificacion(
      v_cuenta.comercial_id, null, 'urgencia',
      format('%s pidió a %s para su cartera',
             coalesce(v_yo.codigo_comercial, v_yo.nombre),
             coalesce(v_cuenta.razon_social, 'un cliente')),
      v_motivo,
      '/comercial/mi-cartera'
    );
  end if;

  return format(
    '%s ya está en su cartera.%s%s',
    coalesce(v_cuenta.razon_social, 'El cliente'),
    case when v_ops > 0 then format(' Se movieron %s expediente(s).', v_ops) else '' end,
    case when v_quedan > 0
         then format(' Sus %s venta(s) o cierre(s) anteriores siguen contados a %s.',
                     v_quedan, coalesce(v_antes.nombre, 'su comercial anterior'))
         else '' end
  );
end $$;

comment on function public.pedir_cartera(text, text, text) is
  'Pasa a la cartera de quien lo pide el cliente de ese RUC/DNI, con código de supervisor y motivo: mueve la ficha, sus expedientes vivos y archivados y sus derivaciones. No mueve ventas ni cierres, ni instituciones con sedes.';

revoke all on function public.pedir_cartera(text, text, text) from public;
grant execute on function public.pedir_cartera(text, text, text) to authenticated;
