-- 0236 · El correo del lead llega a la ficha (Santos, 14-09-2026).
--
-- Central derivó PRO-09350 (cotizacionesequiposbiomedicos@gmail.com, entró por la
-- calculadora de la web sin teléfono) y la comercial no veía el correo: la ficha
-- quedó SIN NINGÚN CONTACTO. `asignar_lead` solo creaba el contacto cuando el
-- lead traía teléfono; y si ya había un contacto con ese teléfono pero sin
-- correo, tampoco lo completaba. Desde agosto son 210 leads derivados cuyo
-- correo no está en los contactos de su ficha.
--
-- Regla nueva, en la función viva (se parcha la definición, no se copia):
--   · con teléfono: si no hay contacto con ese número se crea (como antes) y, si
--     ya hay uno sin correo, se le pone el correo del lead;
--   · sin teléfono pero con correo: se crea el contacto con el correo, si la
--     ficha no lo tiene ya.
-- Y se rellena lo que ya quedó atrás con la misma regla.

do $$
declare
  v_def text;
  v_nueva text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'asignar_lead';

  v_nueva := replace(v_def,
$viejo$  if length(coalesce(v_lead.telefono_normalizado, '')) >= 6 and not exists (
    select 1 from contactos ct
    where ct.cuenta_id = v_cuenta_id and ct.telefono_normalizado = v_lead.telefono_normalizado
  ) then
    insert into contactos (cuenta_id, nombre, telefono, email, es_principal)
    values (v_cuenta_id, coalesce(v_lead.nombre_contacto, 'Contacto'), v_lead.telefono, v_lead.email, true);
  end if;$viejo$,
$nuevo$  -- 0236: el correo del lead siempre llega a la ficha. Con teléfono, se crea el
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
  end if;$nuevo$);
  if v_nueva = v_def then raise exception 'asignar_lead: no se encontró el bloque del contacto'; end if;
  execute v_nueva;
end $$;

-- ── Relleno: las fichas que ya quedaron sin el correo del lead ────────────────
-- 1. Contacto con el mismo teléfono y sin correo → se le pone el del lead.
with pendientes as (
  select distinct on (l.cuenta_id, l.telefono_normalizado)
         l.cuenta_id, l.telefono_normalizado, trim(l.email) as email
    from leads l
   where l.cuenta_id is not null
     and nullif(trim(l.email), '') is not null
     and length(coalesce(l.telefono_normalizado, '')) >= 6
   order by l.cuenta_id, l.telefono_normalizado, l.recibido_at desc
)
update contactos ct
   set email = p.email
  from pendientes p
 where ct.cuenta_id = p.cuenta_id
   and ct.telefono_normalizado = p.telefono_normalizado
   and nullif(trim(ct.email), '') is null;

-- 2. Lead con correo (con o sin teléfono) cuyo correo no está en ningún contacto
--    de su ficha → contacto nuevo. Principal solo si la ficha no tenía ninguno.
insert into contactos (cuenta_id, nombre, telefono, email, es_principal)
select distinct on (l.cuenta_id, lower(trim(l.email)))
       l.cuenta_id,
       coalesce(nullif(trim(l.nombre_contacto), ''), 'Contacto'),
       case when length(coalesce(l.telefono_normalizado, '')) >= 6 then l.telefono end,
       trim(l.email),
       not exists (select 1 from contactos c2 where c2.cuenta_id = l.cuenta_id and c2.es_principal)
  from leads l
 where l.cuenta_id is not null
   and nullif(trim(l.email), '') is not null
   and not exists (
     select 1 from contactos ct
      where ct.cuenta_id = l.cuenta_id and lower(trim(ct.email)) = lower(trim(l.email))
   )
   and not exists (
     -- si ya hay contacto con ese teléfono, el paso 1 le puso el correo (o tenía otro): no se duplica
     select 1 from contactos ct
      where ct.cuenta_id = l.cuenta_id
        and length(coalesce(l.telefono_normalizado, '')) >= 6
        and ct.telefono_normalizado = l.telefono_normalizado
   )
 order by l.cuenta_id, lower(trim(l.email)), l.recibido_at desc;
