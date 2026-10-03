-- 0376 · Los mensajes de error ya no dicen «parque»
--
-- 02-10-2026, Santos: «¿Por qué usas el nombre "Mi parque"? En Perú… un parque
-- es un lugar con jardín donde van niños a jugar». «Parque instalado» es jerga
-- de fabricante; en pantalla pasa a ser «registro de máquinas» y «Mi parque»,
-- «Mis clientes con máquinas». Acá se cambian solo los textos que la base le
-- devuelve al usuario; la lógica de cada función queda igual (se reescribe su
-- propia definición con la frase cambiada).

do $$
declare
  r record;
  v_def text;
  v_nueva text;
  cambios constant text[][] := array[
    ['Esa máquina ya tiene historia en el parque:', 'Esa máquina ya tiene historia:'],
    ['La serie del parque la corrige postventa', 'La serie de una máquina registrada la corrige postventa'],
    ['ya es de otra máquina del parque:', 'ya es de otra máquina registrada:'],
    ['Esa máquina no está en el parque instalado', 'Esa máquina no está en el registro de máquinas'],
    ['Solo postventa cierra el pedido y sube la máquina al parque', 'Solo postventa cierra el pedido y registra la máquina'],
    ['ya está en otra máquina del parque', 'ya está en otra máquina registrada']
  ];
  i int;
begin
  for r in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('quitar_parte_del_equipo', 'corregir_serie_parque', 'agregar_equipo_al_caso', 'subir_maquina_al_parque', 'corregir_serie_del_equipo')
  loop
    v_def := pg_get_functiondef(r.oid);
    v_nueva := v_def;
    for i in 1 .. array_length(cambios, 1) loop
      v_nueva := replace(v_nueva, cambios[i][1], cambios[i][2]);
    end loop;
    if v_nueva <> v_def then execute v_nueva; end if;
  end loop;
end $$;
