-- CORREGIR CÓMO ENTRÓ UN CONTACTO, CON CÓDIGO Y DEJANDO RASTRO.
--
-- Santos, 08-09: «la señorita de Central hizo mal una derivación porque lo
-- registró como que entraba por WhatsApp cuando realmente entró por llamada».
-- Es el caso de EMPRESA MINERA LOS QUENUALES que encontró el ing. Carlos: le
-- pidió la evidencia del WhatsApp, no existía, y ella terminó reconociendo que
-- se equivocó al registrar la llamada. Hasta hoy no había forma de arreglarlo.
--
-- POR QUÉ CON CÓDIGO. El canal es justamente el dato que gerencia está usando
-- para auditar: «dice WhatsApp, pásame el WhatsApp». Si se pudiera cambiar sin
-- más, la auditoría dejaría de valer — bastaría con corregir el canal después
-- de que se lo pidan. Con código de supervisor y con motivo escrito, corregir
-- un error honesto es fácil y tapar uno es imposible sin que quede la firma.
--
-- Y SOBRE TODO: DEJA RASTRO. Es la diferencia entre corregir y borrar. Cada
-- corrección se guarda en `autorizaciones_supervisor` con quién la pidió,
-- quién la autorizó, de qué canal a cuál y por qué. El PIN sigue siendo de un
-- solo uso (la restricción `pin_de_un_solo_uso` ya lo garantiza).
--
-- Se apoya en lo que ya existe y no se copia nada: `pin_libre_hasta()` para la
-- ventana en que gerencia levanta el código, y la misma tabla de
-- autorizaciones que usa la corrección de la derivación (0092/0116).

create or replace function public.corregir_canal_lead(
  p_lead_id uuid,
  p_canal   text,
  p_pin     text,
  p_motivo  text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitante uuid := auth.uid();
  v_ventana     bigint := ventana_pin_actual();
  v_pin         text := regexp_replace(coalesce(p_pin, ''), '[^0-9]', '', 'g');
  v_libre       boolean := pin_libre_hasta() is not null;
  v_supervisor  uuid;
  v_ventana_ok  bigint;
  v_fallidos    integer;
  v_sup         record;
  v_anterior    text;
  v_motivo      text;
begin
  if v_solicitante is null then raise exception 'Sesión no válida'; end if;

  -- Quién puede pedirlo: quien registra y deriva. El comercial no corrige el
  -- canal de un contacto ajeno.
  if not (coalesce(rol_actual() = 'central', false) or coalesce(es_backoffice(), false)) then
    raise exception 'Solo Central o gerencia pueden corregir cómo entró un contacto';
  end if;

  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué se corrige (mínimo una frase). Es lo que va a leer gerencia.';
  end if;
  v_motivo := btrim(p_motivo);

  select canal::text into v_anterior from leads where id = p_lead_id;
  if v_anterior is null then raise exception 'Ese contacto no existe'; end if;
  if v_anterior = p_canal then
    raise exception 'El contacto ya figura como «%». No hay nada que corregir.', p_canal;
  end if;

  if v_libre then
    -- Gerencia levantó el código por el día (0111): queda anotado igual, y se
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

    -- Lo dictan gerencia, admin y operaciones, igual que la corrección de la
    -- derivación desde la 0116: para Central es el mismo código de siempre.
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

  -- EL RASTRO, que es el punto de todo esto. De qué canal a cuál, quién lo
  -- pidió, quién lo autorizó y por qué.
  begin
    insert into autorizaciones_supervisor (
      supervisor_id, solicitante_id, ventana, accion, lead_id, motivo
    ) values (
      v_supervisor, v_solicitante, v_ventana_ok, 'corregir_canal', p_lead_id,
      format('[canal: %s → %s] %s', v_anterior, p_canal, v_motivo)
    );
  exception when unique_violation then
    raise exception 'Ese código ya se usó. Cada autorización sirve para una sola corrección: pida uno nuevo.';
  end;

  update leads set canal = p_canal::canal_contacto where id = p_lead_id;
  return p_canal;
end $$;

comment on function public.corregir_canal_lead(uuid, text, text, text) is
  'Corrige por dónde entró un contacto (llamada, WhatsApp, correo…) con código de supervisor y motivo escrito. Deja el rastro en autorizaciones_supervisor: el canal es el dato con el que gerencia audita, así que cambiarlo tiene que poder verse.';

revoke all on function public.corregir_canal_lead(uuid, text, text, text) from public;
grant execute on function public.corregir_canal_lead(uuid, text, text, text) to authenticated;
