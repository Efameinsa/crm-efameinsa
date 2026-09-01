-- ============================================================
-- CRM EFAMEINSA · Migración 0144 · El teléfono solo no archiva en otro cliente
-- ============================================================
-- El 01-09 postventa recibió «DANNY BERNUY está esperando que lo atiendan», y
-- al abrir el aviso le salía otra empresa: LOGISMINSA, otro RUC y otra máquina.
--
-- QUÉ PASÓ. El contacto entró como «DANNY BERNUY · PERUVIAN NATURE ·
-- 985 290 984», SIN RUC. `asignar_lead` busca la ficha del cliente por
-- documento o por teléfono, y ese número figuraba —mal cargado el 27-08— en un
-- contacto de LOGISMINSA. Con eso bastó: el caso de garantía se archivó bajo un
-- cliente que no tiene nada que ver, y nadie lo vio, porque esa unión ocurre
-- sola dentro de la función. Central no la elige ni la confirma.
--
-- LO QUE ESTÁ MAL NO ES BUSCAR POR TELÉFONO. Un teléfono repetido es la forma
-- normal de reconocer a un cliente que llama y no da su RUC, y así funcionó 24
-- de 25 veces. Lo que falta es la comprobación que hace cualquiera al oírlo: si
-- el que llama dice que es de PERUVIAN NATURE, esa ficha no puede ser la de
-- LOGISTIC INDUSTRY & MINING. Cuando el nombre de empresa que trae el contacto
-- no tiene NADA que ver con el de la ficha, el teléfono deja de alcanzar.
--
-- SE MIDIÓ ANTES DE TOCAR: de los 25 contactos que el CRM archivó por teléfono
-- —sin documento— en toda su historia, esta regla solo cambia UNO, y es
-- justamente el de Danny Bernuy. Los otros 24 siguen igual.
--
-- Qué pasa ahora en ese caso: el teléfono no une, y el contacto abre ficha
-- nueva con el nombre que dio. Una ficha de más es un problema conocido y
-- visible —Central la ve como «nombre parecido» en sus coincidencias y se
-- fusiona—; un caso de garantía archivado en otro cliente no lo ve nadie.

-- ------------------------------------------------------------
-- 1. Las palabras que de verdad nombran a una empresa
-- ------------------------------------------------------------
-- Se quitan las que no distinguen a nadie (SOCIEDAD, ANONIMA, SERVICIOS…) y
-- las de menos de cuatro letras, que son las siglas del tipo de empresa.
create or replace function tokens_empresa(p text)
returns text[] language sql immutable set search_path = public as $fn$
  select coalesce(array_agg(distinct t), '{}'::text[])
    from unnest(
      regexp_split_to_array(
        translate(upper(coalesce(p, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
        '[^A-Z0-9]+')
    ) as t
   where length(t) >= 4
     and t <> all (array[
       'SOCIEDAD','ANONIMA','CERRADA','LIMITADA','EMPRESA','INDIVIDUAL','RESPONSABILIDAD',
       'SERVICIOS','SERVICIO','GENERALES','GENERAL','GRUPO','CORPORACION','INVERSIONES',
       'NEGOCIOS','COMERCIAL','INDUSTRIAS','INDUSTRIA','PERU','CONTRATISTAS','REPRESENTACIONES',
       'DISTRIBUIDORA','MULTISERVICIOS','SOLUCIONES']);
$fn$;

comment on function tokens_empresa(text) is
  'Las palabras con las que se reconoce a una empresa: sin tildes, sin las que no distinguen '
  'a nadie y sin siglas. Usada por empresa_compatible (0144).';

-- ------------------------------------------------------------
-- 2. ¿Pueden ser la misma empresa?
-- ------------------------------------------------------------
-- Basta UNA palabra en común: se trata de descartar lo que no tiene ninguna
-- relación, no de exigir que el nombre esté escrito igual. Si de alguno de los
-- dos lados no queda ninguna palabra útil, no se opina: devuelve `true` y manda
-- la regla de siempre.
create or replace function empresa_compatible(p_contacto text, p_ficha text)
returns boolean language sql immutable set search_path = public as $fn$
  select case
    when cardinality(tokens_empresa(p_contacto)) = 0 then true
    when cardinality(tokens_empresa(p_ficha)) = 0 then true
    else tokens_empresa(p_contacto) && tokens_empresa(p_ficha)
  end;
$fn$;

comment on function empresa_compatible(text, text) is
  'Si el nombre de empresa que trae un contacto puede ser el de una ficha (0144). '
  'Con nombres sin palabras útiles no opina: devuelve true.';

-- ------------------------------------------------------------
-- 3. La comprobación entra en la búsqueda de ficha
-- ------------------------------------------------------------
do $$
declare
  v_def   text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'asignar_lead' limit 1;
  if v_def is null then
    raise exception 'No existe la función asignar_lead';
  end if;

  v_nuevo := replace(
    v_def,
    '     or (
       v_lead.telefono_normalizado is not null
       and exists (',
    '     or (
       v_lead.telefono_normalizado is not null
       -- El teléfono une al cliente que llama sin dar su RUC, pero no puede
       -- llevar el caso a una empresa que el contacto nunca nombró (0144).
       and empresa_compatible(v_lead.razon_social, c.razon_social)
       and exists ('
  );
  if v_nuevo = v_def then
    raise exception 'No se encontró la búsqueda por teléfono en asignar_lead';
  end if;

  execute v_nuevo;
end $$;
