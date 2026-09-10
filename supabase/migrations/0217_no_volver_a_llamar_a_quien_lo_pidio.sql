-- ============================================================
-- Si pidió que no lo llamen, no vuelve a salir en ninguna campaña
-- ============================================================
-- La 0216 agregó el motivo «Solicitó ya no ser contactado» y ahí quedaba: una
-- etiqueta en un expediente cerrado. Pero el cliente no le pidió eso a una
-- oportunidad, se lo pidió a la EMPRESA — y mañana el mismo señor aparece en la
-- ruta de mantenimiento o en «Las ventas de la empresa» como uno más al que
-- nadie ha llamado, que es exactamente el argumento para llamarlo.
--
-- Así que la marca sube a la ficha del cliente y la ponen las dos puertas por
-- las que se rechaza: el botón de la ficha y la gestión rápida. Va como
-- disparador y no en el código de la aplicación porque también se rechaza desde
-- scripts, y una regla que solo vive en una pantalla se escapa por la otra.
--
-- SE PUEDE LEVANTAR. No es una condena: si el mismo cliente vuelve a escribir y
-- pide una cotización, alguien tiene que poder quitar la marca. Por eso es una
-- fecha con su nota y no un booleano — se sabe cuándo lo pidió y en qué
-- expediente, que es lo que hace falta para decidir si se levanta.
--
-- Y NO SE PONE SOLA AL REVÉS: reabrir la oportunidad no borra la marca. Que el
-- comercial cambie de opinión sobre la etapa no significa que el cliente haya
-- cambiado de opinión sobre que lo llamen.

alter table cuentas
  add column if not exists no_contactar_at    timestamptz,
  add column if not exists no_contactar_nota  text;

comment on column cuentas.no_contactar_at is
  'El cliente pidió que no lo contacten más (motivo de rechazo «Solicitó ya no ser contactado», 0216). Las campañas lo saltean y las pantallas lo dicen. Se levanta a mano si el cliente vuelve.';

create or replace function marcar_no_contactar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_es_ese_motivo boolean;
begin
  if new.etapa::text <> 'rechazada' or new.motivo_rechazo_id is null or new.cuenta_id is null then
    return new;
  end if;

  select lower(nombre) = lower('Solicitó ya no ser contactado')
    into v_es_ese_motivo
    from catalogo_motivos_rechazo where id = new.motivo_rechazo_id;

  if coalesce(v_es_ese_motivo, false) then
    update cuentas
       set no_contactar_at = coalesce(no_contactar_at, now()),
           no_contactar_nota = coalesce(
             no_contactar_nota,
             'Lo pidió al cerrarse el expediente ' || coalesce(new.codigo_central, new.id::text) || '.'),
           updated_at = now()
     where id = new.cuenta_id and no_contactar_at is null;
  end if;

  return new;
end $$;

drop trigger if exists trg_marcar_no_contactar on oportunidades;
create trigger trg_marcar_no_contactar
  after insert or update of etapa, motivo_rechazo_id on oportunidades
  for each row execute function marcar_no_contactar();

comment on function marcar_no_contactar is
  'Sube a la ficha del cliente el pedido de no ser contactado cuando se cierra una oportunidad con ese motivo. Va en la base y no en la pantalla porque también se rechaza desde scripts.';

-- Lo que ya estaba cerrado con ese motivo antes del disparador.
update cuentas c
   set no_contactar_at = coalesce(c.no_contactar_at, o.cerrada_at, now()),
       no_contactar_nota = coalesce(c.no_contactar_nota,
         'Lo pidió al cerrarse el expediente ' || coalesce(o.codigo_central, o.id::text) || '.')
  from oportunidades o
  join catalogo_motivos_rechazo m on m.id = o.motivo_rechazo_id
 where o.cuenta_id = c.id
   and o.etapa::text = 'rechazada'
   and lower(m.nombre) = lower('Solicitó ya no ser contactado')
   and c.no_contactar_at is null;
