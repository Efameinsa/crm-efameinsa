-- ============================================================
-- CRM EFAMEINSA · Migración 0066 · El lugar de entrega se elige por cotización
-- ============================================================
-- Pedido del área comercial el 24-08: «la parte de la cotización que dice
-- "entrega en nuestras instalaciones" debería ser editable: entrega en agencia
-- de transporte de Lima, o en almacenes del cliente».
--
-- CUIDADO CON LA HISTORIA DE ESTA LÍNEA. Esta misma mañana decía «Entrega en
-- agencias en la ciudad de Lima» —lo que traían los modelos viejos en Word— y
-- Brenda la hizo corregir: la entrega es EN PLANTA, y prometer una agencia en
-- Lima es un compromiso de flete que la empresa no estaba asumiendo. O sea que
-- las dos comerciales piden cosas opuestas sobre el mismo texto.
--
-- No se contradicen del todo: lo que estaba mal era tener un texto FIJO que
-- prometía algo que no siempre se cumple. Que se elija por cotización es más
-- correcto que cualquier valor fijo, porque dice lo que de verdad se acordó con
-- ese cliente. Es además como ya funciona del otro lado: el informe de cierre
-- tiene `entrega_lugar` desde la migración 0049.
--
-- POR QUÉ SE GUARDA EL TEXTO Y NO UN CÓDIGO. Si se guardara un código y la
-- redacción viviera en el código fuente, cambiar esa redacción cambiaría el PDF
-- de cotizaciones YA ENVIADAS. Eso rompe lo que venimos cuidando todo el día:
-- un documento que salió al cliente no cambia. Guardando el texto, la
-- cotización se lleva su cláusula congelada.
--
-- NULL = la cláusula de siempre («Entrega en nuestras instalaciones.»), que es
-- la conservadora. Las cotizaciones anteriores a hoy quedan como estaban.

alter table cotizaciones
  add column if not exists entrega_lugar text;

comment on column cotizaciones.entrega_lugar is
  'Cláusula de entrega tal como se imprime en el punto 1 de "Importante". NULL = la de por defecto (en nuestras instalaciones). Se guarda el texto, no un código, para que el documento enviado no cambie si mañana se reescribe la redacción (migración 0066).';

alter table cotizaciones
  drop constraint if exists entrega_lugar_razonable;
alter table cotizaciones
  add constraint entrega_lugar_razonable
  check (entrega_lugar is null or length(btrim(entrega_lugar)) between 5 and 200);

-- La cláusula es parte del documento: se puede cambiar mientras es borrador y
-- queda congelada al enviarlo, igual que el precio y las condiciones.
create or replace function bloquear_edicion_cotizacion()
returns trigger language plpgsql as $$
declare
  v_editable boolean := old.estado = 'borrador' and old.enviada_at is null;
begin
  if new.serie is distinct from old.serie
     or new.oportunidad_id is distinct from old.oportunidad_id
     or new.creada_por is distinct from old.creada_por
     or new.created_at is distinct from old.created_at
     or (old.correlativo is not null and new.correlativo is distinct from old.correlativo)
     or (old.codigo is not null and new.codigo is distinct from old.codigo)
  then
    raise exception 'La serie, el número y el cliente de una cotización no se cambian.';
  end if;

  if v_editable then
    return new;
  end if;

  if new.cliente_snapshot is distinct from old.cliente_snapshot
     or new.subtotal is distinct from old.subtotal
     or new.total is distinct from old.total
     or new.moneda is distinct from old.moneda
     or new.condiciones is distinct from old.condiciones
     or new.vigencia_dias is distinct from old.vigencia_dias
     or new.entrega_lugar is distinct from old.entrega_lugar
  then
    raise exception 'Esta cotización ya salió al cliente y no se modifica. Duplíquela para hacer una versión nueva.';
  end if;

  return new;
end;
$$;
