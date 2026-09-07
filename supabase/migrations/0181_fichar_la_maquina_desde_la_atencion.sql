-- ============================================================
-- CRM EFAMEINSA · Migración 0181 · Fichar la máquina desde la atención
-- ============================================================
-- Reportado por Lesly (postventa) el 07-09: «esta parte no permite registrar
-- nada; por más que ya ha sido atendido, sale como pendiente por atender».
--
-- QUÉ PASABA. El primer paso de una atención es verificar la garantía, y eso
-- solo se puede hacer eligiendo la máquina del cliente. Cuando el cliente no
-- tiene ninguna máquina registrada, el panel sale vacío y la pantalla se queda
-- sin ningún botón: la atención no avanza ni se puede cerrar. Las 18 atenciones
-- vivas estaban ahí, 16 sin salida posible, la más antigua de hace 7 días.
--
-- El fondo es que el parque instalado no se llena solo: de los 205 clientes que
-- compraron este año, 148 no tienen ninguna máquina. Una máquina solo nacía al
-- cerrar un pedido con su serie escrita — 10 de 198 pedidos.
--
-- LO QUE ABRE ESTA MIGRACIÓN, y por qué así:
--
-- 1. LA SERIE DEJA DE SER OBLIGATORIA. Es la identidad de la máquina y hay que
--    pedirla siempre, pero el cliente que llama porque su calandria no calienta
--    muchas veces todavía no mandó la foto de la placa. Registrar la máquina
--    «sin serie todavía» y completarla después es mejor que no registrar nada.
--    El índice único sigue igual: en Postgres varios NULL no chocan entre sí,
--    así que las series de verdad se siguen protegiendo contra duplicados.
--
--    Este criterio no es nuevo: la pantalla de «Registrar un caso» ya lo hace
--    desde el 28-08 —«esa serie no está en el parque instalado; elija el
--    cliente y el caso se registra igual»—. Lo que faltaba era poder hacer lo
--    mismo desde la atención, que es por donde entra lo que deriva Central.
--
-- 2. SE PUEDE SEGUIR SIN IDENTIFICAR LA MÁQUINA. Cuando no hay forma de saber
--    de qué equipo habla el cliente, la atención avanza dejando ESCRITO que la
--    garantía quedó sin verificar y por qué. Se registra como lo que es —un
--    dato que falta— en vez de inventar un «sin garantía» que después nadie
--    puede desmentir. Un cliente con un problema no puede quedar en el aire
--    porque falte un dato administrativo.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · La serie deja de ser obligatoria
-- ------------------------------------------------------------
alter table public.equipos_instalados
  alter column serie drop not null;

comment on column public.equipos_instalados.serie is
  'Número de serie de la placa: la identidad de la máquina. Se pide SIEMPRE, pero admite quedar en null cuando el cliente todavía no la mandó — mejor la máquina fichada sin serie que la atención trabada (Lesly, 07-09). El índice ux_equipos_serie sigue impidiendo dos máquinas con la misma serie.';

-- De dónde salió cada ficha: las que nacen de una llamada no tienen pedido ni
-- informe de cierre detrás, y conviene poder distinguirlas cuando lleguen las
-- guías de remisión y haya que completarlas.
alter table public.equipos_instalados
  add column if not exists registrado_por uuid references perfiles (id),
  add column if not exists registrado_en text;

comment on column public.equipos_instalados.registrado_en is
  'Dónde se fichó la máquina: «atencion», «parque» (alta manual), o null para las que vienen de un pedido o de la carga histórica.';

-- ------------------------------------------------------------
-- 2 · Seguir sin identificar la máquina
-- ------------------------------------------------------------
alter table public.atenciones
  add column if not exists garantia_omitida_at timestamptz,
  add column if not exists garantia_omitida_por uuid references perfiles (id),
  add column if not exists garantia_omitida_motivo text;

comment on column public.atenciones.garantia_omitida_at is
  'Cuándo se decidió seguir sin identificar la máquina. Con esto la atención avanza al diagnóstico, pero en_garantia queda en null a propósito: no se sabe, y el acta de la etapa lo dice con todas sus letras.';

-- ------------------------------------------------------------
-- 3 · Fichar la máquina, en una sola operación
-- ------------------------------------------------------------
-- Va como función de la base y no en el servidor de la aplicación porque hace
-- dos cosas que tienen que pasar juntas o no pasar: crear la máquina y dejarla
-- vinculada a la atención con su garantía ya verificada. Si se hicieran por
-- separado y fallara la segunda, quedaría una máquina huérfana y la atención
-- igual de trabada que antes.
--
-- La garantía la calcula el trigger de siempre (calcular_garantia_equipo) a
-- partir de la fecha y los meses; acá no se duplica esa cuenta.
create or replace function public.fichar_equipo(
  p_cuenta        uuid,
  p_serie         text default null,
  p_modelo        text default null,
  p_producto      uuid default null,
  p_fecha_compra  date default null,
  p_garantia_meses int default 24,
  p_ubicacion     text default null,
  p_atencion      uuid default null,
  p_registrado_en text default 'parque'
) returns uuid
language plpgsql
security invoker              -- a propósito: manda la RLS de quien lo llama
set search_path to 'public'
as $function$
declare
  v_serie   text := nullif(btrim(coalesce(p_serie, '')), '');
  v_equipo  uuid;
  v_cuenta  uuid := p_cuenta;
begin
  if p_atencion is not null and v_cuenta is null then
    select cuenta_id into v_cuenta from atenciones where id = p_atencion;
  end if;
  if v_cuenta is null then
    raise exception 'Hay que decir de qué cliente es la máquina';
  end if;

  -- La misma serie no se ficha dos veces: si ya está, se reusa esa ficha y se
  -- la ata a la atención. Que dos personas atiendan la misma llamada no puede
  -- terminar en dos máquinas iguales en el parque.
  if v_serie is not null then
    select id into v_equipo from equipos_instalados
     where upper(btrim(serie)) = upper(v_serie);
  end if;

  if v_equipo is null then
    insert into equipos_instalados (
      serie, cuenta_id, producto_id, modelo_texto, fecha_venta,
      garantia_meses, ubicacion, registrado_por, registrado_en
    ) values (
      v_serie, v_cuenta, p_producto, nullif(btrim(coalesce(p_modelo, '')), ''), p_fecha_compra,
      coalesce(p_garantia_meses, 24), nullif(btrim(coalesce(p_ubicacion, '')), ''),
      auth.uid(), p_registrado_en
    )
    returning id into v_equipo;
  end if;

  -- Si vino desde una atención, queda vinculada y con la garantía verificada:
  -- es el mismo clic que ya daba el panel de las series.
  if p_atencion is not null then
    update atenciones a
       set equipo_id = v_equipo,
           en_garantia = (select coalesce(e.garantia_hasta >= current_date, false)
                            from equipos_instalados e where e.id = v_equipo),
           hizo_preventivo = (select coalesce(e.ultimo_mantenimiento is not null, false)
                                from equipos_instalados e where e.id = v_equipo),
           garantia_verificada_at = now(),
           garantia_verificada_por = auth.uid()
     where a.id = p_atencion;
  end if;

  return v_equipo;
end;
$function$;

comment on function public.fichar_equipo is
  'Registra una máquina en el parque instalado y, si viene de una atención, la vincula dejando la garantía verificada. Creada el 07-09 porque no existía ninguna forma de dar de alta una máquina fuera de cerrar un pedido.';

grant execute on function public.fichar_equipo(uuid, text, text, uuid, date, int, text, uuid, text) to authenticated;
