-- ============================================================
-- CRM EFAMEINSA · Migración 0077 · El correlativo no vuelve a pisar uno usado
-- ============================================================
-- El 25-08 el CRM emitió DOS cotizaciones de la serie OPEN con números que ya
-- pertenecían a otros documentos, y las dos salieron al cliente:
--
--   Presu_447-26  CERSUR             ya era  447-26  ZERCOM PERÚ S.A.C
--   Presu_448-26  San Juan de Dios   ya era  448-26  YOPLAC OCHOA
--
-- POR QUÉ PASÓ. El contador se siembra a mano (migración 0038) con «el último
-- número oficial leído del archivo»: para OPEN se sembró 446, pero el archivo
-- ya tenía 447, 448 y 449, y la serie real iba por 461 — gerencia lo confirmó
-- ese mismo día. El contador andaba quince números atrás y nada lo detenía,
-- porque `siguiente_correlativo_anual` solo sabía sumar uno.
--
-- Es exactamente lo que el CRM vino a evitar. La regla que gerencia dio el
-- 14-08 y que originó toda la inmutabilidad de cotizaciones (migración 0012)
-- fue: «les ha pasado que el mismo número se envía al cliente con dos precios
-- distintos». La inmutabilidad protegía el documento una vez emitido, pero
-- nada protegía el NÚMERO en el momento de emitirlo.
--
-- LO QUE CAMBIA. Antes de entregar un número se comprueba que no exista ya —
-- ni en las cotizaciones del CRM ni en el archivo de documentos— y si existe,
-- se salta al siguiente. El contador queda donde corresponde, así que el salto
-- se paga una sola vez.
--
-- POR QUÉ SALTAR Y NO FALLAR. Si el número está ocupado, negarse a emitir
-- dejaría al comercial sin poder mandar su cotización y sin entender por qué.
-- Saltar es la respuesta correcta: un hueco en la numeración se explica en una
-- frase; dos clientes con el mismo número, no.
--
-- El tope de saltos existe para que un error de datos —un archivo con miles de
-- números falsos— no deje la función girando: prefiere fallar ruidosamente a
-- consumir la serie entera.

create or replace function siguiente_correlativo_anual(p_serie text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anio   integer := extract(year from (now() at time zone 'America/Lima'))::integer;
  v_clave  text    := p_serie || '-' || v_anio;
  v        integer;
  v_saltos integer := 0;
begin
  insert into correlativos (clave, ultimo) values (v_clave, 0)
    on conflict (clave) do nothing;

  loop
    update correlativos set ultimo = ultimo + 1 where clave = v_clave
      returning ultimo into v;
    if v is null then
      raise exception 'No se pudo asignar el correlativo de la serie %', p_serie;
    end if;

    exit when not exists (
        select 1 from cotizaciones
         where serie = p_serie::serie_cotizacion and correlativo = v
      ) and not exists (
        select 1 from cotizaciones_historicas
         where serie = p_serie::serie_cotizacion and anio = v_anio and correlativo = v
      );

    v_saltos := v_saltos + 1;
    raise notice 'Correlativo %-% ya estaba usado; se salta.', v, v_anio;
    if v_saltos > 500 then
      raise exception 'La serie % tiene 500 números seguidos ocupados: revisar el archivo antes de seguir emitiendo', p_serie;
    end if;
  end loop;

  return v;
end $$;

comment on function siguiente_correlativo_anual(text) is
  'Correlativo de cotizaciones por serie y año. Nunca devuelve un número que ya exista en cotizaciones o en el archivo histórico: si lo encuentra ocupado, salta al siguiente (migración 0077).';
