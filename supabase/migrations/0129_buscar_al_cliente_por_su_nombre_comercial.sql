-- ============================================================
-- Buscar al cliente por el nombre con el que uno lo llama
-- ============================================================
-- Salió de la incidencia de Brenda del 31-08-2026. Su cliente COINREFRI estaba
-- partido en cuatro fichas y el seguimiento de 2026 vivía en la que tiene el
-- RUC, llamada «CORP DE INGENIERIA DE REFRIGERACION SRL». Al unificarlas
-- (scripts/fusionar-coinrefri.mjs) el nombre legal quedó como razón social y
-- «COINREFRI» pasó a `nombre_comercial`… y ahí Brenda dejó de encontrarlo:
-- buscar «COINREFRI» en Mi cartera devolvía CERO.
--
-- La fusión, sola, le habría empeorado el día: antes tenía una ficha pobre
-- pero con el nombre que ella usa, y después una ficha completa que no podía
-- encontrar.
--
-- `listar_clientes` (0054) busca por razón social, por documento y por
-- teléfono, pero nunca miró `nombre_comercial`. Y esa columna existe justamente
-- para esto: el nombre con el que la empresa se presenta y con el que el
-- comercial la tiene en la cabeza. Casi nadie dice «Corp de Ingeniería de
-- Refrigeración SRL»; dicen COINREFRI.
--
-- SE PARCHA LA DEFINICIÓN VIVA CON REGEXP, no se copia la función. La 0054 no
-- es la última que la tocó y copiar el cuerpo de un archivo viejo ya revivió
-- reglas revertidas tres veces en este proyecto.
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where proname = 'listar_clientes'
   limit 1;
  if v_def is null then
    raise exception 'no existe listar_clientes(): nada que parchar';
  end if;

  if v_def like '%c.nombre_comercial ilike%' then
    raise notice 'listar_clientes ya busca por nombre comercial; no se toca';
    return;
  end if;

  v_nuevo := replace(
    v_def,
    'or c.razon_social ilike ''%'' || v_q || ''%''',
    'or c.razon_social ilike ''%'' || v_q || ''%''' || chr(10) ||
    '        or c.nombre_comercial ilike ''%'' || v_q || ''%'''
  );

  if v_nuevo = v_def then
    raise exception 'no se encontró el filtro por razón social: revisar a mano';
  end if;

  execute v_nuevo;
end $$;

comment on function listar_clientes(text, uuid, boolean, boolean, text, integer, integer) is
  'Listado paginado de clientes. Busca por razón social, NOMBRE COMERCIAL (0129, '
  'incidencia COINREFRI de Brenda del 31-08), documento y teléfono del contacto.';
