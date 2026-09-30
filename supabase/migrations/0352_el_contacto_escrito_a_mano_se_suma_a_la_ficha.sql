-- ============================================================
-- CRM EFAMEINSA · Migración 0352 · El contacto escrito a mano se suma a la ficha
-- ============================================================
-- 30-09-2026, ing. Carlos (12:35): «que jale el nombre de la persona de la
-- ficha, y si no estuviera… escríbelo manualmente. Ahora que se registre la
-- próxima vez: tú hoy día ingresas algo manual, tiene que sumar al contacto.
-- Para que no quede en el limbo esta nueva persona de contacto de logística…
-- en comercial sucede mucho: ya cambiaron el logístico». Y se preguntó
-- «¿cómo lo vamos a registrar? ¿contacto de tercera categoría?». Lesly: puede
-- ser un técnico o el electricista del cliente, que no es contacto comercial.
--
-- Desde 9908d16 postventa escribe a mano a quién llama el almacén (y en el
-- despacho, quién recibe). Ese nombre y celular quedaban solo en la apertura
-- o en el pedido: la próxima vez nadie lo encontraba en la ficha.
--
-- La respuesta a la duda de Carlos: una CATEGORÍA en el contacto.
--   · 'comercial' — los de siempre (todos los que ya existen). Son a quienes
--     se cotiza; uno de ellos es el principal.
--   · 'operativo' — reciben despachos, atienden al técnico, coordinan la
--     logística. Los suma postventa o el almacén al escribirlos. NUNCA son el
--     principal (el «Atención:» de la cotización sigue siendo comercial), no
--     cambian al dueño de la cartera ni abren ficha. El comercial los pasa a
--     comercial con un clic si resulta que ese «logístico» ahora le compra.
--
-- Lo que NO cambia a propósito: el cruce por teléfono de la bandeja
-- (asignar_lead, 0214/0201) sigue viendo a los operativos. Si el logístico
-- nuevo escribe por WhatsApp, su consulta cae en la ficha de SU cliente y no
-- abre una ficha partida; eso no mueve la cartera (la ficha conserva su
-- comercial, 0107). El aviso de «la misma persona por otra puerta» (0344)
-- compara leads por nombre, no lee `contactos`: no se entera de esto.
-- ============================================================

-- 1. La categoría y el rastro de quién lo sumó.
alter table public.contactos
  add column if not exists categoria    text not null default 'comercial',
  add column if not exists origen       text,
  add column if not exists agregado_por uuid references public.perfiles (id) on delete set null,
  add column if not exists agregado_at  timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contactos_categoria_valida') then
    alter table public.contactos
      add constraint contactos_categoria_valida check (categoria in ('comercial', 'operativo'));
  end if;
  -- El principal es el que sale en la cotización: un operativo no puede serlo.
  if not exists (select 1 from pg_constraint where conname = 'contactos_operativo_no_es_principal') then
    alter table public.contactos
      add constraint contactos_operativo_no_es_principal check (categoria = 'comercial' or not es_principal);
  end if;
end $$;

comment on column public.contactos.categoria is
  '0352: comercial (a quien se cotiza; los de siempre) u operativo (recibe despachos, técnico, logística del cliente; lo suma postventa/almacén al escribirlo a mano). Un operativo nunca es el principal.';
comment on column public.contactos.origen is
  '0352: de dónde salió un contacto sumado a mano: apertura, direccion_verificada, programar_despacho, despacho.';
comment on column public.contactos.agregado_por is '0352: quién lo sumó a la ficha (postventa, almacén…).';
comment on column public.contactos.agregado_at is '0352: cuándo se sumó.';

-- 2. Sumarlo. Idempotente: el mismo celular (últimos 9 dígitos) ya en la
--    ficha no se repite aunque venga con otro nombre (quien lo escribió pudo
--    poner «Juan» y en la ficha dice «Juan Pérez Gonzales»). Si en la ficha
--    está la misma persona SIN teléfono, se le completa el número a ese.
create or replace function public.sumar_contacto_operativo(
  p_cuenta   uuid,
  p_nombre   text,
  p_telefono text,
  p_origen   text,
  p_cargo    text default null
) returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quien   uuid := auth.uid();
  v_digitos text := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  v_ult9    text;
  v_nombre  text := nullif(btrim(regexp_replace(coalesce(p_nombre, ''), '[[:space:]]+', ' ', 'g')), '');
  v_cargo   text := nullif(btrim(coalesce(p_cargo, '')), '');
  v_mismo   uuid;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if p_cuenta is null then return 'sin_cliente'; end if;

  -- Los mismos que ya anotan teléfonos desde la ruta (anotar_telefono_de_ruta),
  -- más el almacén y operaciones, que también registran quién recibe.
  if not exists (
    select 1 from cuentas c
     where c.id = p_cuenta
       and (
         c.comercial_id = v_quien
         or es_backoffice()
         or coalesce(es_almacen(), false)
         or coalesce(es_operaciones(), false)
         or (puede_postventa() and postventa_tiene_caso(p_cuenta))
         or (es_postventa() and not es_cuenta_prueba())
       )
  ) then
    raise exception 'No puede sumar contactos a este cliente';
  end if;

  -- «no tiene», «ver con el técnico» o un anexo no son un celular.
  if length(v_digitos) < 6 then return 'sin_telefono'; end if;
  if length(v_digitos) > 15 then return 'sin_telefono'; end if;
  v_ult9 := right(v_digitos, 9);
  if v_nombre is null or v_nombre !~ '[[:alpha:]]{2}' then v_nombre := 'Sin nombre'; end if;
  v_nombre := left(v_nombre, 120);

  -- Dos pestañas mandando lo mismo a la vez no crean dos filas.
  perform pg_advisory_xact_lock(hashtext('contacto_operativo:' || p_cuenta::text || ':' || v_ult9));

  if exists (
    select 1 from contactos ct
     where ct.cuenta_id = p_cuenta
       and ct.telefono is not null
       and (right(regexp_replace(ct.telefono, '[^0-9]', '', 'g'), 9) = v_ult9
            -- «987654321 / 01 4411111»: cualquiera de sus celulares cuenta.
            or v_ult9 = any(celulares_de(ct.telefono)))
  ) then
    return 'ya_estaba';
  end if;

  -- La misma persona ya en la ficha, pero sin número: se le completa.
  if v_nombre <> 'Sin nombre' then
    select ct.id into v_mismo
      from contactos ct
     where ct.cuenta_id = p_cuenta
       and (ct.telefono is null or btrim(ct.telefono) = '')
       and nombre_normalizado(ct.nombre) = nombre_normalizado(v_nombre)
     order by ct.es_principal desc, ct.created_at
     limit 1;
    if v_mismo is not null then
      update contactos set telefono = btrim(p_telefono) where id = v_mismo;
      return 'completado';
    end if;
  end if;

  insert into contactos (cuenta_id, nombre, cargo, telefono, es_principal, categoria, origen, agregado_por, agregado_at)
  values (p_cuenta, v_nombre, v_cargo, btrim(p_telefono), false, 'operativo',
          nullif(btrim(coalesce(p_origen, '')), ''), v_quien, now());
  return 'agregado';
end $$;

comment on function public.sumar_contacto_operativo(uuid, text, text, text, text) is
  '0352 (Carlos, 30-09): el nombre y celular que postventa/almacén escriben a mano (apertura, quién recibe) se suman a la ficha como contacto operativo. Idempotente por los últimos 9 dígitos. Devuelve agregado | completado | ya_estaba | sin_telefono | sin_cliente.';

revoke all on function public.sumar_contacto_operativo(uuid, text, text, text, text) from public, anon;
grant execute on function public.sumar_contacto_operativo(uuid, text, text, text, text) to authenticated;
-- Mismo dueño que las vecinas: en la VM la migración corre como supabase_admin (ver 0343).
alter function public.sumar_contacto_operativo(uuid, text, text, text, text) owner to postgres;
