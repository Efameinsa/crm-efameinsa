-- ============================================================
-- «Derivado» como desenlace de una gestión, y el teléfono en la lista de clientes
-- ============================================================
-- Santos, 11-09, con dos casos de Ariana:
--
-- 1) RUBÉN CASTILLO PAITA está en su lista de comercial, pero «pertenece a
--    Beneficencia Huancayo, que está atendiendo Katerine (C5)». Lo que ella
--    quiere anotar es «lo llamé y esto es de otro», y el formulario de la
--    gestión no tiene esa salida: los diez desenlaces terminan en «qué sigue»
--    con fecha y hora, como si fuera a seguir siendo suyo. La etapa «Ya no es
--    mío — pasó a otra área» existe desde el 08-09, pero solo en «Cambiar
--    etapa» de la ficha, aparte de la gestión — y nadie registra dos veces.
--
--    Va como desenlace del catálogo, con `efecto = 'derivar'`: la pantalla
--    esconde el paso 3 y cierra la oportunidad como derivada en el mismo
--    viaje, igual que el rechazo (registrarGestionYDerivar). No cuenta como
--    pérdida en ningún reporte.
--
-- 2) En su cuenta de postventa «no visualiza algunos teléfonos»: la lista
--    «Clientes que atiendo» no tenía columna de teléfono. Para una campaña de
--    llamadas, abrir la ficha de cada cliente solo para ver el número es el
--    trabajo que la lista debería ahorrar. `listar_clientes` devuelve ahora el
--    del contacto principal (o el primero que tenga), parchando la definición
--    viva y no copiándola: la regla del repositorio.

-- El catálogo solo admitía tres efectos (0026). El cuarto cierra sin contar
-- como pérdida.
alter table catalogo_resultados_gestion drop constraint if exists catalogo_resultados_gestion_efecto_check;
alter table catalogo_resultados_gestion
  add constraint catalogo_resultados_gestion_efecto_check
  check (efecto in ('cotizar', 'venta', 'rechazo', 'derivar'));

insert into catalogo_resultados_gestion (codigo, nombre, activo, accion_sugerida, dias_sugeridos, efecto, orden)
select 'DERIVADO', 'Derivado — pasó a otro comercial u otra área', true, null, null, 'derivar', 125
 where not exists (select 1 from catalogo_resultados_gestion where codigo = 'DERIVADO');

do $$
declare v text;
begin
  select pg_get_functiondef('public.listar_clientes(text,uuid,boolean,boolean,text,integer,integer,text)'::regprocedure) into v;
  if position('as telefono' in v) = 0 then
    v := replace(v,
      E'ah.historica_id\n    from cuentas c',
      E'ah.historica_id,\n'
      || E'           (select ct.telefono from contactos ct\n'
      || E'             where ct.cuenta_id = c.id and ct.telefono is not null and btrim(ct.telefono) <> \'\'\n'
      || E'             order by ct.es_principal desc, ct.created_at limit 1) as telefono\n'
      || E'    from cuentas c');
    if position('as telefono' in v) = 0 then
      raise exception 'listar_clientes: no se encontró el punto donde agregar el teléfono';
    end if;
    execute v;
  end if;
end $$;
