-- 0496 · Los correos de campaña en la ficha del cliente (Santos, 15-10).
-- «El CRM debe tener un widget donde se vean las acciones de este tipo, un historial
-- aparte: si abrió el correo y qué correo abrió, con un link (plantilla inmutable, solo
-- para que el comercial tenga referencia)».
--
-- Lo llena mkt.efameinsa.com (el puente del despacho, cada minuto, con la llave de
-- servicio). El CRM solo lo lee:
--  · correos_campana: la copia FIJA de cada correo tal como salió. Se inserta una vez y
--    no se puede cambiar (si la plantilla se corrige después, lo que recibió el cliente
--    sigue siendo esto).
--  · correos_campana_recibidos: por cada persona y correo, qué pasó (enviado, entregado,
--    abrió, clic y en qué botón, baja, rebote, queja).
-- Y cuando alguien hace clic por primera vez, el comercial dueño de la cartera recibe un
-- aviso en la campana: el clic es la señal de interés que vale (las aperturas son
-- aproximadas: algunos programas de correo abren solos).

create table if not exists public.correos_campana (
  id          uuid primary key,              -- el id del envío en mkt
  codigo      text,                          -- G1, H2, R1H…
  nombre      text not null,
  asunto      text not null,
  preheader   text not null default '',
  html        text not null,
  enviado_at  timestamptz,
  copiado_at  timestamptz not null default now()
);

create or replace function public.correos_campana_inmutable() returns trigger
language plpgsql as $$
begin
  raise exception 'La copia de un correo enviado no se cambia (es lo que recibió el cliente)';
end $$;
drop trigger if exists correos_campana_inmutable on public.correos_campana;
create trigger correos_campana_inmutable before update on public.correos_campana
  for each row execute function public.correos_campana_inmutable();

create table if not exists public.correos_campana_recibidos (
  id            uuid primary key,            -- el id del destinatario en mkt
  correo_id     uuid not null references public.correos_campana (id),
  email         text not null,
  cuenta_id     uuid references public.cuentas (id) on delete set null,
  datos         jsonb not null default '{}'::jsonb,   -- {{nombre}}, {{empresa}}… con que salió
  enviado_at    timestamptz,
  entregado_at  timestamptz,
  abierto_at    timestamptz,
  aperturas     integer not null default 0,
  clic_at       timestamptz,
  clics         integer not null default 0,
  enlaces       jsonb not null default '[]'::jsonb,   -- [{texto, url, at}] en qué hizo clic
  baja_at       timestamptz,
  rebotado_at   timestamptz,
  rebote_tipo   text,
  queja_at      timestamptz,
  aviso_clic_at timestamptz,                 -- cuándo se avisó al comercial del primer clic
  actualizado_at timestamptz not null default now()
);
create index if not exists ix_correos_recibidos_cuenta on public.correos_campana_recibidos (cuenta_id, enviado_at desc);
create index if not exists ix_correos_recibidos_email on public.correos_campana_recibidos (lower(email));

-- Si mkt no supo de qué cuenta es, se busca por el correo en los contactos del CRM.
-- Y al primer clic, aviso al comercial dueño de la cartera.
create or replace function public.correos_recibidos_al_guardar() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_cuenta record;
  v_correo record;
  v_boton text;
begin
  new.email := lower(new.email);
  new.actualizado_at := now();
  if new.cuenta_id is null then
    select c.cuenta_id into new.cuenta_id
      from contactos c where lower(c.email) = new.email and c.cuenta_id is not null
      order by c.created_at limit 1;
  end if;
  if new.clic_at is not null and new.aviso_clic_at is null
     and (tg_op = 'INSERT' or old.clic_at is null) and new.cuenta_id is not null then
    select id, razon_social, comercial_id into v_cuenta from cuentas where id = new.cuenta_id;
    select codigo, asunto into v_correo from correos_campana where id = new.correo_id;
    v_boton := nullif(new.enlaces -> 0 ->> 'texto', '');
    if v_cuenta.comercial_id is not null then
      insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
      select p.id, 'correo_campana_clic',
             'Hizo clic en un correo: ' || coalesce(v_cuenta.razon_social, new.email),
             new.email || ' hizo clic' || coalesce(' en «' || v_boton || '»', '') || ' del correo '
               || coalesce(v_correo.codigo || ' ', '') || '«' || coalesce(v_correo.asunto, '') || '». Buen momento para llamarle.',
             '/nuevo/cliente/' || new.cuenta_id || '?tab=correos'
        from perfiles p
       where p.id = v_cuenta.comercial_id and p.activo and not coalesce(p.es_prueba, false);
    end if;
    new.aviso_clic_at := now();
  end if;
  return new;
end $$;
drop trigger if exists correos_recibidos_al_guardar on public.correos_campana_recibidos;
create trigger correos_recibidos_al_guardar before insert or update on public.correos_campana_recibidos
  for each row execute function public.correos_recibidos_al_guardar();

-- Lectura: quien ve la cuenta (su comercial, gerencia/admin, Central y postventa). Las
-- filas sin cuenta solo las ve gerencia/admin. Escritura: solo la llave de servicio (mkt).
alter table public.correos_campana enable row level security;
alter table public.correos_campana_recibidos enable row level security;

drop policy if exists correos_campana_lectura on public.correos_campana;
create policy correos_campana_lectura on public.correos_campana for select to authenticated using (true);

drop policy if exists correos_recibidos_lectura on public.correos_campana_recibidos;
create policy correos_recibidos_lectura on public.correos_campana_recibidos for select to authenticated
  using (
    (select es_backoffice())
    or exists (
      select 1 from cuentas c
       where c.id = cuenta_id
         and (c.comercial_id = (select auth.uid())
              or (select rol_actual()) = 'central'
              or ((select es_postventa()) and not (select es_cuenta_prueba())))
    )
  );

revoke all on public.correos_campana, public.correos_campana_recibidos from anon;
grant select on public.correos_campana, public.correos_campana_recibidos to authenticated;
grant all on public.correos_campana, public.correos_campana_recibidos to service_role;

insert into _migraciones_aplicadas (archivo) values ('0496_correos_de_campana_en_la_ficha.sql')
on conflict do nothing;
