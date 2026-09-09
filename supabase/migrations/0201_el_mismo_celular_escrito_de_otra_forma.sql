-- ============================================================
-- CRM EFAMEINSA · Migración 0201 · El mismo celular, escrito de otra forma
-- ============================================================
-- La señorita de postventa, 09-09: «Derivaron dos veces la misma solicitud,
-- cuando ya ha sido atendido». Y era verdad, y no era culpa de Central.
--
-- LO QUE PASÓ, CON NOMBRES. GRUPO SANTA ELENA pidió la cotización del
-- mantenimiento preventivo de su centrífuga de Chancay y volvió a pedirla tres
-- veces: PRO-09143 (04-09), PRO-09181 (07-09) y PRO-09210 (08-09). El CRM
-- archivó cada una en una FICHA DISTINTA del mismo cliente, así que en la
-- bandeja del área salieron como tres clientes que se llaman igual y ninguna
-- sabía de las otras. Con NEWREST pasó lo mismo: PRO-09114, PRO-09130,
-- PRO-09165 y PRO-09179, repartidos en tres fichas.
--
-- POR QUÉ. `asignar_lead` reconoce al cliente por documento o por teléfono. Sin
-- RUC —y estos entran por WhatsApp, sin RUC—, todo depende del teléfono, y el
-- teléfono se compara por `telefono_normalizado`, que es «los dígitos que se
-- hayan tipeado, menos el 51 de adelante». Basta un dedazo para que deje de
-- empatar y el CRM abra ficha nueva:
--
--   PRO-09181  «1 956 181 464»            → 1956181464          (un 1 de más)
--   PRO-09165  «987524031 / 987524031»    → 987524031987524031  (dos veces)
--
-- El 956181464 es la señorita Jema, que YA estaba en GRUPO SANTA ELENA S.A.
-- El 987524031 YA estaba en NEWREST PERU S.A.C. El dato para reconocerlos
-- estaba en la base; lo que falló fue la forma de leerlo.
--
-- SE MIDIÓ ANTES DE TOCAR. De los 355 contactos que el CRM lleva registrados,
-- 6 tienen un teléfono que nunca puede empatar con nada, y solo 3 de esas
-- lecturas encuentran una ficha existente: son exactamente PRO-09165 (NEWREST)
-- y PRO-09181 (GRUPO SANTA ELENA), los dos que la señorita marcó en rojo. No
-- se toca ningún caso más.
--
-- NO SE CAMBIA `normalizar_telefono`. Es una columna generada de `leads` y de
-- `contactos` —14.122 filas—, y cambiarla reescribe y revuelve empates que hoy
-- funcionan. Lo que se agrega es una SEGUNDA búsqueda que corre SOLO cuando la
-- de siempre no encontró nada: donde hoy el CRM abre ficha nueva sin mirar a
-- nadie. Ahí no hay comportamiento que romper — el resultado actual es «no lo
-- encontré».
--
-- Y SIGUE VALIENDO LA REGLA DE LA 0144: el teléfono no puede llevar el caso a
-- una empresa que el contacto nunca nombró. La comprobación `empresa_compatible`
-- va también en la búsqueda nueva.
--
-- LO QUE ESTO NO ARREGLA, dicho para que no se espere de más: PRO-09143 entró
-- con Marco Plasencia y un celular que el CRM no había visto nunca. Ese sigue
-- abriendo ficha nueva, y está bien que así sea — un número desconocido no
-- prueba nada. Esa ficha se une desde Central con «Es un cliente que ya
-- tenemos» (0200), y mientras tanto la bandeja de postventa ya no las muestra
-- como clientes distintos.

-- ------------------------------------------------------------
-- 1. Los celulares que hay ADENTRO de un campo de teléfono
-- ------------------------------------------------------------
-- Un celular peruano son 9 dígitos que empiezan en 9. Acá se buscan TODOS los
-- que aparezcan dentro del texto, esté como esté escrito: con prefijo, con un
-- dedazo adelante, con dos números pegados o separados por barras.
--
--   '1 956 181 464'              → {956181464}
--   '987524031 / 987524031'      → {987524031}
--   '989 001 284 // 942 710 197' → {989001284, 942710197}
--   '+51 987 524 031'            → {987524031}
--
-- SE LEE DE IZQUIERDA A DERECHA Y, CUANDO ENCUENTRA UNO, SALTA LOS 9 DÍGITOS.
-- Mirar todas las ventanas posibles sacaba números que nadie tiene: en
-- «989001284942710197» la ventana que pisa el final de uno y el principio del
-- otro da 900128494, un celular inventado que podría empatar con la ficha de
-- otro cliente. Eso es justo lo que la 0144 vino a impedir.
--
-- Se usa [^0-9] y no \D a propósito: en esta base las clases con barra
-- invertida devuelven el texto igual, sin dar error (ya costó una medición).
--
-- Y EL NÚMERO EXTRANJERO NO ENTRA. Un «+593 98 466 6031» de Ecuador termina en
-- nueve dígitos que empiezan en 9 y se hacía pasar por celular peruano: en la
-- prueba se llevaba el contacto a la ficha de otra persona. Si el número viene
-- escrito con su prefijo internacional y ese prefijo no es el 51, no se opina.
create or replace function public.celulares_de(t text)
returns text[] language plpgsql immutable set search_path = public as $fn$
declare
  bruto text := btrim(coalesce(t, ''));
  s text := regexp_replace(coalesce(t, ''), '[^0-9]', '', 'g');
  i int  := 1;
  r text[] := '{}'::text[];
  c text;
begin
  if bruto like '+%' and left(s, 2) <> '51' then
    return r;
  end if;
  while i <= length(s) - 8 loop
    c := substring(s from i for 9);
    if c ~ '^9[0-9]{8}$' then
      if not (c = any(r)) then r := r || c; end if;
      i := i + 9;
    else
      i := i + 1;
    end if;
  end loop;
  return r;
end;
$fn$;

comment on function public.celulares_de(text) is
  'Los celulares peruanos (9 dígitos que empiezan en 9) que hay dentro de un campo '
  'de teléfono, esté como esté escrito. Usada por asignar_lead (0201).';

-- ------------------------------------------------------------
-- 2. La segunda búsqueda entra en asignar_lead
-- ------------------------------------------------------------
-- Se parcha la definición VIVA con reemplazos verificados. Copiar el cuerpo de
-- esta función ya revivió reglas revertidas tres veces: la 0141, la 0143, la
-- 0144 y la 0158 viven todas dentro de este mismo texto.
do $$
declare
  v_def   text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'asignar_lead' limit 1;
  if v_def is null then
    raise exception 'No existe la función asignar_lead';
  end if;

  -- 2.a · Una variable donde guardar los celulares del contacto, para no
  --       recalcularlos en cada fila de `cuentas`.
  v_nuevo := replace(
    v_def,
    '  v_sede          uuid;',
    '  v_sede          uuid;'  || chr(10) ||
    '  v_celulares     text[];'
  );
  if v_nuevo = v_def then
    raise exception 'No se encontró la declaración de v_sede en asignar_lead';
  end if;

  -- 2.b · La búsqueda nueva, justo después de la de siempre y antes de las
  --       sedes: si la de siempre encontró ficha, esto ni se ejecuta.
  v_def := v_nuevo;
  v_nuevo := replace(
    v_def,
    '  limit 1;
    -- Una institución con sedes bajo un mismo RUC (ESSALUD, Marina, MINSA)',
    '  limit 1;

    -- EL MISMO CELULAR ESCRITO DE OTRA FORMA (0201). Solo si arriba no se
    -- encontró nada: acá la alternativa no es «otra ficha», es «ficha nueva».
    -- Un dedazo adelante del número o dos veces el mismo número pegados hacían
    -- que GRUPO SANTA ELENA y NEWREST abrieran ficha por cada consulta, y el
    -- área veía la misma solicitud derivada tres veces (09-09).
    -- Se entra por `contactos` y no por `cuentas`: así el celular de cada
    -- contacto se lee UNA vez (14.122 filas, 200 ms medidos) en vez de una vez
    -- por cada ficha. Y solo se llega acá cuando lo de arriba no encontró nada.
    if v_cuenta_id is null and v_lead.telefono is not null then
      v_celulares := celulares_de(v_lead.telefono);
      if cardinality(v_celulares) > 0 then
        select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual
          from contactos ct
          join cuentas c on c.id = ct.cuenta_id
         where celulares_de(ct.telefono) && v_celulares
           and empresa_compatible(v_lead.razon_social, c.razon_social)
         -- La ficha con RUC manda sobre la que no lo tiene: es la de verdad,
         -- la otra es el duplicado que dejó un contacto sin documento.
         order by (c.tipo_doc <> ''SIN_DOC'') desc, c.created_at
         limit 1;
      end if;
    end if;

    -- Una institución con sedes bajo un mismo RUC (ESSALUD, Marina, MINSA)'
  );
  if v_nuevo = v_def then
    raise exception 'No se encontró la búsqueda por teléfono en asignar_lead';
  end if;

  execute v_nuevo;
end $$;
