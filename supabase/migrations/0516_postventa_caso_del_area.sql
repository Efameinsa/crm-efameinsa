-- 0516: «tiene un caso» de postventa es del ÁREA, no de la persona.
--
-- Ariana (PV3, 16-10) no pudo agregar el contacto de COR-PORACION 3C: el
-- expediente de postventa estaba a nombre de Rubí (PV1) y postventa_tiene_caso
-- solo contaba los expedientes propios (o.comercial_id = auth.uid()).
-- Regla de gerencia (28/29-09): «PV es el área; PV1, PV2, PV3 tienen los
-- mismos permisos», igual que puede_cotizar_en (0323): cualquier expediente
-- de postventa (tipo_postventa no nulo) del cliente cuenta para toda el área.
-- Las políticas que la usan (contactos, cuentas, equipos, informes) solo la
-- evalúan junto con puede_postventa(), así que comerciales no ganan nada; la
-- cuenta de práctica sigue viendo solo lo suyo (0092).

create or replace function public.postventa_tiene_caso(p_cuenta uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
           select 1 from oportunidades o
            where o.cuenta_id = p_cuenta
              and (o.comercial_id = auth.uid()
                   or (o.tipo_postventa is not null and not es_cuenta_prueba()))
         )
      or exists (
           select 1 from servicios_postventa s
            where s.cuenta_id = p_cuenta and s.es_prueba = es_cuenta_prueba()
         )
      or exists (
           select 1 from soporte_tecnico s
            where s.cuenta_id = p_cuenta and s.es_prueba = es_cuenta_prueba()
         )
$function$;
