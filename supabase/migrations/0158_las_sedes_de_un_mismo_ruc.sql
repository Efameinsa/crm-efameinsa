-- ============================================================
-- CRM EFAMEINSA · Migración 0158 · Las sedes de un mismo RUC
-- ============================================================
-- Santos, 02-09 (audio de gerencia): «para los casos puntuales como ESSALUD,
-- la Marina de Guerra del Perú y el Ministerio de Salud, solamente en esos
-- casos, cuando se reconozca por el RUC deben aparecer las opciones [de sede],
-- y ahí se puede derivar como negocios diferentes».
--
-- QUÉ PASÓ. Central registró PRO-09106 como «SEGURO SOCIAL DE SALUD (ESSALUD)
-- - RED ASISTENCIAL» con el RUC 20131257750 y lo derivó a Post Venta. A PV le
-- salió «SEGURO SOCIAL DE SALUD - HOSPITAL DEL ALTIPLANO DE LA REGION DE PUNO
-- - ESSALUD»: la única ficha con ese RUC, cargada el 14-08 del Excel de
-- Katerine. El RUC de ESSALUD es UNO para todo el país —lo comparten todas las
-- redes y hospitales— y el CRM une por RUC antes que por nombre (regla
-- correcta para una empresa; equivocada para una institución con sedes).
-- Ya había pasado: la solicitud del 27-08 (Libeth Escalante) también cayó en
-- Puno. Y con el índice único no había forma de abrir otra ficha.
--
-- En el histórico ESSALUD llega por Áncash, Arequipa, Trujillo, Ilo, Pasco,
-- Rebagliati, Sabogal, Ramiro Prialé… Antes no chocaban porque Central
-- anotaba el DNI del contacto o ningún documento.
--
-- EL MODELO. Se reutiliza el grupo económico (0052): la institución es la
-- madre y cada red u hospital es una sede hija que APUNTA a la madre. Lo
-- nuevo es que las hijas de una madre marcada `sedes_por_ruc` pueden llevar
-- el MISMO RUC que ella (la cotización sale igual al RUC, que es uno solo).
-- Para cualquier otra empresa el RUC sigue siendo único: solo las tres
-- instituciones que nombró gerencia se marcan así, y marcar otra es una
-- decisión de gerencia, no un efecto de teclear un RUC.
--
-- AL DERIVAR. Si el RUC es de una institución con sedes, Central elige la
-- sede en el diálogo (o escribe una nueva) y el CRM la deja en `leads.cuenta_id`
-- antes de asignar: `asignar_lead` ya respeta esa ficha desde la 0143. Si
-- nadie eligió (otra pantalla, la API), `asignar_lead` NO tira el caso a la
-- primera ficha: busca la sede por el nombre que dio Central y, si no existe,
-- la crea con ese nombre. A PV le llega lo que Central escribió.
-- ============================================================

-- ------------------------------------------------------------
-- 1. La marca en la madre
-- ------------------------------------------------------------
alter table cuentas
  add column if not exists sedes_por_ruc boolean not null default false;

comment on column cuentas.sedes_por_ruc is
  'Institución con muchas sedes bajo un mismo RUC (ESSALUD, Marina de Guerra, MINSA). Sus hijas (cuenta_padre_id) pueden repetir su RUC y cada una se atiende como un negocio distinto (0158). Lo marca gerencia, no el sistema.';

-- ------------------------------------------------------------
-- 2. El RUC sigue siendo único… salvo entre las sedes de una madre
-- ------------------------------------------------------------
-- El índice único queda para madres y empresas sueltas (las que no cuelgan
-- de nadie). Para las hijas decide el trigger: con RUC propio no puede
-- repetirse con nadie; con el RUC de su madre solo si la madre tiene sedes
-- por RUC y nadie de fuera de la familia lo usa. El error que se lanza es
-- el MISMO que daba el índice (23505, uq_cuentas_doc): las pantallas ya lo
-- entienden (corrección de datos del cliente, 0156).
drop index if exists uq_cuentas_doc;
create unique index uq_cuentas_doc
  on cuentas (num_doc)
  where num_doc is not null and tipo_doc <> 'SIN_DOC' and cuenta_padre_id is null;

create or replace function validar_documento_unico()
returns trigger language plpgsql set search_path = public as $fn$
declare
  v_raiz       uuid;
  v_raiz_sedes boolean;
begin
  if new.num_doc is null or new.tipo_doc = 'SIN_DOC' then
    return new;
  end if;
  if not exists (
    select 1 from cuentas o
     where o.num_doc = new.num_doc and o.tipo_doc <> 'SIN_DOC' and o.id <> new.id
  ) then
    return new;
  end if;

  v_raiz := coalesce(new.cuenta_padre_id, new.id);
  if new.cuenta_padre_id is null then
    v_raiz_sedes := new.sedes_por_ruc;
  else
    select sedes_por_ruc into v_raiz_sedes from cuentas where id = new.cuenta_padre_id;
  end if;

  if coalesce(v_raiz_sedes, false) and not exists (
    select 1 from cuentas o
     where o.num_doc = new.num_doc and o.tipo_doc <> 'SIN_DOC' and o.id <> new.id
       and coalesce(o.cuenta_padre_id, o.id) <> v_raiz
  ) then
    return new;
  end if;

  raise unique_violation using
    message = 'duplicate key value violates unique constraint "uq_cuentas_doc"',
    detail = format('Key (num_doc)=(%s) already exists.', new.num_doc),
    constraint = 'uq_cuentas_doc';
end;
$fn$;

drop trigger if exists trg_documento_unico on cuentas;
create trigger trg_documento_unico
  before insert or update of num_doc, tipo_doc, cuenta_padre_id, sedes_por_ruc on cuentas
  for each row execute function validar_documento_unico();

comment on function validar_documento_unico() is
  'Un RUC/DNI pertenece a una sola ficha, salvo entre la madre y las sedes de una institución con sedes_por_ruc (0158). Lanza el mismo 23505/uq_cuentas_doc que el índice.';

-- ------------------------------------------------------------
-- 3. Reconocer una sede por su nombre
-- ------------------------------------------------------------
create or replace function nombre_normalizado(p text)
returns text language sql immutable set search_path = public as $fn$
  select btrim(regexp_replace(
           translate(upper(coalesce(p, '')), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
           '[^A-Z0-9]+', ' ', 'g'));
$fn$;

comment on function nombre_normalizado(text) is
  'Mayúsculas, sin tildes y sin signos, para comparar nombres de sede escritos de distintas maneras (0158).';

-- La sede que le corresponde a un contacto. Recibe la ficha que encontró la
-- búsqueda por RUC y el nombre que dio Central:
--   · si esa ficha no es de una institución con sedes → la misma ficha;
--   · sin nombre → la madre (la institución en general);
--   · con nombre → la sede (o la madre) que se llama así; si no hay y
--     p_crear, se crea con ese nombre, con el RUC de la madre y SIN dueño.
create or replace function sede_para_lead(p_cuenta_id uuid, p_nombre text, p_crear boolean default true)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_c    cuentas%rowtype;
  v_raiz cuentas%rowtype;
  v_nom  text;
  v_id   uuid;
begin
  select * into v_c from cuentas where id = p_cuenta_id;
  if v_c.id is null then
    return null;
  end if;
  if v_c.sedes_por_ruc then
    v_raiz := v_c;
  elsif v_c.cuenta_padre_id is not null then
    select * into v_raiz from cuentas where id = v_c.cuenta_padre_id;
    if not coalesce(v_raiz.sedes_por_ruc, false) then
      return p_cuenta_id;
    end if;
  else
    return p_cuenta_id;
  end if;

  v_nom := nombre_normalizado(p_nombre);
  if v_nom = '' then
    return v_raiz.id;
  end if;

  select c.id into v_id
    from cuentas c
   where (c.id = v_raiz.id or c.cuenta_padre_id = v_raiz.id)
     and nombre_normalizado(c.razon_social) = v_nom
   order by (c.id = v_raiz.id) desc, c.created_at
   limit 1;
  if v_id is not null then
    return v_id;
  end if;
  if not p_crear then
    return null;
  end if;

  insert into cuentas (tipo_doc, num_doc, razon_social, cuenta_padre_id, comercial_id, rubro_id)
  values (v_raiz.tipo_doc, v_raiz.num_doc, btrim(p_nombre), v_raiz.id, null, v_raiz.rubro_id)
  returning id into v_id;
  return v_id;
end;
$fn$;

revoke all on function sede_para_lead(uuid, text, boolean) from public;

comment on function sede_para_lead(uuid, text, boolean) is
  'La sede de una institución con sedes_por_ruc que corresponde al nombre que dio Central; la crea si no existe (0158). Para una ficha común devuelve la misma ficha.';

-- ------------------------------------------------------------
-- 4. Lo que ve el diálogo de Central: la institución y sus sedes
-- ------------------------------------------------------------
create or replace function sedes_de_documento(p_num_doc text)
returns jsonb language sql security definer set search_path = public stable as $fn$
  select jsonb_build_object(
           'madre', jsonb_build_object('id', m.id, 'razon_social', m.razon_social),
           'sedes', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', s.id,
                      'razon_social', s.razon_social,
                      'comercial_id', s.comercial_id,
                      'comercial', p.nombre,
                      'codigo', p.codigo_comercial)
                    order by s.razon_social)
               from cuentas s
               left join perfiles p on p.id = s.comercial_id
              where s.cuenta_padre_id = m.id), '[]'::jsonb))
    from cuentas m
   where m.num_doc = nullif(regexp_replace(coalesce(p_num_doc, ''), '\D', '', 'g'), '')
     and m.tipo_doc <> 'SIN_DOC'
     and m.sedes_por_ruc
     and m.cuenta_padre_id is null
   limit 1;
$fn$;

revoke all on function sedes_de_documento(text) from public;
grant execute on function sedes_de_documento(text) to authenticated;

comment on function sedes_de_documento(text) is
  'Si el RUC es de una institución con sedes: la madre y la lista de sedes con su comercial, para que Central elija a cuál va el contacto (0158). Null si no lo es.';

-- Central deja dicho a qué sede va el contacto ANTES de asignarlo. Elige una
-- existente (p_cuenta_id) o escribe una nueva (p_nombre_nueva). Queda en
-- leads.cuenta_id, que asignar_lead respeta desde la 0143, y el nombre del
-- contacto pasa a ser el de la sede para que las dos pantallas digan lo mismo.
create or replace function elegir_sede_del_lead(p_lead_id uuid, p_cuenta_id uuid default null, p_nombre_nueva text default null)
returns uuid language plpgsql security definer set search_path = public as $fn$
declare
  v_lead leads%rowtype;
  v_raiz uuid;
  v_id   uuid;
begin
  if rol_actual() not in ('central', 'gerencia', 'admin') then
    raise exception 'No autorizado para elegir la sede';
  end if;
  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead.id is null then
    raise exception 'Lead % no encontrado', p_lead_id;
  end if;
  if v_lead.estado <> 'pendiente_triaje' then
    raise exception 'El lead % ya fue procesado', v_lead.codigo;
  end if;

  select m.id into v_raiz
    from cuentas m
   where m.num_doc = v_lead.num_doc and m.tipo_doc <> 'SIN_DOC' and m.sedes_por_ruc and m.cuenta_padre_id is null
   limit 1;
  if v_raiz is null then
    raise exception 'El RUC de este contacto no es de una institución con sedes';
  end if;

  if p_cuenta_id is not null then
    if not exists (select 1 from cuentas c where c.id = p_cuenta_id and (c.id = v_raiz or c.cuenta_padre_id = v_raiz)) then
      raise exception 'Esa sede no pertenece a esta institución';
    end if;
    v_id := p_cuenta_id;
  else
    if nombre_normalizado(p_nombre_nueva) = '' then
      raise exception 'Escriba el nombre de la sede';
    end if;
    v_id := sede_para_lead(v_raiz, p_nombre_nueva, true);
  end if;

  update leads
     set cuenta_id = v_id,
         razon_social = (select razon_social from cuentas where id = v_id)
   where id = p_lead_id;
  return v_id;
end;
$fn$;

revoke all on function elegir_sede_del_lead(uuid, uuid, text) from public;
grant execute on function elegir_sede_del_lead(uuid, uuid, text) to authenticated;

comment on function elegir_sede_del_lead(uuid, uuid, text) is
  'Central fija la sede (existente o nueva) a la que va un contacto de una institución con sedes, antes de asignarlo (0158).';

-- ------------------------------------------------------------
-- 5. asignar_lead: sin elección previa, la sede sale del nombre
-- ------------------------------------------------------------
-- Se parcha la definición viva (regla de la casa desde la 0129): la búsqueda
-- por RUC/teléfono sigue igual, y recién con la ficha en la mano se pregunta
-- si es una institución con sedes.
do $$
declare
  v_def   text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'asignar_lead' limit 1;
  if v_def is null then
    raise exception 'No existe la función asignar_lead';
  end if;
  if v_def like '%sede_para_lead%' then
    raise notice 'asignar_lead ya resuelve sedes; no se toca';
    return;
  end if;

  v_nuevo := replace(v_def,
    E'  v_postventa     boolean;\nbegin',
    E'  v_postventa     boolean;\n  v_sede          uuid;\nbegin');
  if v_nuevo = v_def then
    raise exception 'No se encontró el bloque declare de asignar_lead';
  end if;

  v_def := v_nuevo;
  v_nuevo := replace(v_def,
    E'  limit 1;\n  end if;\n\n  if v_cuenta_id is null then\n    -- Cliente nuevo.',
    E'  limit 1;\n' ||
    E'    -- Una institución con sedes bajo un mismo RUC (ESSALUD, Marina, MINSA)\n' ||
    E'    -- no es una ficha: es una familia. La sede sale del nombre que dio\n' ||
    E'    -- Central y, si no existe, se crea con ese nombre (0158).\n' ||
    E'    if v_cuenta_id is not null then\n' ||
    E'      v_sede := sede_para_lead(v_cuenta_id, v_lead.razon_social, true);\n' ||
    E'      if v_sede is not null and v_sede <> v_cuenta_id then\n' ||
    E'        select c.id, c.comercial_id into v_cuenta_id, v_dueño_actual from cuentas c where c.id = v_sede;\n' ||
    E'      end if;\n' ||
    E'    end if;\n' ||
    E'  end if;\n\n  if v_cuenta_id is null then\n    -- Cliente nuevo.');
  if v_nuevo = v_def then
    raise exception 'No se encontró la búsqueda de ficha en asignar_lead';
  end if;

  execute v_nuevo;
end $$;

-- ------------------------------------------------------------
-- 6. cartera_en_juego: avisa por la sede, no por la primera ficha del RUC
-- ------------------------------------------------------------
-- Si Central ya eligió la sede (leads.cuenta_id) se mira esa. Si no, la
-- que corresponde al nombre —sin crear nada: es una consulta—; una sede que
-- todavía no existe no tiene dueño, así que no hay nada que avisar.
do $$
declare
  v_def   text;
  v_nuevo text;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc where proname = 'cartera_en_juego' limit 1;
  if v_def is null then
    raise exception 'No existe la función cartera_en_juego';
  end if;
  if v_def like '%sede_para_lead%' then
    raise notice 'cartera_en_juego ya resuelve sedes; no se toca';
    return;
  end if;

  v_nuevo := replace(v_def,
    E'  if v_lead is null then return; end if;\n\n  select c.id, c.comercial_id into v_cuenta, v_dueno\n    from cuentas c\n   where (v_lead.num_doc is not null',
    E'  if v_lead is null then return; end if;\n\n' ||
    E'  -- La ficha elegida por Central manda (0143/0158).\n' ||
    E'  if v_lead.cuenta_id is not null then\n' ||
    E'    select c.id, c.comercial_id into v_cuenta, v_dueno from cuentas c where c.id = v_lead.cuenta_id;\n' ||
    E'  end if;\n\n' ||
    E'  if v_cuenta is null then\n' ||
    E'  select c.id, c.comercial_id into v_cuenta, v_dueno\n    from cuentas c\n   where (v_lead.num_doc is not null');
  if v_nuevo = v_def then
    raise exception 'No se encontró la búsqueda por documento en cartera_en_juego';
  end if;
  v_def := v_nuevo;

  v_nuevo := replace(v_def,
    E'   limit 1;\n\n  if v_cuenta is null and v_lead.tel is not null then',
    E'   limit 1;\n' ||
    E'  -- Institución con sedes: la sede del nombre, sin crearla (0158).\n' ||
    E'  if v_cuenta is not null then\n' ||
    E'    v_cuenta := sede_para_lead(v_cuenta, v_lead.razon_social, false);\n' ||
    E'    if v_cuenta is null then return; end if;\n' ||
    E'    select c.comercial_id into v_dueno from cuentas c where c.id = v_cuenta;\n' ||
    E'  end if;\n' ||
    E'  end if;\n\n  if v_cuenta is null and v_lead.tel is not null then');
  if v_nuevo = v_def then
    raise exception 'No se encontró el cierre de la búsqueda por documento en cartera_en_juego';
  end if;

  execute v_nuevo;
end $$;

-- ------------------------------------------------------------
-- 7. Las tres instituciones que nombró gerencia, y el caso de hoy
-- ------------------------------------------------------------
do $$
declare
  v_madre uuid;
  v_sede  uuid;
  v_puno  constant uuid := '7b62b9c2-f8fb-44c9-b4df-bf13e322d165';
  v_lead  constant uuid := '0f9d0f47-7ba5-4844-9b35-6d69342fc0af'; -- PRO-09106
  v_op    constant uuid := '7490b42c-0533-4c44-86f1-6769030a015c';
begin
  -- ESSALUD. La única ficha con el RUC era la del Hospital del Altiplano
  -- (Puno), de Katerine: pasa a ser una sede, con su historial y su dueña.
  -- La madre nace sin RUC, se le cuelga Puno y recién entonces toma el RUC
  -- (con Puno todavía suelta, el índice único los haría chocar).
  select id into v_madre from cuentas where num_doc = '20131257750' and sedes_por_ruc and cuenta_padre_id is null;
  if v_madre is null then
    insert into cuentas (tipo_doc, num_doc, razon_social, nombre_comercial, sedes_por_ruc, direccion, departamento, provincia, distrito)
    values ('SIN_DOC', null, 'SEGURO SOCIAL DE SALUD - ESSALUD', 'ESSALUD', true,
            'AV. DOMINGO CUETO NRO. 120 LIMA - LIMA - JESUS MARIA', 'LIMA', 'LIMA', 'JESUS MARIA')
    returning id into v_madre;
    update cuentas set cuenta_padre_id = v_madre where id = v_puno and cuenta_padre_id is null;
    update cuentas set tipo_doc = 'RUC', num_doc = '20131257750' where id = v_madre;
  end if;

  -- El caso de hoy: la solicitud de mantenimiento PRO-09106 se va a la sede
  -- con el nombre que escribió Central, con su contacto y su oportunidad.
  if exists (select 1 from leads where id = v_lead and cuenta_id = v_puno) then
    v_sede := sede_para_lead(v_madre, (select razon_social from leads where id = v_lead), true);
    update oportunidades set cuenta_id = v_sede where id = v_op and cuenta_id = v_puno;
    update contactos set cuenta_id = v_sede
     where cuenta_id = v_puno and nombre = 'EDDY ATAURIMA TACAS' and created_at::date = date '2026-09-02';
    update leads set cuenta_id = v_sede where id = v_lead;
  end if;

  -- Marina de Guerra del Perú: la ficha con RUC (de Katerine) es la madre.
  update cuentas set sedes_por_ruc = true
   where num_doc = '20153408191' and tipo_doc <> 'SIN_DOC' and cuenta_padre_id is null and not sedes_por_ruc;

  -- Ministerio de Salud: no había ficha con su RUC; nace la madre, sin dueño.
  if not exists (select 1 from cuentas where num_doc = '20131373237' and tipo_doc <> 'SIN_DOC') then
    insert into cuentas (tipo_doc, num_doc, razon_social, nombre_comercial, sedes_por_ruc, departamento, provincia, distrito)
    values ('RUC', '20131373237', 'MINISTERIO DE SALUD - MINSA', 'MINSA', true, 'LIMA', 'LIMA', 'JESUS MARIA');
  end if;
end $$;
