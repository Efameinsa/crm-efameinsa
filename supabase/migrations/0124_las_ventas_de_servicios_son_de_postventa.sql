-- ============================================================
-- CRM EFAMEINSA · Migración 0123 · Las ventas de servicios son de postventa,
--                                  y la vista de servicios se abre entera
-- ============================================================
-- Reunión con el ing. Carlos del 28-08 a las 3pm (transcripción 14.45). Bajó a
-- planta y encontró a las comerciales alrededor de la pantalla de Ariana:
-- «¿Por qué tienes tantas ventas? No has hecho ventas, ¿cómo es posible?».
-- Eran los mantenimientos históricos de los informes de cierre de R:\
-- (migración 0099): la regla de importación los asignó a Ariana (C4) y el CRM
-- los contó como suyos.
--
-- LO QUE CARLOS DECIDIÓ, textual:
--
--   1. «Todas esas ventas de postventa pertenecen a postventa propiamente,
--      vamos a llevarlo ahí.» El histórico lo trabajó Brenda como Comercial 8
--      durante cinco años; el documento de origen (.doc) queda en cada
--      oportunidad como la referencia de dónde salió.
--
--   2. «Lo has asignado, pero no pasa nada, porque no está contabilizando; lo
--      único que tendrías que decirle es que no lo contabilice, que
--      contabilice a partir de su venta.» Ariana VE la información —la
--      necesita para su ruta: «veo que ha sido el último mantenimiento del
--      equipo… ya pasó más de un año, agarro, reviso, gestiono, cotizo»— pero
--      no la suma. Ver y contabilizar se separan: contabiliza el dueño
--      (comercial_id); ver lo da la llave de servicios.
--
--   3. «Su primera venta es la que va a hacer en este momento, el cierre 10.»
--      El número 10 de la serie OPEN queda reservado para ella; el contador
--      va por el 5 y cuando llegue al 10 lo salta.
--
--   4. La vista de servicios de un comercial la abre y la cierra operaciones
--      (0116): «Administrador, ¿me puedes dar la vista? Voy a cotizar
--      mantenimiento. ¿Terminaste? Chau, desactivado.» Mientras está abierta,
--      la vista es COMPLETA: todo el histórico de mantenimientos y repuestos,
--      porque sin el histórico no se puede cotizar con criterio. A Ariana la
--      llave le queda abierta —vender servicios es su oficio de todos los
--      días—, pero es la misma llave: no hay caso especial.
--
-- LO QUE NO SE TOCA. Las 385 ventas de C4 que vinieron del maestro de Excel
-- (origen historico_excel, sin documento_origen) se quedan donde están: son
-- el registro comercial que el maestro le atribuye, existían antes de la
-- importación de postventa y no fueron el reclamo. La cuenta tampoco cambia
-- de dueño (regla de la 0080).

-- ------------------------------------------------------------
-- 1. Los 145 mantenimientos importados de los informes pasan a Post Venta.
--    Solo los que vinieron de un .doc (documento_origen) — la campaña de
--    llamadas de Ariana (102 filtradas del 27-08) es suya y se queda.

with c4 as (select id from perfiles where codigo_comercial = 'C4' and activo),
     pv as (select id from perfiles where codigo_comercial = 'PV' and activo)
update oportunidades o
   set comercial_id = (select id from pv)
 where o.comercial_id = (select id from c4)
   and o.documento_origen is not null
   and o.tipo_postventa = 'mantenimiento';

-- ------------------------------------------------------------
-- 2. La vista completa de servicios: quien tiene la llave (`puede_postventa()`
--    = el área, o un comercial con `hace_postventa` abierto por operaciones)
--    LEE todo lo de servicios — oportunidades de mantenimiento/repuesto/
--    garantía, sus gestiones, sus cotizaciones, el parque instalado y los
--    informes de servicio. Leer, no tocar: las políticas de escritura no
--    cambian. Todas las funciones van envueltas en (select …) — la lección de
--    la 0109: sin eso se evalúan una vez por fila.

drop policy if exists oportunidades_servicios_select on oportunidades;
create policy oportunidades_servicios_select on oportunidades for select to authenticated
  using (tipo_postventa is not null and (select puede_postventa()));

drop policy if exists actividades_servicios_select on actividades;
create policy actividades_servicios_select on actividades for select to authenticated
  using ((select puede_postventa()) and exists (
    select 1 from oportunidades o
     where o.id = actividades.oportunidad_id and o.tipo_postventa is not null));

drop policy if exists cotizaciones_servicios_select on cotizaciones;
create policy cotizaciones_servicios_select on cotizaciones for select to authenticated
  using ((select puede_postventa()) and exists (
    select 1 from oportunidades o
     where o.id = cotizaciones.oportunidad_id and o.tipo_postventa is not null));

-- El parque instalado entero, no solo el de la propia cartera: la ruta de
-- mantenimiento llama a clientes de otras carteras (0095) y la pregunta que
-- ordena la llamada es el último mantenimiento de la máquina.
drop policy if exists equipos_servicios_select on equipos_instalados;
create policy equipos_servicios_select on equipos_instalados for select to authenticated
  using ((select puede_postventa()) and es_prueba = (select es_cuenta_prueba()));

drop policy if exists informes_serv_servicios_select on informes_servicio;
create policy informes_serv_servicios_select on informes_servicio for select to authenticated
  using ((select puede_postventa()) and es_prueba = (select es_cuenta_prueba()));

-- ------------------------------------------------------------
-- 3. La llave de Ariana queda abierta. La 0116 la dejó en false para todos al
--    volver el permiso repartible, y con eso Ariana perdió su «Ruta de
--    mantenimiento» del menú — una regresión, no una decisión. Se abre por la
--    misma vía que usaría Lesly, para que su pantalla diga desde cuándo.

update perfiles
   set hace_postventa = true,
       mantenimiento_desde = now()
 where codigo_comercial = 'C4' and activo;

-- ------------------------------------------------------------
-- 4. El cierre N.º 10 de la serie OPEN es de Ariana. «Le damos un número 10…
--    y después lo agregamos el 10 mientras que van sumándose»: reservar el
--    número, y que el contador lo salte cuando pase por ahí.

create table if not exists correlativos_reservas (
  clave      text        not null,
  numero     integer     not null,
  perfil_id  uuid        not null references perfiles(id),
  motivo     text        not null,
  created_at timestamptz not null default now(),
  primary key (clave, numero)
);

comment on table correlativos_reservas is
  'Números de documento apartados para alguien antes de que el contador llegue (reunión 28-08: «para Ariana, número 10»). El contador los salta; al emitir, el dueño de la reserva recibe su número y la reserva se consume.';

alter table correlativos_reservas enable row level security;
-- Nadie la toca desde la aplicación: la leen y escriben las funciones
-- security definer y las migraciones.

insert into correlativos_reservas (clave, numero, perfil_id, motivo)
select 'INFORME-OPEN-2026', 10, id,
       'Primera venta de Ariana — Carlos, reunión del 28-08: «su primera venta es la que va a hacer en este momento, el cierre 10»'
  from perfiles where codigo_comercial = 'C4' and activo
on conflict (clave, numero) do nothing;

-- El contador aprende la lección de la 0077: antes de entregar un número
-- comprueba que no esté usado ni reservado, y si lo está, salta. El tope de
-- saltos evita que un error de datos consuma la serie girando.
create or replace function siguiente_correlativo_informe(p_serie serie_cotizacion, p_anio integer)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_clave  text := 'INFORME-' || p_serie::text || '-' || p_anio::text;
  v_valor  integer;
  v_saltos integer := 0;
begin
  insert into correlativos (clave, ultimo) values (v_clave, 0) on conflict (clave) do nothing;
  loop
    update correlativos set ultimo = ultimo + 1 where clave = v_clave returning ultimo into v_valor;
    if v_valor is null then
      raise exception 'No se pudo asignar el correlativo del informe %', v_clave;
    end if;
    exit when not exists (
        select 1 from informes_cierre
         where serie = p_serie and anio = p_anio and correlativo = v_valor)
      and not exists (
        select 1 from correlativos_reservas where clave = v_clave and numero = v_valor);
    v_saltos := v_saltos + 1;
    if v_saltos > 200 then
      raise exception 'La serie % saltó más de 200 números seguidos: revisar correlativos y reservas', v_clave;
    end if;
  end loop;
  return v_valor;
end;
$fn$;

-- Al emitir: si quien escribió el informe tiene un número reservado en esa
-- serie y ese año, ese es su número, y la reserva se consume. Si no, el
-- contador de siempre.
create or replace function emitir_informe(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_informe informes_cierre%rowtype;
  v_correlativo integer;
  v_clave text;
begin
  select * into v_informe from informes_cierre where id = p_id;
  if v_informe is null then
    raise exception 'Informe no encontrado';
  end if;
  -- Autorización: la misma regla de las políticas RLS, repetida acá porque la
  -- función es security definer y se salta RLS.
  if not es_backoffice()
     and not exists (select 1 from cuentas c where c.id = v_informe.cuenta_id and c.comercial_id = auth.uid()) then
    raise exception 'No autorizado para emitir este informe';
  end if;
  -- Emitir dos veces devolvería el mismo documento con dos números.
  if v_informe.emitido_at is not null then
    raise exception 'El informe % ya fue emitido', v_informe.codigo;
  end if;
  if jsonb_array_length(v_informe.items) = 0 then
    raise exception 'El informe necesita al menos un equipo';
  end if;

  v_clave := 'INFORME-' || v_informe.serie::text || '-' || v_informe.anio::text;

  -- ¿El autor tiene un número apartado en esta serie? El más bajo es suyo y
  -- se consume. Si el número ya lo hubiera pisado alguien (no debería: el
  -- contador lo salta), la reserva se descarta y sigue el contador.
  select r.numero into v_correlativo
    from correlativos_reservas r
   where r.clave = v_clave
     and r.perfil_id = v_informe.creado_por
     and not exists (
       select 1 from informes_cierre i
        where i.serie = v_informe.serie and i.anio = v_informe.anio and i.correlativo = r.numero)
   order by r.numero
   limit 1;

  if v_correlativo is not null then
    delete from correlativos_reservas where clave = v_clave and numero = v_correlativo;
  else
    v_correlativo := siguiente_correlativo_informe(v_informe.serie, v_informe.anio);
  end if;

  update informes_cierre
     set correlativo = v_correlativo, emitido_at = now()
   where id = p_id;

  return lpad(v_correlativo::text, 3, '0') || '-' || v_informe.anio::text;
end;
$fn$;
