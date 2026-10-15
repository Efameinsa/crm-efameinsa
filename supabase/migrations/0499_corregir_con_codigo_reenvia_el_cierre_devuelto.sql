-- CORREGIR CON CÓDIGO UN CIERRE DEVUELTO LO DEVUELVE A CENTRAL (15-10-2026).
-- Central devolvió el OPEN 060-2026 (CONSORCIO EL PORTAL DEL MARQUES, 14:07)
-- pidiendo el tipo de cambio; Gabriela lo corrigió con el código de Central a
-- las 14:39 (versión 2, TC 3.63) y el cierre siguió fuera de la cola de
-- Central: la devolución solo se cerraba con un segundo botón, «Ya lo
-- corregí». Ya había pasado el 30-09 con el 046 (también de Gabriela), y el
-- aviso que se agregó entonces no alcanzó.
--
-- Ahora, cuando una corrección con código sube la versión del cierre, la
-- devolución abierta queda resuelta en el mismo momento, a nombre de quien
-- corrigió. Central ya recibe el aviso «Cierre corregido» (0492) con lo que
-- cambió, así que no hace falta otro. «Ya lo corregí» sigue sirviendo cuando
-- lo que faltaba no exigía editar el cierre.

create or replace function public.resolver_devolucion_al_corregir()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.version > old.version then
    update devoluciones_cierre
       set resuelto_at   = now(),
           resuelto_por  = coalesce(new.corregido_por, auth.uid()),
           resuelto_nota = format('Corregido con código (versión %s).', new.version)
     where informe_id = new.id
       and resuelto_at is null;
  end if;
  return null;
end $$;

drop trigger if exists zz_resolver_devolucion_al_corregir on public.informes_cierre;
create trigger zz_resolver_devolucion_al_corregir
  after update of version on public.informes_cierre
  for each row execute function public.resolver_devolucion_al_corregir();

-- El 060-2026, que quedó trabado antes de esta regla.
update devoluciones_cierre d
   set resuelto_at   = now(),
       resuelto_por  = i.corregido_por,
       resuelto_nota = format('Corregido con código (versión %s); cerrada al aplicar 0499.', i.version)
  from informes_cierre i
 where i.id = d.informe_id
   and d.resuelto_at is null
   and i.corregido_at > d.devuelto_at;
