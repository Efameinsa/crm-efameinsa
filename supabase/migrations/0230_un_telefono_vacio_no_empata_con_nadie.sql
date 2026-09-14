-- ============================================================
-- CRM EFAMEINSA · Migración 0230 · Un teléfono vacío no empata con nadie
-- ============================================================
-- Caso EDWIN PAREDES FLORES (14-09). Entraron dos contactos de la web con el
-- mismo nombre: PRO-09333 con celular y PRO-09332 con teléfono «s/n». El
-- primero se derivó a C1 sin problema; con el segundo, al elegir C1, el CRM
-- avisó «este cliente ya es de Katerine (C5) — AGROCASAGRANDE S.A.C.» y pidió
-- el código. Santos: «averigua por qué pasa eso».
--
-- POR QUÉ. `normalizar_telefono('s/n')` devuelve '' (cadena vacía, no NULL),
-- y tanto `cartera_en_juego` como `asignar_lead` preguntaban «¿el teléfono
-- normalizado es not null?» antes de buscar un contacto con ese mismo
-- teléfono. La cadena vacía pasa la pregunta y empata con cualquier contacto
-- cuyo teléfono también quedó vacío al normalizarse: hay siete en la base
-- («c», «###», «NO SE INDICA», un correo en el campo del teléfono…). El de
-- AGROCASAGRANDE («c») fue el primero que salió.
--
-- La regla, en las dos funciones: un teléfono cuenta para empatar solo si
-- tiene al menos seis dígitos. Se parcha la definición viva, no se copia.
-- ============================================================

do $$
declare
  v_def text;
  v_nueva text;
begin
  -- cartera_en_juego: el aviso de «ya es de otro» al elegir comercial.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'cartera_en_juego';
  v_nueva := replace(v_def,
    'if v_cuenta is null and v_lead.tel is not null then',
    'if v_cuenta is null and length(coalesce(v_lead.tel, '''')) >= 6 then');
  if v_nueva = v_def then raise exception 'cartera_en_juego: no se encontró la condición del teléfono'; end if;
  execute v_nueva;

  -- asignar_lead: la ficha a la que se une el contacto al derivarlo.
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'asignar_lead';
  v_nueva := replace(v_def,
    'if v_cuenta_id is null and v_lead.telefono_normalizado is not null then',
    'if v_cuenta_id is null and length(coalesce(v_lead.telefono_normalizado, '''')) >= 6 then');
  if v_nueva = v_def then raise exception 'asignar_lead: no se encontró la condición del teléfono (unión)'; end if;
  v_def := v_nueva;
  -- Y el contacto que se agrega a la ficha: sin dígitos no se agrega un
  -- «s/n» como teléfono.
  v_nueva := replace(v_def,
    'if v_lead.telefono is not null and not exists (',
    'if length(coalesce(v_lead.telefono_normalizado, '''')) >= 6 and not exists (');
  if v_nueva = v_def then raise exception 'asignar_lead: no se encontró la condición del teléfono (contacto)'; end if;
  execute v_nueva;
end $$;
