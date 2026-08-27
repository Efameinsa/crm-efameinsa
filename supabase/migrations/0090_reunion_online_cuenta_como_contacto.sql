-- ============================================================
-- CRM EFAMEINSA · Migración 0090 · La reunión online cuenta como contacto real
-- ============================================================
-- Continúa la 0089 (que agregó el valor al enum; el valor nuevo no se puede
-- nombrar en la misma transacción que lo creó, por eso son dos archivos).
--
-- POR QUÉ HAY QUE TOCAR LOS REPORTES. Dos funciones filtran qué gestiones
-- cuentan como CONTACTO REAL con el cliente, y las dos listan los tipos a mano:
--
--   · la supervisión diaria  → ('llamada', 'whatsapp', 'email', 'visita')
--   · el reporte diario      → …más 'showroom'
--
-- Fuera quedan 'filtro', 'nota' y 'otro', que son anotaciones internas. Una
-- reunión por Meet o Zoom con el cliente no es una anotación interna: es de los
-- contactos más fuertes que hay, después de la visita. Si no entrara en estas
-- listas, un comercial que se pasa la mañana en reuniones aparecería sin
-- actividad ante gerencia y el informe diario reportaría de menos — un agujero
-- que se abriría el primer día que alguien use el chip nuevo.
--
-- CÓMO. Se parte de la definición VIVA de cada función y se le cambia solo esa
-- lista, en vez de copiar acá cuerpos de 100 líneas que ya se redefinieron en
-- 0040, 0041, 0045, 0053, 0059, 0061, 0071, 0072, 0083 y 0085 — copiarlas es
-- como se rompió el reporte diario el 24-08. Si no se tocara ninguna función se
-- levanta el error: una migración que no surte efecto en silencio es peor que
-- no tenerla, porque nadie se entera de que los números siguen incompletos.

do $$
declare
  v_rec     record;
  v_def     text;
  v_nuevo   text;
  v_tocadas integer := 0;
begin
  for v_rec in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
  loop
    v_def := pg_get_functiondef(v_rec.oid);

    -- El orden importa: primero la lista larga. Si se hiciera al revés, el
    -- tramo «…'visita')» de la corta no existe en la larga y no habría choque,
    -- pero dejarlo explícito evita que un cambio futuro las solape.
    v_nuevo := replace(
      v_def,
      'a.tipo in (''llamada'', ''whatsapp'', ''email'', ''visita'', ''showroom'')',
      'a.tipo in (''llamada'', ''whatsapp'', ''email'', ''visita'', ''showroom'', ''reunion_online'')'
    );
    v_nuevo := replace(
      v_nuevo,
      'a.tipo in (''llamada'', ''whatsapp'', ''email'', ''visita'')',
      'a.tipo in (''llamada'', ''whatsapp'', ''email'', ''visita'', ''reunion_online'')'
    );

    if v_nuevo is distinct from v_def then
      execute v_nuevo;
      v_tocadas := v_tocadas + 1;
    end if;
  end loop;

  if v_tocadas = 0 then
    raise exception 'Ninguna función traía el filtro de tipos de gestión; revisar a mano antes de seguir';
  end if;

  raise notice 'Reunión online incorporada a % función(es) de reportes', v_tocadas;
end $$;
