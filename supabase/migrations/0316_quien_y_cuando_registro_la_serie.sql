-- ════════════════════════════════════════════════════════════════════════
-- 0316 · Quién y cuándo registró la serie o el código de cada unidad
--
-- Lesly, 28-09, en el pedido del almacén: «debe tener la opción de imprimir
-- la solicitud y, así mismo, cuando responden, también imprimirlo». La
-- solicitud ya dice quién la pidió y cuándo (series_pedidas_por / _at); la
-- respuesta del almacén no guardaba ni quién ni cuándo: la serie se escribe
-- desde cuatro funciones (registrar_serie_del_equipo, registrar_series_del_
-- pedido, registrar_codigo_sin_serie y la liberación de Central, 0270).
--
-- En vez de tocar las cuatro, un disparador anota quién y cuándo cada vez
-- que la serie de una unidad pasa de vacía a escrita (o cambia). Las
-- respuestas anteriores a hoy quedan sin fecha: no hay de dónde sacarla.
-- ════════════════════════════════════════════════════════════════════════

alter table public.pedido_equipos
  add column if not exists serie_registrada_at  timestamptz,
  add column if not exists serie_registrada_por uuid references public.perfiles (id);

comment on column public.pedido_equipos.serie_registrada_at is
  'Cuándo se escribió la serie o el código de esta unidad (0316). Lo pone el disparador.';

create or replace function public.pedido_equipos_anota_la_serie()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.serie is null then
    new.serie_registrada_at := null;
    new.serie_registrada_por := null;
  elsif tg_op = 'INSERT' or new.serie is distinct from old.serie then
    new.serie_registrada_at := now();
    new.serie_registrada_por := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists pedido_equipos_anota_la_serie on public.pedido_equipos;
create trigger pedido_equipos_anota_la_serie
  before insert or update of serie on public.pedido_equipos
  for each row execute function public.pedido_equipos_anota_la_serie();
