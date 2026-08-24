-- ============================================================
-- CRM EFAMEINSA · Migración 0068 · Sin precio piso, decide gerencia
-- ============================================================
-- Encontrado el 24-08 mientras se revisaba por qué una cotización de equipos
-- semi-industriales pedía aprobación sin motivo. El motivo era otro (un equipo
-- mal clasificado, ya corregido), pero al mirar los datos apareció lo contrario
-- y peor:
--
--     US$ 21.394 cotizados por DEBAJO del precio de lista sin que nadie
--     revisara nada.
--
-- Entre ellos, una LG TITAN MAX de lista 8.590 cotizada en 6.600 —1.990 menos—
-- en cuatro cotizaciones, tres de ellas ya ENVIADAS al cliente.
--
-- POR QUÉ NO SALTÓ LA ALARMA. `bajo_lista` compara el precio pedido contra el
-- precio PISO del equipo: tier 'deseado' en semi-industrial, 'base' en
-- industrial. Cinco de los diez semi-industriales nunca tuvieron cargado el
-- 'deseado' — el cargador del 22-08 solo trajo un precio por equipo y los tres
-- niveles los define gerencia (docs/03 R5). Sin piso, la comparación da NULL,
-- `bajo_lista` queda en false y el descuento pasa como si estuviera aprobado.
--
-- O sea que el silencio se estaba leyendo como aprobación. No lo es: quiere
-- decir que NADIE HA DEFINIDO hasta dónde se puede bajar ese equipo, y por lo
-- tanto nadie puede certificar que el precio esté bien.
--
-- A partir de acá, un equipo sin precio piso va a gerencia. Es incómodo —
-- afecta a los cinco semi-industriales sin 'deseado'— y esa incomodidad es el
-- punto: se arregla sola en cuanto gerencia cargue los tres niveles de precio,
-- que es lo que corresponde. Mientras tanto, nada sale sin que alguien lo mire.

create or replace function exige_aprobacion_gerencia(p_producto_id uuid, p_bajo_lista boolean)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(p_bajo_lista, false)
      -- Industrial: el precio de lista es un punto de partida, no un precio
      -- cerrado (migración 0067).
      or exists (
        select 1 from productos p
         where p.id = p_producto_id and p.segmento = 'industrial'
      )
      -- Sin precio piso definido no hay contra qué comparar: el sistema no
      -- puede decir que el precio esté bien, así que pregunta.
      or exists (
        select 1 from productos p
         where p.id = p_producto_id
           and not exists (
             select 1 from precios_producto pp
              where pp.producto_id = p.id
                and pp.vigente_hasta is null
                and pp.tier = (case when p.segmento = 'semi_industrial' then 'deseado' else 'base' end)::tier_precio
           )
      );
$$;

comment on function exige_aprobacion_gerencia(uuid, boolean) is
  'Regla única: gerencia decide sobre un equipo si va bajo el precio piso, si es industrial, o si NO TIENE precio piso definido — porque entonces nadie puede certificar que el precio esté bien (migraciones 0067 y 0068).';
