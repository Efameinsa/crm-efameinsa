-- ============================================================
-- CRM EFAMEINSA · Migración 0596 · El aviso de Central dice QUIÉN escribió
-- ============================================================
-- Santos, 23-10: «Katerine me pregunta por INVERSIONES GENERALES HILMOT EIRL,
-- Central le reporta eso pero no sale el número o persona que se volvió a
-- contactar».
--
-- La nota de «Avisarle al comercial» (0215) lleva solo el texto que Central
-- confirma, y ese texto se arma con el MENSAJE del contacto. En WhatsApp el
-- mensaje es lo que el cliente escribió; en el formulario de Google es «City:
-- Huarmey · Campaña: …», porque el nombre, el teléfono y el correo van en sus
-- propias columnas. Resultado: el comercial lee que su cliente volvió a
-- escribir y no sabe quién ni a qué número devolverle la llamada — y en una
-- empresa puede ser otra persona que la que ya conoce.
--
-- Arreglo en la base, no en la pantalla: así lo lleva la nota aunque Central
-- edite o borre el texto sugerido. Se agrega solo lo que el texto todavía no
-- trae (si Central ya escribió el teléfono, no se repite). La respuesta suma
-- `detalle` con el texto final, para que la campana pueda decir lo mismo.
-- Fuera de eso, la función es la de 0215 sin cambios.
-- ============================================================

create or replace function public.avisar_al_comercial_y_cerrar(p_lead uuid, p_cuenta uuid, p_detalle text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_lead      leads%rowtype;
  v_cuenta    cuentas%rowtype;
  v_op        oportunidades%rowtype;
  v_detalle   text := btrim(coalesce(p_detalle, ''));
  v_quien     text;
  v_actividad uuid;
  v_com       record;
begin
  if not (es_backoffice() or rol_actual() = 'central' or es_operaciones()) then
    raise exception 'Solo Central o gerencia avisan al comercial';
  end if;
  if length(v_detalle) < 10 then
    raise exception 'Escriba qué dijo el cliente: es lo único que va a leer el comercial';
  end if;

  select * into v_lead from leads where id = p_lead for update;
  if v_lead.id is null then
    raise exception 'Ese contacto no existe';
  end if;
  -- El mismo candado que las otras tres salidas de la bandeja: Central trabaja
  -- con dos pestañas abiertas y sin esto la pantalla cantaba el éxito de algo
  -- que no había pasado.
  if v_lead.estado <> 'pendiente_triaje' then
    raise exception 'Ese contacto ya salió de la bandeja (%). Recargue la página.', v_lead.estado;
  end if;

  -- QUIÉN escribió (0596): nombre, teléfono y correo del contacto, solo lo que
  -- el texto de Central todavía no dice. El teléfono se compara por dígitos
  -- para no repetirlo si Central lo escribió con otro formato.
  v_quien := concat_ws(' · ',
    case when nullif(btrim(coalesce(v_lead.nombre_contacto, '')), '') is not null
          and v_lead.nombre_contacto <> 'Sin nombre'
          and position(lower(btrim(v_lead.nombre_contacto)) in lower(v_detalle)) = 0
         then btrim(v_lead.nombre_contacto) end,
    case when length(regexp_replace(coalesce(v_lead.telefono, ''), '\D', '', 'g')) >= 6
          and position(regexp_replace(v_lead.telefono, '\D', '', 'g') in regexp_replace(v_detalle, '\D', '', 'g')) = 0
         then 'Tel. ' || btrim(v_lead.telefono) end,
    case when nullif(btrim(coalesce(v_lead.email, '')), '') is not null
          and position(lower(btrim(v_lead.email)) in lower(v_detalle)) = 0
         then btrim(v_lead.email) end);
  if v_quien <> '' then
    v_detalle := v_detalle || ' — Escribió: ' || v_quien;
  end if;

  select * into v_cuenta from cuentas where id = p_cuenta;
  if v_cuenta.id is null then
    raise exception 'Esa ficha de cliente no existe';
  end if;

  -- Dónde se anota: el mismo criterio que `derivar_aviso` (0168) — el
  -- expediente abierto más reciente y, si no hay ninguno abierto, el último
  -- que hubo. Los cascarones del Excel histórico quedan fuera.
  select * into v_op
    from oportunidades
   where cuenta_id = v_cuenta.id
     and etapa <> 'historico'
   order by (cerrada_at is null) desc, created_at desc
   limit 1;
  if v_op.id is null then
    raise exception 'Ese cliente no tiene ningún expediente donde anotar el aviso. Derívelo como siempre.';
  end if;

  -- NOTA, no gestión: el aviso de Central no cuenta como contacto del
  -- comercial con su cliente y no le mueve ningún indicador (0168).
  insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
  values (v_op.id, 'nota', '[Aviso de Central] ' || v_detalle, auth.uid(), now())
  returning id into v_actividad;

  -- Sale como REPETIDO y con su ficha. No como descartado: descartado es «no
  -- procedía», y este procedió — se derivó, se trabajó y se cotizó.
  update leads
     set estado     = 'duplicado',
         cuenta_id  = v_cuenta.id,
         updated_at = now()
   where id = p_lead;

  -- Queda en «Lo que derivé», con la misma fila que cualquier otro aviso, para
  -- que Central pueda revertirlo si se equivocó de cliente.
  insert into avisos_derivados (
    lead_id, a_finanzas, a_postventa, a_comercial, detalle,
    actividad_id, estado_anterior, area_anterior, derivado_por
  ) values (
    p_lead, false, false, true, v_detalle,
    v_actividad, v_lead.estado, v_lead.area_destino, auth.uid()
  );

  select p.id, p.nombre, p.codigo_comercial into v_com
    from perfiles p
   where p.id = coalesce(v_op.comercial_id, v_cuenta.comercial_id);

  return jsonb_build_object(
    'oportunidad',  v_op.id,
    'comercial_id', v_com.id,
    'comercial',    btrim(coalesce(v_com.codigo_comercial || ' · ', '') || coalesce(v_com.nombre, 'su comercial')),
    'cliente',      v_cuenta.razon_social,
    'codigo',       v_lead.codigo,
    'detalle',      v_detalle
  );
end;
$function$;

-- Los 4 avisos que salieron el 23-10 sin decir quién escribió (los formularios
-- de Google recuperados de la caída de Vercel): se les completa la nota con la
-- misma regla. Es la nota que puso el sistema hace unas horas, no una gestión
-- de nadie, y solo se le AGREGA el dato que faltaba.
update actividades a
   set nota = a.nota || ' — Escribió: ' || concat_ws(' · ', btrim(l.nombre_contacto), 'Tel. ' || btrim(l.telefono), btrim(l.email))
  from avisos_derivados d
  join leads l on l.id = d.lead_id
 where d.actividad_id = a.id
   and d.a_comercial
   and l.fuente = 'google_ads'
   and l.recibido_at >= '2026-10-23'
   and a.nota like '[Aviso de Central]%'
   and a.nota not like '%Escribió:%'
   and l.telefono is not null
   and position(regexp_replace(l.telefono, '\D', '', 'g') in regexp_replace(a.nota, '\D', '', 'g')) = 0;
