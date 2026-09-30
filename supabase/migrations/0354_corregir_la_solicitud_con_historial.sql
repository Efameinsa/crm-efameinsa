-- CORREGIR LO QUE SOLICITÓ EL CLIENTE, CON HISTORIAL, Y «ESTO ERA DE OTRO CLIENTE».
--
-- Rubí (PV1), 30-09, desde la ficha de INVERSIONES CRISTO VIVE: «¿puedo
-- modificar la escritura? Esta solicitud es de otro cliente, por error me
-- equivoqué… debería haber un lápiz al costado… y un historial de cambios para
-- ver quién lo hizo y evitar vicios». PRO-09964 llevaba el nombre, el RUC y el
-- correo de ASOCIACIÓN VIDAWASI PERÚ, pero con un teléfono de Cristo Vive: cayó
-- en la ficha equivocada, Central se lo derivó a Gabriela (PV2) y nadie podía
-- corregirlo desde donde se ve. Se arregló a mano.
--
-- Son DOS errores distintos y se arreglan distinto:
--   · el texto quedó mal o incompleto  → se corrige el texto (lápiz);
--   · la solicitud es de OTRO cliente   → se muda a la ficha correcta.
-- Reescribir el texto en el segundo caso dejaría en la ficha ajena un
-- «Inicio» falso, un contacto que no es suyo y un expediente abierto.
--
-- 1. HISTORIAL COMPLETO. Hasta hoy (0199) solo se guardaba el texto original y
--    el ÚLTIMO que editó: a la tercera corrección se perdía quién hizo la
--    segunda. Ahora cada cambio es una fila, con motivo, y la pantalla dice
--    «editado» siempre: nadie cambia nada sin que se note.
--
-- 2. QUIÉN PUEDE. Central y gerencia, como antes, y ahora también QUIEN LA
--    REGISTRÓ (postventa y los comerciales registran contactos por «Pasar a
--    Central»). El que la recibió no reescribe lo que pidió el cliente: su
--    trabajo va en la ficha, como gestión.
--
-- 3. CUÁNTA FIRMA PIDE. El 0199 dejó dicho por qué no se pide código para
--    completar una frase, y sigue valiendo. Pero la regla sube con lo que ya
--    se construyó encima:
--      · en la bandeja o dentro de los 15 minutos de registrada: libre;
--      · después: con MOTIVO (una frase), y se le avisa a quien la atiende;
--      · si el expediente ya tiene cotización o venta: además, CÓDIGO de
--        supervisor. Ahí ya hay un documento que dice otra cosa.
--
-- 4. MUDARLA DE FICHA (`mover_solicitud_a_otra_ficha`). No es `unir_lead_a_cuenta`
--    (0200/0213): aquella supone que la ficha de origen es un DUPLICADO recién
--    abierto —se lleva todos sus contactos, pasa la cartera al dueño del
--    destino y borra la ficha si queda vacía—. Acá la ficha de origen es un
--    cliente real que no tiene la culpa: solo se va lo que trajo ESTA
--    solicitud.

-- ----------------------------------------------------------------------------
-- El historial
-- ----------------------------------------------------------------------------
create table if not exists public.lead_solicitud_cambios (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  tipo            text not null check (tipo in ('texto', 'ficha')),
  antes           text,
  despues         text,
  -- Los nombres van copiados: la ficha de origen puede cerrarse después.
  cuenta_antes    uuid references public.cuentas(id) on delete set null,
  cuenta_despues  uuid references public.cuentas(id) on delete set null,
  motivo          text,
  hecho_por       uuid not null references public.perfiles(id),
  autorizo        uuid references public.perfiles(id),
  hecho_at        timestamptz not null default now()
);

create index if not exists lead_solicitud_cambios_lead on public.lead_solicitud_cambios (lead_id, hecho_at);

comment on table public.lead_solicitud_cambios is
  'Cada corrección de lo que solicitó el cliente (tipo texto) y cada mudanza de la solicitud a otra ficha (tipo ficha), con quién, cuándo, motivo y quién autorizó (0354).';

alter table public.lead_solicitud_cambios enable row level security;

-- Lo lee quien puede ver la solicitud: la política de leads decide.
drop policy if exists lead_solicitud_cambios_leer on public.lead_solicitud_cambios;
create policy lead_solicitud_cambios_leer on public.lead_solicitud_cambios
  for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));

-- Nadie escribe directo: solo las dos funciones de abajo.
revoke insert, update, delete on public.lead_solicitud_cambios from anon, authenticated;
grant select on public.lead_solicitud_cambios to authenticated;

-- Lo que ya se había corregido con la 0199 entra al historial, para que la
-- marca «editado» salga también en esas.
insert into public.lead_solicitud_cambios (lead_id, tipo, antes, despues, hecho_por, hecho_at)
select l.id, 'texto', l.mensaje_original, l.mensaje, l.mensaje_editado_por, l.mensaje_editado_at
  from public.leads l
 where l.mensaje_original is not null
   and l.mensaje_editado_por is not null
   and l.mensaje_editado_at is not null
   and not exists (select 1 from public.lead_solicitud_cambios c where c.lead_id = l.id);

-- El piloto local sincroniza por disparador; la tabla nueva entra a la cola.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'sync' and p.proname = 'capturar') then
    execute 'drop trigger if exists zz_sync on public.lead_solicitud_cambios';
    execute 'create trigger zz_sync after insert or update or delete on public.lead_solicitud_cambios for each row execute function sync.capturar(''id'')';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Quién puede corregir esta solicitud. Una sola regla para la base y la
-- pantalla (la pantalla no muestra el lápiz a quien no lo puede usar).
-- ----------------------------------------------------------------------------
create or replace function public.puede_corregir_solicitud(p_lead_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from leads l
     where l.id = p_lead_id
       and l.estado in ('pendiente_triaje', 'asignado')
       and (
         coalesce(rol_actual() = 'central', false)
         or coalesce(es_backoffice(), false)
         or l.recibido_por = auth.uid()
       )
  );
$$;

revoke all on function public.puede_corregir_solicitud(uuid) from public;
grant execute on function public.puede_corregir_solicitud(uuid) to authenticated;

-- Qué firma pide hoy una corrección de esta solicitud: 'libre', 'motivo' o 'codigo'.
create or replace function public.firma_para_corregir_solicitud(p_lead_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when l.id is null then null
    when l.oportunidad_id is not null and (
           exists (select 1 from cotizaciones q where q.oportunidad_id = l.oportunidad_id)
        or exists (select 1 from ventas v where v.oportunidad_id = l.oportunidad_id)
    ) then 'codigo'
    when l.estado = 'pendiente_triaje' then 'libre'
    when coalesce(l.recibido_at, l.created_at) > now() - interval '15 minutes' then 'libre'
    else 'motivo'
  end
  from leads l where l.id = p_lead_id;
$$;

revoke all on function public.firma_para_corregir_solicitud(uuid) from public;
grant execute on function public.firma_para_corregir_solicitud(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Corregir el texto (y acoplar archivos, como en la 0227)
-- ----------------------------------------------------------------------------
drop function if exists public.corregir_solicitud_lead(uuid, text, jsonb);

create or replace function public.corregir_solicitud_lead(
  p_lead_id  uuid,
  p_texto    text,
  p_adjuntos jsonb default null,
  p_motivo   text default null,
  p_pin      text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quien    uuid := auth.uid();
  v_lead     leads%rowtype;
  v_texto    text := btrim(coalesce(p_texto, ''));
  v_motivo   text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_nuevos   jsonb := coalesce(p_adjuntos, '[]'::jsonb);
  v_adj      jsonb;
  v_total    integer;
  v_cambia   boolean;
  v_firma    text;
  v_autorizo uuid;
  v_quien_nombre text;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  if jsonb_typeof(v_nuevos) <> 'array' then
    raise exception 'Los adjuntos no son válidos.';
  end if;
  if v_texto = '' and jsonb_array_length(v_nuevos) = 0 then
    raise exception 'Escriba qué solicita el cliente o adjunte lo que mandó: una de las dos cosas.';
  end if;
  if v_texto <> '' and length(v_texto) < 5 then
    raise exception 'Escriba qué solicita el cliente (una frase alcanza).';
  end if;
  if length(v_texto) > 2000 then
    raise exception 'El detalle es demasiado largo. Resuma en lo que hace falta para atenderlo.';
  end if;
  for v_adj in select value from jsonb_array_elements(v_nuevos) loop
    if coalesce(v_adj->>'path', '') !~ '^leads/' or coalesce(v_adj->>'nombre', '') = '' then
      raise exception 'Los adjuntos no son válidos. Quítelos y vuelva a agregarlos.';
    end if;
  end loop;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'Ese contacto no existe'; end if;

  if v_lead.estado not in ('pendiente_triaje', 'asignado') then
    raise exception 'Ese contacto ya no está en circulación (%). No se corrige lo que pidió.', v_lead.estado;
  end if;

  if not puede_corregir_solicitud(p_lead_id) then
    raise exception 'Lo que pidió el cliente lo corrige quien lo registró, Central o gerencia. Si usted lo atiende, anótelo como gestión en el expediente.';
  end if;

  v_cambia := v_texto <> '' and coalesce(v_lead.mensaje, '') <> v_texto;

  if v_texto <> '' and not v_cambia and jsonb_array_length(v_nuevos) = 0 then
    raise exception 'El detalle ya dice exactamente eso. No hay nada que corregir.';
  end if;

  -- La firma se pide solo si cambia el TEXTO: acoplar las fotos que llegaron
  -- por otro canal no reescribe nada (0227).
  if v_cambia then
    v_firma := firma_para_corregir_solicitud(p_lead_id);
    if v_firma in ('motivo', 'codigo') and coalesce(length(v_motivo), 0) < 5 then
      raise exception 'Diga en una frase por qué lo corrige. Queda en el historial y lo lee quien lo atiende.';
    end if;
    if v_firma = 'codigo' then
      v_autorizo := validar_codigo_autorizacion(p_pin, 'derivacion');
    end if;
  end if;

  v_total := jsonb_array_length(coalesce(v_lead.adjuntos, '[]'::jsonb)) + jsonb_array_length(v_nuevos);
  if v_total > 10 then
    raise exception 'Un contacto lleva hasta 10 archivos; este ya tiene %. Quite alguno o resuma.',
      jsonb_array_length(coalesce(v_lead.adjuntos, '[]'::jsonb));
  end if;

  update leads
     set mensaje             = case when v_cambia then v_texto else mensaje end,
         mensaje_original    = case when v_cambia then coalesce(mensaje_original, mensaje) else mensaje_original end,
         mensaje_editado_por = case when v_cambia then v_quien else mensaje_editado_por end,
         mensaje_editado_at  = case when v_cambia then now() else mensaje_editado_at end,
         adjuntos            = coalesce(adjuntos, '[]'::jsonb) || v_nuevos,
         updated_at          = now()
   where id = p_lead_id;

  if v_cambia then
    insert into lead_solicitud_cambios (lead_id, tipo, antes, despues, motivo, hecho_por, autorizo)
    values (p_lead_id, 'texto', v_lead.mensaje, v_texto, v_motivo, v_quien, v_autorizo);

    -- Quien ya la tiene puede haber preparado algo con el texto de antes.
    if v_lead.estado = 'asignado' and v_lead.asignado_a is not null and v_lead.asignado_a <> v_quien then
      select coalesce(codigo_comercial || ' · ', '') || nombre into v_quien_nombre from perfiles where id = v_quien;
      insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
      values (
        v_lead.asignado_a, 'solicitud_corregida',
        format('Corrigieron lo que pide el cliente en %s', coalesce(v_lead.codigo, 'un contacto suyo')),
        format('%s cambió el detalle%s. Ahora dice: «%s»',
               coalesce(v_quien_nombre, 'Alguien'),
               case when v_motivo is not null then ' (' || v_motivo || ')' else '' end,
               left(v_texto, 280)),
        case when v_lead.oportunidad_id is not null then '/comercial/oportunidades/' || v_lead.oportunidad_id else null end
      );
    end if;
  end if;

  return coalesce(nullif(v_texto, ''), v_lead.mensaje);
end $function$;

comment on function public.corregir_solicitud_lead(uuid, text, jsonb, text, text) is
  'Corrige lo que pidió el cliente y/o le acopla archivos (0199, 0227, 0354). Lo usan quien lo registró, Central y gerencia. Libre en la bandeja o en los primeros 15 min; después pide motivo; con cotización o venta en el expediente, además código. Cada cambio queda en lead_solicitud_cambios y se avisa a quien lo atiende.';

revoke all on function public.corregir_solicitud_lead(uuid, text, jsonb, text, text) from public;
grant execute on function public.corregir_solicitud_lead(uuid, text, jsonb, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- «Esto era de otro cliente»: mudar la solicitud a la ficha correcta
-- ----------------------------------------------------------------------------
create or replace function public.mover_solicitud_a_otra_ficha(
  p_lead_id   uuid,
  p_cuenta_id uuid,
  p_motivo    text,
  p_pin       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_quien      uuid := auth.uid();
  v_lead       leads%rowtype;
  v_origen     cuentas%rowtype;
  v_destino    cuentas%rowtype;
  v_op         oportunidades%rowtype;
  v_motivo     text := btrim(coalesce(p_motivo, ''));
  v_gestiones  integer := 0;
  v_pide_pin   boolean := false;
  v_autorizo   uuid;
  v_viva       uuid;
  v_fundida    boolean := false;
  v_contactos  integer := 0;
  v_resto      integer;
  v_cerrada    boolean := false;
  v_quien_nom  text;
  v_nuevo_com  uuid;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  if length(v_motivo) < 10 then
    raise exception 'Diga en una frase de quién es y cómo se dio cuenta. Queda en las dos fichas.';
  end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'Ese contacto no existe'; end if;
  if not puede_corregir_solicitud(p_lead_id) then
    raise exception 'Una solicitud la cambia de cliente quien la registró, Central o gerencia.';
  end if;

  select * into v_destino from cuentas where id = p_cuenta_id for update;
  if v_destino.id is null or v_destino.fusionada_en is not null then
    raise exception 'Esa ficha de cliente no existe o ya se unió a otra. Búsquela de nuevo.';
  end if;
  if v_destino.id = v_lead.cuenta_id then
    raise exception 'La solicitud ya está en la ficha de %.', v_destino.razon_social;
  end if;
  if not v_lead.es_prueba and exists (select 1 from perfiles p where p.id = v_destino.comercial_id and p.es_prueba) then
    raise exception 'Esa ficha es del banco de pruebas. No se le puede mudar una solicitud real.';
  end if;

  select * into v_origen from cuentas where id = v_lead.cuenta_id;
  if v_lead.oportunidad_id is not null then
    select * into v_op from oportunidades where id = v_lead.oportunidad_id for update;
  end if;

  -- Lo que ya tiene un documento encima no se muda con un clic: la cotización
  -- y la venta llevan impreso el nombre del otro cliente.
  if v_op.id is not null and (
       exists (select 1 from cotizaciones q where q.oportunidad_id = v_op.id)
    or exists (select 1 from ventas v where v.oportunidad_id = v_op.id)
    or exists (select 1 from informes_cierre i where i.oportunidad_id = v_op.id)
    or exists (select 1 from servicios_postventa s where s.oportunidad_id = v_op.id)
  ) then
    raise exception 'Ese expediente ya tiene cotización, venta o servicio a nombre de %. Pídale a gerencia u operaciones que lo corrija: hay documentos que cambiar.', coalesce(v_origen.razon_social, 'la otra ficha');
  end if;

  -- ¿Otra solicitud del mismo cliente cuelga de ese expediente? Entonces no
  -- es solo de esta: se muda la solicitud sola y el expediente se queda.
  -- (Si solo cuelga esta, el expediente se va con ella.)
  if v_op.id is not null then
    select count(*) into v_gestiones
      from actividades a
      join perfiles p on p.id = a.realizada_por
     where a.oportunidad_id = v_op.id and p.rol::text <> 'admin';
  end if;

  -- Si ya alguien trabajó sobre ella, o si mudarla cambia de dueño un
  -- expediente comercial, lo firma un supervisor.
  v_nuevo_com := v_op.comercial_id;
  if v_op.id is not null and v_op.tipo_postventa is null
     and v_destino.comercial_id is not null and v_destino.comercial_id <> v_op.comercial_id then
    v_nuevo_com := v_destino.comercial_id;
  end if;
  v_pide_pin := v_gestiones > 0 or v_nuevo_com is distinct from v_op.comercial_id;
  if v_pide_pin then
    v_autorizo := validar_codigo_autorizacion(p_pin, 'derivacion');
  end if;

  select coalesce(codigo_comercial || ' · ', '') || nombre into v_quien_nom from perfiles where id = v_quien;

  -- 1) LA SOLICITUD. Guarda de dónde venía (0338 usa el mismo campo).
  update leads
     set cuenta_id    = v_destino.id,
         razon_social = v_destino.razon_social,
         num_doc      = case when v_destino.tipo_doc <> 'SIN_DOC' and v_destino.num_doc is not null
                             then v_destino.num_doc else num_doc end,
         asignado_a   = case when v_nuevo_com is distinct from v_op.comercial_id then v_nuevo_com else asignado_a end,
         datos_originales = coalesce(datos_originales, '{}'::jsonb) || jsonb_build_object(
           'movido_de_ficha', jsonb_build_object(
             'cuenta_id', v_origen.id, 'razon_social', v_lead.razon_social,
             'oportunidad_id', v_lead.oportunidad_id, 'asignado_a', v_lead.asignado_a,
             'motivo', v_motivo, 'por', v_quien, 'at', now())),
         updated_at   = now()
   where id = p_lead_id;

  -- 2) SU EXPEDIENTE.
  if v_op.id is not null then
    -- Si en la ficha buena la misma persona ya lleva un expediente abierto del
    -- mismo tipo, y el que se muda está vacío, se suma a ese: un cliente, un
    -- hilo (así se arregló a mano el de Rubí).
    if v_gestiones = 0 then
      select o.id into v_viva
        from oportunidades o
       where o.cuenta_id = v_destino.id
         and o.comercial_id is not distinct from v_nuevo_com
         and o.cerrada_at is null
         and o.etapa::text not in ('historico', 'rechazada', 'venta', 'derivada')
         and (o.tipo_postventa is null) = (v_op.tipo_postventa is null)
       order by o.updated_at desc
       limit 1;
    end if;

    if v_viva is not null then
      update leads set oportunidad_id = v_viva where id = p_lead_id;
      update oportunidades set etapa = 'historico', updated_at = now() where id = v_op.id;
      insert into actividades (oportunidad_id, tipo, nota, realizada_por)
      values (v_op.id, 'nota', format(
        'Expediente archivado: la solicitud %s no era de %s sino de %s. La mudó %s: «%s». Siguió en el expediente que ya estaba abierto allá.',
        coalesce(v_lead.codigo, ''), coalesce(v_origen.razon_social, 'esta ficha'), v_destino.razon_social, v_quien_nom, v_motivo), v_quien);
      update oportunidades set updated_at = now() where id = v_viva;
      v_fundida := true;
    else
      update oportunidades
         set cuenta_id = v_destino.id, comercial_id = v_nuevo_com, updated_at = now()
       where id = v_op.id;
      update asignaciones set cuenta_id = v_destino.id
       where lead_id = p_lead_id and cuenta_id is distinct from v_destino.id;
    end if;

    insert into actividades (oportunidad_id, tipo, nota, realizada_por)
    values (coalesce(v_viva, v_op.id), 'nota', format(
      'La solicitud %s llegó desde la ficha de %s, donde se había registrado por error. La mudó %s: «%s».',
      coalesce(v_lead.codigo, ''), coalesce(v_origen.razon_social, 'otro cliente'), v_quien_nom, v_motivo), v_quien);
  end if;

  if v_destino.comercial_id is null and v_op.id is not null and v_op.tipo_postventa is null and v_nuevo_com is not null then
    update cuentas set comercial_id = v_nuevo_com, cartera_desde = hoy_lima(), updated_at = now()
     where id = v_destino.id;
  end if;

  -- 3) LA PERSONA QUE TRAJO ESTA SOLICITUD, y nada más. Se muda el contacto
  -- de la ficha de origen con ESTE teléfono solo si ninguna otra solicitud de
  -- esa ficha lo usa: si el teléfono era de ese cliente (el caso de Rubí), la
  -- persona se queda donde estaba.
  if v_origen.id is not null then
    update contactos ct
       set cuenta_id = v_destino.id, es_principal = false
     where ct.cuenta_id = v_origen.id
       and v_lead.telefono_normalizado is not null
       and ct.telefono_normalizado = v_lead.telefono_normalizado
       and not exists (select 1 from leads o where o.cuenta_id = v_origen.id and o.id <> p_lead_id
                          and o.telefono_normalizado = ct.telefono_normalizado)
       and not exists (select 1 from contactos d where d.cuenta_id = v_destino.id
                          and d.telefono_normalizado = ct.telefono_normalizado);
    get diagnostics v_contactos = row_count;

    -- Y el correo que esta solicitud le pegó a una persona que se queda.
    if v_lead.email is not null then
      update contactos ct
         set email = null
       where ct.cuenta_id = v_origen.id
         and lower(ct.email) = lower(v_lead.email)
         and not exists (select 1 from leads o where o.cuenta_id = v_origen.id and o.id <> p_lead_id
                            and lower(o.email) = lower(v_lead.email));
    end if;

    -- 4) La ficha de origen se cierra solo si la abrió esta solicitud y quedó
    -- vacía (el teléfono mal tipeado que abre una ficha nueva).
    select
      (select count(*) from leads                   where cuenta_id = v_origen.id)
    + (select count(*) from oportunidades           where cuenta_id = v_origen.id)
    + (select count(*) from contactos               where cuenta_id = v_origen.id)
    + (select count(*) from asignaciones            where cuenta_id = v_origen.id)
    + (select count(*) from atenciones              where cuenta_id = v_origen.id)
    + (select count(*) from cotizaciones_historicas where cuenta_id = v_origen.id)
    + (select count(*) from informes_cierre         where cuenta_id = v_origen.id)
    + (select count(*) from informes_servicio       where cuenta_id = v_origen.id)
    + (select count(*) from servicios_postventa     where cuenta_id = v_origen.id)
    + (select count(*) from soporte_tecnico         where cuenta_id = v_origen.id)
    + (select count(*) from equipos_instalados      where cuenta_id = v_origen.id)
    + (select count(*) from sunat_candidatos        where cuenta_id = v_origen.id or ruc_ya_en_cuenta = v_origen.id)
    + (select count(*) from inventario_equipos      where reservado_para = v_origen.id)
    + (select count(*) from cuentas                 where cuenta_padre_id = v_origen.id)
      into v_resto;
    if coalesce(v_resto, 0) = 0 and v_origen.created_at >= coalesce(v_lead.recibido_at, v_lead.created_at) - interval '1 minute' then
      delete from cuentas where id = v_origen.id;
      v_cerrada := true;
    end if;
  end if;

  insert into lead_solicitud_cambios (lead_id, tipo, cuenta_antes, cuenta_despues, antes, despues, motivo, hecho_por, autorizo)
  values (p_lead_id, 'ficha', case when v_cerrada then null else v_origen.id end, v_destino.id,
          v_origen.razon_social, v_destino.razon_social, v_motivo, v_quien, v_autorizo);

  -- Avisos: a quien la tenía y a quien la tiene ahora, si no es quien la mudó.
  if v_lead.asignado_a is not null and v_lead.asignado_a <> v_quien then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (v_lead.asignado_a, 'solicitud_movida',
            format('%s era de otro cliente', coalesce(v_lead.codigo, 'Una solicitud suya')),
            format('%s la mudó de %s a %s: «%s».%s', coalesce(v_quien_nom, 'Alguien'),
                   coalesce(v_origen.razon_social, 'otra ficha'), v_destino.razon_social, v_motivo,
                   case when v_nuevo_com is distinct from v_lead.asignado_a or v_fundida
                        then ' Ya no está a su cargo.' else '' end),
            '/comercial/oportunidades/' || coalesce(v_viva, v_op.id)::text);
  end if;
  if v_fundida and exists (select 1 from oportunidades o where o.id = v_viva and o.comercial_id is distinct from v_quien) then
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    select o.comercial_id, 'solicitud_movida',
           format('Se sumó %s a su expediente de %s', coalesce(v_lead.codigo, 'una solicitud'), v_destino.razon_social),
           format('Estaba por error en la ficha de %s. Dice: «%s»', coalesce(v_origen.razon_social, 'otro cliente'), left(coalesce(v_lead.mensaje, ''), 280)),
           '/comercial/oportunidades/' || o.id
      from oportunidades o where o.id = v_viva and o.comercial_id is not null;
  end if;

  return jsonb_build_object(
    'destino', v_destino.razon_social,
    'origen', v_origen.razon_social,
    'expediente', coalesce(v_viva, v_op.id),
    'sumada_a_expediente_abierto', v_fundida,
    'contactos_mudados', v_contactos,
    'ficha_cerrada', v_cerrada,
    'con_codigo', v_autorizo is not null
  );
end $function$;

comment on function public.mover_solicitud_a_otra_ficha(uuid, uuid, text, text) is
  'La solicitud se registró en la ficha de otro cliente: la muda a la correcta con su expediente (o la suma al expediente abierto de la misma persona allá), sin llevarse nada que no haya traído ella. Pide código si ya tenía gestiones o si cambia el dueño de un expediente comercial; rechaza los que tienen cotización, venta o servicio (0354).';

revoke all on function public.mover_solicitud_a_otra_ficha(uuid, uuid, text, text) from public;
grant execute on function public.mover_solicitud_a_otra_ficha(uuid, uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- La vista previa de la mudanza: la pantalla dice ANTES de confirmar qué se va
-- a mover, a quién le queda y si hará falta código. Misma regla que arriba.
-- ----------------------------------------------------------------------------
create or replace function public.previa_mover_solicitud(p_lead_id uuid, p_cuenta_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_lead      leads%rowtype;
  v_op        oportunidades%rowtype;
  v_destino   cuentas%rowtype;
  v_gestiones integer := 0;
  v_nuevo_com uuid;
  v_viva      uuid;
  v_bloqueo   text;
begin
  if not puede_corregir_solicitud(p_lead_id) then
    return jsonb_build_object('bloqueo', 'Una solicitud la cambia de cliente quien la registró, Central o gerencia.');
  end if;
  select * into v_lead from leads where id = p_lead_id;
  select * into v_destino from cuentas where id = p_cuenta_id;
  if v_destino.id is null then return jsonb_build_object('bloqueo', 'Esa ficha no existe.'); end if;
  if v_destino.id = v_lead.cuenta_id then
    return jsonb_build_object('bloqueo', 'La solicitud ya está en esa ficha.');
  end if;
  if v_lead.oportunidad_id is not null then
    select * into v_op from oportunidades where id = v_lead.oportunidad_id;
  end if;
  if v_op.id is not null and (
       exists (select 1 from cotizaciones q where q.oportunidad_id = v_op.id)
    or exists (select 1 from ventas v where v.oportunidad_id = v_op.id)
    or exists (select 1 from informes_cierre i where i.oportunidad_id = v_op.id)
    or exists (select 1 from servicios_postventa s where s.oportunidad_id = v_op.id)
  ) then
    v_bloqueo := 'Ese expediente ya tiene cotización, venta o servicio a nombre del otro cliente. Pídale a gerencia u operaciones que lo corrija.';
  end if;
  if v_op.id is not null then
    select count(*) into v_gestiones
      from actividades a join perfiles p on p.id = a.realizada_por
     where a.oportunidad_id = v_op.id and p.rol::text <> 'admin';
  end if;
  v_nuevo_com := v_op.comercial_id;
  if v_op.id is not null and v_op.tipo_postventa is null
     and v_destino.comercial_id is not null and v_destino.comercial_id <> v_op.comercial_id then
    v_nuevo_com := v_destino.comercial_id;
  end if;
  if v_op.id is not null and v_gestiones = 0 then
    select o.id into v_viva
      from oportunidades o
     where o.cuenta_id = v_destino.id
       and o.comercial_id is not distinct from v_nuevo_com
       and o.cerrada_at is null
       and o.etapa::text not in ('historico', 'rechazada', 'venta', 'derivada')
       and (o.tipo_postventa is null) = (v_op.tipo_postventa is null)
     order by o.updated_at desc
     limit 1;
  end if;
  return jsonb_build_object(
    'bloqueo', v_bloqueo,
    'pide_codigo', v_gestiones > 0 or v_nuevo_com is distinct from v_op.comercial_id,
    'gestiones', v_gestiones,
    'tiene_expediente', v_op.id is not null,
    'atiende_ahora', (select coalesce(p.codigo_comercial || ' · ', '') || p.nombre from perfiles p where p.id = v_op.comercial_id),
    'atendera', (select coalesce(p.codigo_comercial || ' · ', '') || p.nombre from perfiles p where p.id = v_nuevo_com),
    'suma_a_expediente_abierto', v_viva is not null
  );
end $function$;

revoke all on function public.previa_mover_solicitud(uuid, uuid) from public;
grant execute on function public.previa_mover_solicitud(uuid, uuid) to authenticated;

-- Supabase le da a `anon` permisos por defecto sobre todo lo nuevo: se quitan.
revoke all on public.lead_solicitud_cambios from anon;
revoke execute on function public.puede_corregir_solicitud(uuid) from anon;
revoke execute on function public.firma_para_corregir_solicitud(uuid) from anon;
revoke execute on function public.corregir_solicitud_lead(uuid, text, jsonb, text, text) from anon;
revoke execute on function public.mover_solicitud_a_otra_ficha(uuid, uuid, text, text) from anon;
revoke execute on function public.previa_mover_solicitud(uuid, uuid) from anon;
