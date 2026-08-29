-- ============================================================
-- CRM EFAMEINSA · Migración 0118 · Las listas las mantiene operaciones
-- ============================================================
-- «Y esta vista, ¿tiene sentido? … no entiendo qué hace o para qué sirve»
-- (28-08, mirando la pantalla de catálogos).
--
-- Sentido tiene: esas tres listas son las palabras que el CRM pone en sus
-- desplegables —el rubro del cliente, por qué se perdió una oportunidad, qué
-- pasó en cada llamada—. Lo que no tenía sentido era la pantalla, que las
-- mostraba como tres tablas de nombres sin decir cuáles siguen vigentes ni
-- cuánto se usa cada una. De ahí que pareciera que sobra: «Compra a futuro»
-- salía DOS VECES —`FUTURO`, retirado, y `COMPRA_FUTURO`, el que se usa— y la
-- pantalla los dibujaba igual.
--
-- Acá va lo que hace falta para que operaciones pueda mantenerlas:
--   1. Permiso de escritura, que hasta hoy era solo de gerencia.
--   2. Un freno para que el CÓDIGO no se cambie nunca. El nombre es lo que se
--      lee; el código es lo que el programa compara: `ruta.ts` decide qué
--      llamada volver a agendar buscando NO_CONTESTO, PIDIO_COTIZACION y
--      COMPRA_FUTURO. Cambiar uno rompe la ruta de mantenimiento en silencio,
--      sin error y sin que nadie lo note hasta que faltan llamadas.

drop policy if exists rubros_write on catalogo_rubros;
create policy rubros_write on catalogo_rubros for all to authenticated
using ((select es_backoffice()) or (select es_operaciones()))
with check ((select es_backoffice()) or (select es_operaciones()));

drop policy if exists motivos_write on catalogo_motivos_rechazo;
create policy motivos_write on catalogo_motivos_rechazo for all to authenticated
using ((select es_backoffice()) or (select es_operaciones()))
with check ((select es_backoffice()) or (select es_operaciones()));

drop policy if exists resultados_gestion_write on catalogo_resultados_gestion;
create policy resultados_gestion_write on catalogo_resultados_gestion for all to authenticated
using ((select es_backoffice()) or (select es_operaciones()))
with check ((select es_backoffice()) or (select es_operaciones()));

-- ------------------------------------------------------------
create or replace function bloquear_codigo_resultado()
returns trigger language plpgsql as $fn$
begin
  if new.codigo is distinct from old.codigo then
    raise exception 'El código % no se cambia: hay reglas del sistema que lo comparan. Cambie el nombre, que es lo que se lee.', old.codigo;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_resultado_codigo_fijo on catalogo_resultados_gestion;
create trigger trg_resultado_codigo_fijo before update on catalogo_resultados_gestion
  for each row execute function bloquear_codigo_resultado();

-- ------------------------------------------------------------
-- Cuánto se usa cada palabra de cada lista. Es el dato que decide si una se
-- deja, se renombra o se retira, y el único que la pantalla no podía mostrar
-- sin recorrerse tres tablas grandes desde el navegador.
create or replace function uso_de_listas()
returns table (lista text, id text, codigo text, nombre text, activo boolean, usos bigint)
language sql stable security definer set search_path = public as $fn$
  select 'rubros', r.id::text, null, r.nombre, r.activo,
         (select count(*) from cuentas c where c.rubro_id = r.id)
    from catalogo_rubros r
  union all
  select 'motivos', m.id::text, null, m.nombre, m.activo,
         (select count(*) from oportunidades o where o.motivo_rechazo_id = m.id)
    from catalogo_motivos_rechazo m
  union all
  select 'resultados', g.id::text, g.codigo, g.nombre, g.activo,
         (select count(*) from actividades a where a.resultado_id = g.id)
    from catalogo_resultados_gestion g;
$fn$;

revoke all on function uso_de_listas() from public;
grant execute on function uso_de_listas() to authenticated;
