-- ============================================================
-- CRM EFAMEINSA · Migración 0105 · El informe encuentra su venta
-- ============================================================
-- INCIDENTE DEL 28-08. Katerine (C5) le dijo a Santos: «mi cierre que ingresé,
-- indica Central que no le ha llegado». Los hechos, en orden, son estos:
--
--   11:29  crea el informe de cierre de CERDOS SUR PERÚ
--   11:36  lo EMITE — código 002-2026, serie OPEN, con su adjunto
--   11:55  recién registra la venta (US$ 2.250)
--
-- O sea que el informe sí llegó: está en la cola de Central desde las 11:36. Lo
-- que falló es lo otro — su propia pantalla le seguía diciendo «venta sin
-- informe de cierre», porque el informe se emitió ANTES de que la venta
-- existiera y no había a qué atarlo. El formulario ofrece elegir la venta, pero
-- a las 11:36 esa venta todavía no estaba en la lista.
--
-- Y ese orden no es un error de ella: emitir el cierre y después registrar la
-- venta es una forma perfectamente razonable de trabajar. El sistema tiene que
-- aguantar los dos órdenes.
--
-- POR QUÉ UN TRIGGER Y NO CÓDIGO EN LA APLICACIÓN. La venta se registra desde
-- una función SQL (`registrar_venta`) y el informe se emite desde otra ruta; el
-- día que aparezca una tercera —una carga masiva, una corrección— volvería a
-- pasar lo mismo. Atándolo en la base, se atan todas.
--
-- LA REGLA ES CONSERVADORA A PROPÓSITO: solo ata cuando no hay ninguna duda —un
-- solo informe suelto y una sola venta suelta de ese cliente, y con menos de
-- una semana de diferencia—. Ante dos candidatos no adivina: prefiere dejar el
-- aviso en pantalla, que es molesto pero honesto, antes que atar la venta
-- equivocada, que es silencioso y falso.

-- ------------------------------------------------------------
-- Primero: atar la venta no es modificar el documento
-- ------------------------------------------------------------
-- Un informe emitido está congelado (0050) salvo para agregarle un documento
-- al expediente (0099), y está bien que así sea. Pero `venta_id` no es parte
-- del documento: no sale impreso, no cambia una cifra, no cambia un nombre. Es
-- la etiqueta que dice a qué venta corresponde este papel — y justamente por
-- estar congelada, el informe de Katerine no podía encontrar su venta.
--
-- Se descuenta igual que `adjuntos`, y con una condición que la deja tan
-- estricta como estaba: solo de NULL a un valor. Una vez atado, no se
-- desata ni se cambia de venta.
create or replace function bloquear_edicion_informe()
returns trigger language plpgsql as $fn$
begin
  if old.emitido_at is not null and new.emitido_at is not null then
    if (to_jsonb(new) - 'adjuntos' - 'updated_at' - 'codigo' - 'venta_id')
       is distinct from (to_jsonb(old) - 'adjuntos' - 'updated_at' - 'codigo' - 'venta_id') then
      raise exception 'El informe % ya fue emitido y no se modifica', old.codigo;
    end if;

    if old.venta_id is not null and new.venta_id is distinct from old.venta_id then
      raise exception 'El informe % ya está atado a su venta y no se cambia', old.codigo;
    end if;

    -- Append-only: los que ya estaban tienen que seguir estando, iguales.
    if not (new.adjuntos @> old.adjuntos) then
      raise exception 'Del informe % los documentos solo se agregan: uno ya adjuntado no se quita ni se reemplaza', old.codigo;
    end if;
  end if;
  return new;
end;
$fn$;

comment on function bloquear_edicion_informe() is
  'Un informe emitido no se modifica (0050), salvo para AGREGAR un documento al expediente (0099) o para atarlo por primera vez a su venta (0105).';

-- ------------------------------------------------------------
-- Y ahora sí: que se encuentren
-- ------------------------------------------------------------
create or replace function atar_informe_a_venta()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  v_cuenta uuid;
  v_informe uuid;
  v_venta uuid;
  v_fecha date;
begin
  -- Se dispara desde los dos lados; cada uno trae su cuenta y su fecha.
  if tg_table_name = 'ventas' then
    select o.cuenta_id into v_cuenta from oportunidades o where o.id = new.oportunidad_id;
    v_fecha := new.fecha_venta;
  else
    v_cuenta := new.cuenta_id;
    v_fecha := new.fecha;
  end if;
  if v_cuenta is null then return new; end if;

  -- Un solo informe emitido y sin venta atada.
  select i.id into v_informe
    from informes_cierre i
   where i.cuenta_id = v_cuenta
     and i.emitido_at is not null
     and i.venta_id is null
     and abs(i.fecha - v_fecha) <= 7
   limit 2;
  if not found then return new; end if;
  if (select count(*) from informes_cierre i
       where i.cuenta_id = v_cuenta and i.emitido_at is not null and i.venta_id is null
         and abs(i.fecha - v_fecha) <= 7) > 1 then
    return new;  -- dos candidatos: no se adivina
  end if;

  -- Una sola venta del CRM sin informe.
  select v.id into v_venta
    from ventas v
    join oportunidades o on o.id = v.oportunidad_id
   where o.cuenta_id = v_cuenta
     and v.origen = 'crm'
     and abs(v.fecha_venta - v_fecha) <= 7
     and not exists (select 1 from informes_cierre x where x.venta_id = v.id)
   limit 2;
  if not found then return new; end if;
  if (select count(*) from ventas v join oportunidades o on o.id = v.oportunidad_id
       where o.cuenta_id = v_cuenta and v.origen = 'crm'
         and abs(v.fecha_venta - v_fecha) <= 7
         and not exists (select 1 from informes_cierre x where x.venta_id = v.id)) > 1 then
    return new;
  end if;

  update informes_cierre set venta_id = v_venta where id = v_informe;
  return new;
end;
$fn$;

comment on function atar_informe_a_venta is
  'Ata el informe de cierre con su venta sin importar cuál se registró primero. Solo cuando hay un único candidato de cada lado y menos de una semana entre ambos: ante la duda no ata (migración 0105).';

-- Al registrar la venta: busca el informe que se emitió antes (el caso de C5).
drop trigger if exists trg_venta_busca_informe on ventas;
create trigger trg_venta_busca_informe after insert on ventas
  for each row execute function atar_informe_a_venta();

-- Al emitir el informe: busca la venta que ya estaba (el caso inverso).
drop trigger if exists trg_informe_busca_venta on informes_cierre;
create trigger trg_informe_busca_venta after update of emitido_at on informes_cierre
  for each row when (new.emitido_at is not null and old.emitido_at is null and new.venta_id is null)
  execute function atar_informe_a_venta();

-- ------------------------------------------------------------
-- Lo que ya quedó suelto
-- ------------------------------------------------------------
-- El de Katerine, y cualquier otro que cumpla la misma regla estricta.
do $$
declare r record;
begin
  for r in
    select i.id informe, v.id venta
      from informes_cierre i
      join ventas v on true
      join oportunidades o on o.id = v.oportunidad_id and o.cuenta_id = i.cuenta_id
     where i.emitido_at is not null
       and i.venta_id is null
       and v.origen = 'crm'
       and abs(v.fecha_venta - i.fecha) <= 7
       and not exists (select 1 from informes_cierre x where x.venta_id = v.id)
  loop
    update informes_cierre set venta_id = r.venta where id = r.informe and venta_id is null;
  end loop;
end $$;
