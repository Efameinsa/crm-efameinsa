-- ============================================================
-- CRM EFAMEINSA · Migración 0092 · Corregir una derivación exige un supervisor
-- ============================================================
-- Pedido del ing. Carlos, reunión 27-08, con su propia analogía: «como en la
-- caja de Plaza Vea, oye me equivoqué, quiero eliminar un producto porque puse
-- duplicado; llamo a su supervisor, viene y ya está. Un pin, cuatro dígitos».
--
-- EL CASO QUE LO ORIGINÓ. Un contacto del 25-08 pedía MANTENIMIENTO y Central
-- lo derivó a comercial porque el sistema mostró coincidencia con un cliente al
-- que ya se le había cotizado equipos. No lo leyó al detalle. Error humano, no
-- del sistema — y la migración 0079 ya permitía corregirlo. El problema es que
-- se corregía SOLO: «si no, no vamos a poder medir». Una equivocación que se
-- arregla en silencio no existe para nadie, y por lo tanto no se corrige nunca.
--
-- ------------------------------------------------------------
-- POR QUÉ UN CÓDIGO QUE ROTA Y NO UNA CLAVE FIJA
-- ------------------------------------------------------------
-- Idea de Darwin: un PIN que cambia solo, visible en la pantalla del supervisor,
-- con su relojito, como el token del banco. Gana por tres lados:
--
--   · NO HAY QUE ENROLAR A NADIE. El día que esto sube, funciona: nadie tiene
--     que crear ni recordar una clave. Una clave fija habría dejado a Central
--     sin poder corregir hasta que gerencia configurara la suya.
--   · UNA CLAVE FIJA SE APRENDE. A la tercera vez que Central la escucha ya no
--     llama a nadie y el control queda de adorno. Esta no se puede memorizar.
--   · SE VENCE SOLA. Lo que se vea de reojo o quede en una captura sirve dos
--     minutos.
--
-- Y ES UNO POR SUPERVISOR, derivado de (usuario + ventana). Si fuese un código
-- único de «gerencia», la autorización solo probaría que alguien estuvo cerca de
-- una pantalla; así el sistema sabe CUÁL de los dos autorizó, sin pedirle nada
-- a nadie. Eso es lo que hace medible el error, que es lo que se pidió.
--
-- DOS MINUTOS, con la ventana anterior también válida: el código viaja por
-- teléfono y no puede vencerse mientras se dicta (mismo criterio que cualquier
-- token TOTP). Y SE QUEMA AL USARSE — la restricción única sobre
-- (supervisor, ventana). Sin eso, con un código Central corregiría cinco cosas
-- seguidas y el control se cumpliría una sola vez.
--
-- CUATRO DÍGITOS SON 10.000 COMBINACIONES: para una persona es imposible, para
-- un script no. Por eso hay tope de intentos fallidos, y los fallos quedan
-- registrados.

-- ------------------------------------------------------------
-- 1. La semilla del código. No sale nunca de la base.
-- ------------------------------------------------------------
create table if not exists config_seguridad (
  clave     text primary key,
  valor     text not null,
  creado_at timestamptz not null default now()
);

-- RLS activo y SIN POLÍTICAS a propósito: nadie la lee por la API. Solo la
-- alcanzan las funciones de abajo, que son security definer. Si la semilla se
-- pudiera leer, cualquiera calcularía los códigos de todos los supervisores.
alter table config_seguridad enable row level security;

insert into config_seguridad (clave, valor)
values (
  'semilla_pin_supervisor',
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
)
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- 2. El registro de autorizaciones: la tranca y, sobre todo, la medición
-- ------------------------------------------------------------
-- El PIN evita que se corrija a escondidas; esta tabla es la que se va a leer
-- el día que gerencia quiera saber cuánto se está equivocando Central y por
-- qué. De ahí que el motivo sea obligatorio.
create table if not exists autorizaciones_supervisor (
  id                 uuid primary key default gen_random_uuid(),
  supervisor_id      uuid not null references perfiles (id),
  solicitante_id     uuid not null references perfiles (id),
  ventana            bigint not null,
  accion             text not null,
  lead_id            uuid references leads (id) on delete set null,
  comercial_anterior uuid references perfiles (id),
  comercial_nuevo    uuid references perfiles (id),
  motivo             text not null,
  creado_at          timestamptz not null default now(),
  -- ACÁ SE QUEMA EL CÓDIGO: un (supervisor, ventana) se usa una sola vez.
  constraint pin_de_un_solo_uso unique (supervisor_id, ventana)
);
alter table autorizaciones_supervisor enable row level security;

drop policy if exists autorizaciones_lectura on autorizaciones_supervisor;
create policy autorizaciones_lectura on autorizaciones_supervisor
  for select using (
    exists (select 1 from perfiles p where p.id = auth.uid() and p.rol::text in ('gerencia', 'admin'))
  );

-- Los fallos también se guardan: alimentan el tope de intentos y avisan si
-- alguien está probando códigos a mano.
create table if not exists intentos_pin_supervisor (
  id             uuid primary key default gen_random_uuid(),
  solicitante_id uuid not null references perfiles (id),
  creado_at      timestamptz not null default now()
);
alter table intentos_pin_supervisor enable row level security;
create index if not exists ix_intentos_pin_recientes
  on intentos_pin_supervisor (solicitante_id, creado_at desc);

-- ------------------------------------------------------------
-- 3. El código: cuatro dígitos de (semilla + supervisor + ventana)
-- ------------------------------------------------------------
-- Se sacan los dígitos del md5 en vez de hacer aritmética de bits: no es un
-- hash de contraseña —es un código de dos minutos y un solo uso— y así no hay
-- desbordes ni signos negativos que corregir.
create or replace function codigo_pin_supervisor(p_supervisor uuid, p_ventana bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select substr(
           regexp_replace(md5(c.valor || p_supervisor::text || '|' || p_ventana::text), '[^0-9]', '', 'g') || '0000',
           1, 4)
    from config_seguridad c
   where c.clave = 'semilla_pin_supervisor';
$$;
revoke all on function codigo_pin_supervisor(uuid, bigint) from public;

create or replace function ventana_pin_actual()
returns bigint
language sql
stable
set search_path = public
as $$ select floor(extract(epoch from now()) / 120)::bigint $$;

-- ------------------------------------------------------------
-- 4. Lo que ve el supervisor en su barra lateral
-- ------------------------------------------------------------
create or replace function mi_pin_supervisor()
returns table (codigo text, expira_en integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rol text;
begin
  select p.rol::text into v_rol from perfiles p where p.id = auth.uid();
  if v_rol is null or v_rol not in ('gerencia', 'admin') then
    raise exception 'Solo gerencia puede autorizar correcciones';
  end if;

  return query
    select codigo_pin_supervisor(auth.uid(), ventana_pin_actual()),
           (120 - (floor(extract(epoch from now()))::bigint % 120))::integer;
end $$;
revoke all on function mi_pin_supervisor() from public;
grant execute on function mi_pin_supervisor() to authenticated;

-- ------------------------------------------------------------
-- 5. Redirigir, ahora con autorización
-- ------------------------------------------------------------
-- Envuelve a `redirigir_lead` (0079), que sigue teniendo la última palabra
-- sobre si el traspaso se puede hacer —no cotizó, no gestionó, el cliente no
-- tiene historia—. Acá arriba solo se resuelve QUIÉN lo autorizó y POR QUÉ.
create or replace function redirigir_lead_con_pin(
  p_lead_id      uuid,
  p_comercial_id uuid,
  p_pin          text,
  p_motivo       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_solicitante uuid := auth.uid();
  v_ventana     bigint := ventana_pin_actual();
  v_supervisor  uuid;
  v_ventana_ok  bigint;
  v_fallidos    integer;
  v_anterior    uuid;
  v_resultado   uuid;
  v_pin         text := regexp_replace(coalesce(p_pin, ''), '[^0-9]', '', 'g');
  v_sup         record;
begin
  if v_solicitante is null then
    raise exception 'Sesión no válida';
  end if;

  -- El motivo es el material del análisis: sin él esto sería solo una tranca.
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escriba por qué se está corrigiendo la derivación (mínimo una frase). Es lo que va a leer gerencia.';
  end if;

  select count(*) into v_fallidos
    from intentos_pin_supervisor
   where solicitante_id = v_solicitante
     and creado_at > now() - interval '10 minutes';
  if v_fallidos >= 5 then
    raise exception 'Demasiados códigos incorrectos. Espere unos minutos y pida uno nuevo al supervisor.';
  end if;

  if length(v_pin) <> 4 then
    insert into intentos_pin_supervisor (solicitante_id) values (v_solicitante);
    raise exception 'El código de autorización son cuatro dígitos.';
  end if;

  -- La ventana anterior también vale: el código se dicta por teléfono y no
  -- puede vencerse en la mitad de la frase.
  for v_sup in
    select p.id from perfiles p
     where p.rol::text in ('gerencia', 'admin') and p.activo
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

  select asignado_a into v_anterior from leads where id = p_lead_id;

  -- Se anota ANTES de mover nada: si el código ya se había usado, la
  -- restricción única lo detiene acá y la derivación no se toca.
  begin
    insert into autorizaciones_supervisor (
      supervisor_id, solicitante_id, ventana, accion, lead_id,
      comercial_anterior, comercial_nuevo, motivo
    ) values (
      v_supervisor, v_solicitante, v_ventana_ok, 'redirigir_lead', p_lead_id,
      v_anterior, p_comercial_id, btrim(p_motivo)
    );
  exception when unique_violation then
    raise exception 'Ese código ya se usó. Cada autorización sirve para una sola corrección: pida uno nuevo.';
  end;

  v_resultado := redirigir_lead(p_lead_id, p_comercial_id);
  return v_resultado;
end $$;

revoke all on function redirigir_lead_con_pin(uuid, uuid, text, text) from public;
grant execute on function redirigir_lead_con_pin(uuid, uuid, text, text) to authenticated;

-- Y la puerta de atrás se cierra: sin esto, la pantalla podría seguir llamando
-- a la versión sin autorización y todo lo de arriba sería decorativo.
revoke execute on function redirigir_lead(uuid, uuid) from authenticated;

comment on table autorizaciones_supervisor is
  'Cada corrección de derivación autorizada por un supervisor: quién la pidió, quién la autorizó y por qué (migración 0092).';
