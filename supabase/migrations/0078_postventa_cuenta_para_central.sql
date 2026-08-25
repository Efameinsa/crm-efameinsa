-- ============================================================
-- CRM EFAMEINSA · Migración 0078 · Postventa vuelve al consolidado de Central
-- ============================================================
-- Central lo reportó el 25-08 con la pantalla al lado: «en el consolidado
-- estaría faltando lo de PV, a él también se le están derivando llamadas».
-- Tenía razón, y faltaba en el total además de en la tabla: derivó 18 contactos
-- y el consolidado le mostraba 15.
--
-- ES UN ERROR DE LA MIGRACIÓN 0075. Ahí se excluyó a postventa de
-- `supervision_diaria` con un argumento correcto —un caso de garantía no es una
-- venta y no compite en la meta de 30 seguimientos— sin ver que esa misma
-- función alimenta el CONSOLIDADO DE CENTRAL, donde el número no mide ventas:
-- mide lo que Central derivó. Y derivar a postventa es trabajo suyo igual que
-- derivar a un comercial.
--
-- LA DISTINCIÓN QUE FALTABA: quién aparece no lo decide la función, lo decide
-- cada pantalla. `supervision_diaria` vuelve a traer a todos y marca cuáles son
-- de postventa; el consolidado de Central los muestra —es su carga— y la
-- supervisión de gerencia los deja fuera del ranking de la meta, que es donde
-- no corresponde compararlos.
--
-- `resumen_gerencia` NO se toca: ahí sí se miden ventas, y postventa sigue
-- fuera con toda la razón.

do $$
declare
  v_def   text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'supervision_diaria' limit 1;
  if v_def is null then
    raise exception 'No existe la función supervision_diaria';
  end if;

  -- 1. Vuelven a entrar los perfiles de postventa.
  v_nuevo := replace(
    v_def,
    'where p.rol = ''comercial'' and p.activo and not p.es_prueba and not p.es_postventa',
    'where p.rol = ''comercial'' and p.activo and not p.es_prueba'
  );
  if v_nuevo = v_def then
    raise exception 'No se encontró el filtro que agregó la 0075 en supervision_diaria';
  end if;

  -- 2. Cada fila dice si es postventa, para que la pantalla decida.
  v_def := v_nuevo;
  v_nuevo := replace(
    v_def,
    '''codigo'', p.codigo_comercial,',
    '''codigo'', p.codigo_comercial,
           ''es_postventa'', p.es_postventa,'
  );
  if v_nuevo = v_def then
    raise exception 'No se encontró el campo codigo en supervision_diaria';
  end if;

  execute v_nuevo;
end $$;

comment on function supervision_diaria(date) is
  'Consolidado del día por comercial. Incluye a postventa marcada con es_postventa: el consolidado de Central la cuenta —derivarle es trabajo suyo— y la supervisión de gerencia la deja fuera del ranking de la meta (migraciones 0075 y 0078).';
