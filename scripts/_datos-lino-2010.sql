-- LINO ESPIRITU JOSMEL ETZON (reunión 20-10-2026 15:45): el caso CASO-00129 es la
-- SECADORA de la torre (304KWUC0V206, «la secadora no calienta»), pero su máquina
-- principal quedó apuntando a la lavadora 604KWNM5N407. La secadora ya estaba en
-- «otras máquinas del caso». Se corrige la principal; queda en el registro de acciones.
begin;
select set_config('request.jwt.claims', json_build_object('sub', '7903ef3b-b139-4fa9-aaec-83f172ae7c69', 'role', 'authenticated')::text, true);
select set_config('request.jwt.claim.sub', '7903ef3b-b139-4fa9-aaec-83f172ae7c69', true);
update atenciones a
   set equipo_id = e.id, updated_at = now()
  from equipos_instalados e
 where a.codigo = 'CASO-00129'
   and e.serie = '304KWUC0V206' and e.cuenta_id = '5e5825f3-6cb1-436c-9258-c07286a9084f'
   and a.equipo_id is distinct from e.id;
select codigo, (select serie from equipos_instalados where id = equipo_id) from atenciones where codigo = 'CASO-00129';
commit;
