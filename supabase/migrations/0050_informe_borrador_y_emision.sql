-- ============================================================
-- CRM EFAMEINSA · Migración 0050 · El informe nace como borrador
-- ============================================================
-- La 0049 asignaba el correlativo al INSERTAR. Con eso, cada vez que el
-- comercial abriera el formulario y guardara para mirar el borrador se
-- quemaría un número: al cabo de un mes la serie tendría huecos y Central
-- recibiría el Nº 012 sin haber visto nunca el 009, el 010 ni el 011.
--
-- Es exactamente la queja del ing. Carlos sobre los presupuestos ("cliente A
-- la 100, cliente B la 100", 125 correlativos duplicados en 2026). Un número
-- se gasta cuando el documento SALE, no cuando alguien lo está escribiendo.
--
-- Entonces: el informe se crea sin número y se puede editar todas las veces
-- que haga falta; `emitir_informe()` le asigna el correlativo una sola vez y
-- lo congela. Antes de emitir, el PDF se imprime con "BORRADOR" en lugar del
-- número, para que no haya manera de confundir un borrador con el documento
-- que se le mandó a Central.

alter table informes_cierre
  alter column correlativo drop not null,
  alter column correlativo drop default,
  add column if not exists emitido_at timestamptz;

comment on column informes_cierre.correlativo is
  'NULL mientras es borrador. Lo asigna emitir_informe(); un número se gasta cuando el documento sale, no mientras se escribe.';
comment on column informes_cierre.emitido_at is
  'Cuándo se emitió. NULL = borrador, todavía editable.';

-- El trigger de la 0049 numeraba al insertar: se reemplaza por uno que impide
-- que nadie ponga el número a mano.
drop trigger if exists trg_informe_correlativo on informes_cierre;
drop function if exists asignar_correlativo_informe();

create or replace function emitir_informe(p_id uuid)
returns text language plpgsql security definer set search_path = public as $fn$
declare
  v_informe informes_cierre%rowtype;
  v_correlativo integer;
begin
  select * into v_informe from informes_cierre where id = p_id;
  if v_informe is null then
    raise exception 'Informe no encontrado';
  end if;
  -- Autorización: la misma regla de las políticas RLS, repetida acá porque la
  -- función es security definer y se salta RLS.
  if not es_backoffice()
     and not exists (select 1 from cuentas c where c.id = v_informe.cuenta_id and c.comercial_id = auth.uid()) then
    raise exception 'No autorizado para emitir este informe';
  end if;
  -- Emitir dos veces devolvería el mismo documento con dos números.
  if v_informe.emitido_at is not null then
    raise exception 'El informe % ya fue emitido', v_informe.codigo;
  end if;
  if jsonb_array_length(v_informe.items) = 0 then
    raise exception 'El informe necesita al menos un equipo';
  end if;

  v_correlativo := siguiente_correlativo_informe(v_informe.serie, v_informe.anio);
  update informes_cierre
     set correlativo = v_correlativo, emitido_at = now()
   where id = p_id;

  return lpad(v_correlativo::text, 3, '0') || '-' || v_informe.anio::text;
end;
$fn$;

-- Un informe emitido no se toca: es lo que Central ya tiene en la mano. Misma
-- regla que la inmutabilidad de las cotizaciones (migración 0012).
create or replace function bloquear_edicion_informe()
returns trigger language plpgsql as $fn$
begin
  if old.emitido_at is not null and new.emitido_at is not null then
    raise exception 'El informe % ya fue emitido y no se modifica', old.codigo;
  end if;
  return new;
end;
$fn$;

create trigger trg_informe_inmutable
  before update on informes_cierre
  for each row execute function bloquear_edicion_informe();

-- El borrador también se borra: si el comercial se arrepiente antes de
-- emitir, no tiene por qué quedar basura en la lista del cliente. Después de
-- emitido, no.
create policy informes_borra on informes_cierre for delete to authenticated
  using (
    emitido_at is null
    and ((select es_backoffice())
         or exists (select 1 from cuentas c
                    where c.id = informes_cierre.cuenta_id and c.comercial_id = (select auth.uid())))
  );

-- El de prueba de MARINASOL se creó bajo la regla vieja: se marca emitido para
-- que no quede como un borrador eterno con número ya gastado.
update informes_cierre set emitido_at = created_at where emitido_at is null and correlativo is not null;
