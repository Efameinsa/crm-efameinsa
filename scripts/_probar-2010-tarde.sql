-- Pruebas de la reunión 20-10-2026 15:45 (0567-0570). Todo dentro de una transacción
-- que se deshace. Correr DESPUÉS de aplicar las migraciones, o pegándolas antes.
-- Cada línea dice OK o FALLA.
begin;
select set_config('request.jwt.claims', json_build_object('sub', 'ed20331c-ab15-4268-be89-0136be34e58e', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', 'ed20331c-ab15-4268-be89-0136be34e58e', true);
set local role authenticated;

-- 1. Las fichas gemelas de Lino: la del DNI y la del RUC 10 son la misma persona.
select case when count(*) = 2 then 'OK' else 'FALLA' end || ' 1 gemelas de Lino (' || count(*) || ')'
  from cuentas_gemelas('5db4995b-151e-4ea4-8d3d-e10300ce376a');

-- 2. Desde la ficha del DNI se encuentra el caso abierto de la ficha del RUC.
select case when (select codigo from atenciones where id = atencion_abierta_parecida('5db4995b-151e-4ea4-8d3d-e10300ce376a', 'problema_tecnico', null)) = 'CASO-00129'
            then 'OK' else 'FALLA' end || ' 2 freno a duplicado entre fichas gemelas';

-- 3. Brenda (PV2) anota una gestión para CASO-00129: queda con su caso.
insert into actividades (oportunidad_id, tipo, nota, realizada_por, atencion_id)
select '5bd0bb2e-6257-4cc1-9b96-2f53d664fd59', 'llamada', 'prueba 0567', auth.uid(), a.id from atenciones a where a.codigo = 'CASO-00129';
select case when exists (select 1 from actividades where nota = 'prueba 0567' and atencion_id is not null) then 'OK' else 'FALLA' end || ' 3 la gestión sabe de qué caso es';

-- 4. Reclasificar deja nota en el historial del caso.
update atenciones set tipo = 'solicitud_repuesto' where codigo = 'CASO-00129';
select case when exists (select 1 from actividades where nota like '[Atención%Reclasificado%' and atencion_id = (select id from atenciones where codigo = 'CASO-00129'))
            then 'OK' else 'FALLA' end || ' 4 reclasificar queda en la línea de tiempo';
update atenciones set tipo = 'problema_tecnico' where codigo = 'CASO-00129';

-- 5. La recepción ligada a una apertura no se duplica.
do $$
declare v1 uuid; v2 uuid; v_s uuid := (select id from servicios_postventa where cuenta_id = '5e5825f3-6cb1-436c-9258-c07286a9084f' limit 1);
begin
  v1 := crear_recepcion_equipo((select id from atenciones where codigo = 'CASO-00129'), 'Secadora prueba', null, 'garantia', 'tecnico', current_date, 'prueba', v_s);
  v2 := crear_recepcion_equipo((select id from atenciones where codigo = 'CASO-00129'), 'Secadora prueba', null, 'garantia', 'tecnico', current_date, 'prueba', v_s);
  raise notice '% 5 una apertura interna, una recepción', case when v1 = v2 then 'OK' else 'FALLA' end;
end $$;

reset role;
-- 6. Los repuestos no son máquinas: el kit de Lino queda marcado.
select case when (select count(*) from equipos_instalados where cuenta_id = '5e5825f3-6cb1-436c-9258-c07286a9084f' and es_repuesto) >= 8
            then 'OK' else 'FALLA' end || ' 6 el kit de repuestos no cuenta como máquinas';
select case when (select count(*) from equipos_instalados where cuenta_id = '5e5825f3-6cb1-436c-9258-c07286a9084f' and not es_repuesto and serie in ('304KWUC0V206', '604KWNM5N407', '604KWJU5N412')) = 3
            then 'OK' else 'FALLA' end || ' 7 las tres máquinas de Lino siguen siendo máquinas';

-- 8. Fichas repetidas muestra los pares por documento.
select case when (select count(*) from fichas_repetidas(null) where clave like 'doc:%') >= 30 then 'OK' else 'FALLA' end || ' 8 fichas repetidas por documento ('
       || (select count(*) from fichas_repetidas(null) where clave like 'doc:%') || ')';

-- 9. La lista para anotar trae el caso con su código.
select case when exists (select 1 from casos_abiertos_de_cuenta('5e5825f3-6cb1-436c-9258-c07286a9084f') where codigo = 'CASO-00129') then 'OK' else 'FALLA' end || ' 9 casos para anotar';
rollback;
