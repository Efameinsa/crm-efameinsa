-- ============================================================
-- CRM EFAMEINSA · Migración 0202 · Pedir el expediente que es de otro
-- ============================================================
-- Santos, 09-09, mirando la ficha de PANASERVICE con postventa al lado:
-- «¿debería aparecer un aviso no?, que diga que este cliente es de Ariana y
-- por eso no lo puede gestionar, y un botón que pida cambiar para ella con
-- PIN, supongo que sería una solución».
--
-- QUÉ PASABA. La señorita de postventa atendió a PANASERVICE, entró a anotar
-- la gestión y no pudo. La ficha le mostraba tres expedientes y el del
-- mantenimiento era de C4 (Ariana), rotulado «pídaselo para anotar». La base
-- hacía lo correcto —una gestión la anota el dueño del expediente— pero el
-- CRM la dejaba en un callejón: le decía a quién pedírselo y no le daba con
-- qué pedirlo. «Pídaselo» por WhatsApp no mueve nada dentro del sistema, y
-- Ariana tampoco tenía botón para pasarlo.
--
-- No es un caso suelto: hay 107 expedientes de postventa en la cartera de un
-- comercial —83 en el histórico— y cada uno de ellos es la misma pared.
--
-- QUÉ HACE ESTO. Un solo camino, con firma: quien atendió pide el expediente,
-- escribe por qué, y un supervisor le dicta el código de siempre. El
-- expediente cambia de dueño, queda registrado quién autorizó, y al dueño
-- anterior le llega el aviso con el motivo escrito.
--
-- QUÉ NO HACE, Y ES A PROPÓSITO
--
--  · NO MUEVE LA CARTERA DEL CLIENTE. Se mueve el expediente, nada más. La
--    ficha sigue siendo de quien era —es la decisión de Santos del 28-08, «la
--    cuenta NO cambia de dueño»— porque mover 480 clientes a postventa le
--    vaciaría la cartera a Katerine, a Ariana y a Brenda (0183). Para eso está
--    «Reasignar cartera», que es de gerencia y es otro botón.
--
--  · NO TOCA UN EXPEDIENTE CON VENTA O CON INFORME EMITIDO. Ahí el dueño ya no
--    es una etiqueta: es de quién es la venta y a quién se le paga. De los 107
--    hay UNO así, y para ese el camino es gerencia. Se dice con todas las
--    letras en vez de dejar que el número se mueva sin que nadie lo note.
--
--  · NO ES UN AUTOSERVICIO. Pide el código del supervisor por lo mismo que lo
--    pide corregir una derivación (regla del ing. Carlos, 27-08): quitarle un
--    expediente a alguien es una decisión, no un trámite. Y el código se quema
--    al usarse: uno por corrección.
--
-- QUIÉN PUEDE PEDIRLO. Solo quien ya podía VER el expediente y tiene por qué
-- trabajarlo: postventa sobre un expediente de postventa, el comercial dueño
-- del cliente, o gerencia. No se abre a nadie más — ver no es poder tomar.

create or replace function public.pedir_expediente(
  p_oportunidad_id uuid,
  p_pin            text default null,
  p_motivo         text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitante uuid := auth.uid();
  v_op          oportunidades%rowtype;
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
  v_puede       boolean;
begin
  if v_solicitante is null then raise exception 'Sesión no válida'; end if;

  select * into v_yo from perfiles where id = v_solicitante;
  if v_yo.id is null then raise exception 'Sesión no válida'; end if;

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué necesita este expediente (una frase). Es lo que va a leer quien lo tiene hoy.';
  end if;
  v_motivo := btrim(p_motivo);

  select * into v_op from oportunidades where id = p_oportunidad_id for update;
  if v_op.id is null then raise exception 'Ese expediente no existe'; end if;
  if v_op.comercial_id = v_solicitante then
    raise exception 'Este expediente ya es suyo: puede anotar la gestión directamente.';
  end if;

  select * into v_cuenta from cuentas where id = v_op.cuenta_id;
  select * into v_antes from perfiles where id = v_op.comercial_id;

  -- QUIÉN PUEDE PEDIRLO. Es la misma gente que ya lo ve (políticas
  -- `oportunidades_servicios_select` y `oportunidades_comercial_select`), no
  -- una puerta nueva: acá solo se comprueba a mano porque la función corre
  -- como definer y la RLS no la mira.
  v_puede := coalesce(es_backoffice(), false)
          or (v_op.tipo_postventa is not null and coalesce(puede_postventa(), false))
          or (v_cuenta.comercial_id = v_solicitante);
  if not v_puede then
    raise exception 'Este expediente no es de su área. Pídaselo a gerencia.';
  end if;

  -- El banco de pruebas no se mezcla con la cartera real, ni al revés (01-09).
  if coalesce(v_yo.es_prueba, false) <> coalesce(v_antes.es_prueba, false) then
    raise exception 'Uno de los dos es del banco de pruebas. Eso no se mezcla con la cartera real.';
  end if;

  -- LO QUE TIENE PLATA ENCIMA NO SE MUEVE ACÁ. El dueño de un expediente con
  -- venta es de quién es esa venta; cambiarlo con un código de diez minutos
  -- movería una cifra que gerencia mira todos los meses.
  if exists (select 1 from ventas v where v.oportunidad_id = v_op.id) then
    raise exception 'Este expediente ya tiene una venta registrada: cambiar de dueño cambiaría de quién es esa venta. Eso lo mueve gerencia.';
  end if;
  if exists (select 1 from informes_cierre i where i.oportunidad_id = v_op.id and i.emitido_at is not null) then
    raise exception 'Este expediente ya tiene un informe de cierre emitido. Eso lo mueve gerencia.';
  end if;

  -- ── El código del supervisor, igual que en 0195 y 0200 ──────────────────
  if v_libre then
    -- Gerencia levantó el código por el día (0111): queda anotado igual, y el
    -- motivo dice que salió sin código.
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
      v_supervisor, v_solicitante, v_ventana_ok, 'pedir_expediente',
      v_op.comercial_id, v_solicitante,
      format('[expediente de %s] %s', coalesce(v_cuenta.razon_social, 'cliente sin nombre'), v_motivo)
    );
  exception when unique_violation then
    raise exception 'Ese código ya se usó. Cada autorización sirve para una sola: pida uno nuevo.';
  end;

  -- ── El expediente cambia de dueño. La ficha del cliente NO. ─────────────
  update oportunidades set comercial_id = v_solicitante, updated_at = now() where id = v_op.id;

  -- Queda escrito DENTRO del expediente, que es donde lo va a leer el que
  -- entre después: el historial de gestión es la memoria del caso.
  insert into actividades (oportunidad_id, tipo, nota, realizada_por)
  values (
    v_op.id, 'nota',
    format('Expediente pasado a %s%s (antes de %s). Motivo: %s',
           coalesce(v_yo.codigo_comercial || ' · ', ''), v_yo.nombre,
           coalesce(v_antes.nombre, 'sin dueño'), v_motivo),
    v_solicitante
  );

  -- Y AL QUE LO TENÍA SE LE AVISA. Enterarse de que un expediente ya no está
  -- porque no aparece en la lista es la forma más rápida de que el área deje
  -- de confiar en el CRM.
  if v_op.comercial_id is not null then
    perform crear_notificacion(
      v_op.comercial_id, null, 'urgencia',
      format('%s tomó un expediente de %s',
             coalesce(v_yo.codigo_comercial, v_yo.nombre),
             coalesce(v_cuenta.razon_social, 'un cliente')),
      v_motivo,
      '/comercial/oportunidades/' || v_op.id
    );
  end if;

  return format('El expediente de %s ya es suyo. Puede anotar la gestión.',
                coalesce(v_cuenta.razon_social, 'este cliente'));
end;
$$;

comment on function public.pedir_expediente(uuid, text, text) is
  'Pasa un expediente al que lo pide, con código de supervisor y motivo escrito (0202). '
  'No mueve la cartera del cliente ni acepta expedientes con venta o informe emitido.';

revoke all on function public.pedir_expediente(uuid, text, text) from public;
grant execute on function public.pedir_expediente(uuid, text, text) to authenticated;
