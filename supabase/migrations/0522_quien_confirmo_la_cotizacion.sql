-- 0522 · QUIÉN CONFIRMÓ LA COTIZACIÓN (Santos, 16-10, ECOLAV).
--
-- «Todos deberían poder ver todo… pero la acción que cometa alguien debe
-- quedar registrada con su nombre para rastrear». En postventa cualquiera del
-- área confirma la cotización que armó otra (puede_cotizar_en), y hasta hoy
-- quedaba quién la creó (creada_por) y quién la aprobó (aprobada_por), pero no
-- quién le dio el número. Se anota sola al confirmarse: no se toca
-- emitir_cotizacion, lo hace un disparador cuando enviada_at pasa de vacío a
-- lleno. Sin sesión (sincronía, procesos) no pisa nada.

alter table public.cotizaciones
  add column if not exists enviada_por uuid references public.perfiles(id);

create or replace function public.tg_cotizacion_quien_confirmo()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.enviada_at is not null and old.enviada_at is null and new.enviada_por is null then
    new.enviada_por := auth.uid();
  end if;
  return new;
end
$$;

drop trigger if exists trg_cotizacion_quien_confirmo on public.cotizaciones;
create trigger trg_cotizacion_quien_confirmo
  before update of enviada_at on public.cotizaciones
  for each row execute function public.tg_cotizacion_quien_confirmo();
