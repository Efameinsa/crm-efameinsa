-- 0339 · Central se entera en la campana de cada cierre emitido
--
-- 29-09-2026, Santos: Gabriela emitió el 045-2026 y el 046-2026 y preguntó si a
-- Central ya le aparecían. Aparecían en su lista de cierres, pero la campana
-- solo avisaba de cierres devueltos, corregidos o anulados: Central tenía que
-- entrar a mirar. Ahora, al pasar de borrador a emitido, le llega el aviso
-- con el número, el cliente y quién lo emitió. Un cierre de práctica no avisa
-- a Central real (como files, 0336).

create or replace function public.avisar_central_cierre_emitido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quien text;
begin
  if coalesce(new.es_prueba, false) then return new; end if;
  select coalesce(codigo_comercial || ' · ', '') || nombre into v_quien from perfiles where id = new.creado_por;
  perform crear_notificacion(
    null, 'central', 'cierre_emitido',
    format('Cierre %s emitido · %s', coalesce(new.codigo, ''), coalesce(v_quien, 'sin autor')),
    left(coalesce(new.cliente_nombre, 'Cliente'), 120) || ' · ' || coalesce(new.moneda, 'USD') || ' ' || to_char(coalesce(new.monto_total, 0), 'FM999G999G990D00'),
    '/central/cierres');
  return new;
end $$;

drop trigger if exists central_se_entera_del_cierre_emitido on public.informes_cierre;
create trigger central_se_entera_del_cierre_emitido
  after update of emitido_at on public.informes_cierre
  for each row
  when (old.emitido_at is null and new.emitido_at is not null)
  execute function public.avisar_central_cierre_emitido();
