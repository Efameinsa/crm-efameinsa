-- 0559 · El setter tipifica cada lead al colgar y, hasta entonces, el lead no se reparte.
-- Santos, 20-10-2026: «luego de mí lo paso a cada vendedor… la apk debe estar configurada para poder
-- tipificar rápido para los informes: no contesta, no tiene dinero, equivocado, muy interesado,
-- interesado, medio».
--
-- · llamadas_por_hacer guarda ahora el resultado de la llamada (sale de ahí el informe del setter),
--   cuántos intentos van y cuándo se puede volver a llamar (no contestó → reintento).
-- · `retiene`: el lead se quedó esperando al setter y NO se asignó al comercial al llegar; se asigna
--   cuando el setter lo tipifica (o, si no lo hace a tiempo, por la red de seguridad del CRM).
-- · perfiles.setter_visto_at: la última vez que el celular del setter preguntó por llamadas. Solo si
--   estuvo «en línea» hace poco se retiene el lead; si el celular está apagado, el lead se reparte
--   como siempre y nunca queda trabado.

alter table llamadas_por_hacer add column if not exists disponible_desde timestamptz not null default now();
alter table llamadas_por_hacer add column if not exists intento integer not null default 1;
alter table llamadas_por_hacer add column if not exists retiene boolean not null default false;
alter table llamadas_por_hacer add column if not exists resultado text;
alter table llamadas_por_hacer add column if not exists nota text;
alter table llamadas_por_hacer add column if not exists tipificada_at timestamptz;
alter table llamadas_por_hacer add column if not exists duracion_s integer;

create index if not exists ix_llamadas_por_hacer_lead on llamadas_por_hacer (lead_id, creada_at desc);
create index if not exists ix_llamadas_por_hacer_resultado on llamadas_por_hacer (tipificada_at) where resultado is not null;

alter table perfiles add column if not exists setter_visto_at timestamptz;

grant select on public.llamadas_por_hacer to authenticated;
grant all on public.llamadas_por_hacer to service_role;
