-- 0338 — Quien pasó un contacto a Central lo puede anular o corregir, con código.
--
-- Almacén, 29-09 (correo de Jeysson Alania a Santos, con copia a Carlos):
-- registró DOS veces un contacto de llamada (PRO-10052 a las 11:00 y
-- PRO-10053 a las 11:01) con la razón social que le dio un trabajador del
-- cliente —«Hotel El Alto Recepción»— y después la encargada le dijo que en
-- SUNAT es AMAZONAS GRANDEZ INVERSIONES S.A.C., cliente que ya tiene ficha y
-- cartera. Pidió anularlas y poder editarlas. Hasta hoy solo Central podía
-- descartar o corregir lo que está en su bandeja: quien lo registró no tenía
-- ninguna puerta y tenía que escribir un correo.
--
-- Carlos (WhatsApp, 29-09 17:30): «el ALMACEN debe permitir anular la
-- Llamada mediante PIN». Es el mismo criterio que «¿Serie equivocada?
-- Corregir con código» (0290): se puede, pero no en silencio.
--
-- Límites:
--   · Solo quien lo registró (recibido_por = auth.uid()).
--   · Solo mientras sigue en la bandeja de Central (pendiente_triaje). Una
--     vez derivado ya tiene expediente y dueño: eso se corrige por la
--     corrección de la derivación, como siempre.
--   · Código de supervisor (gerencia u operaciones: validar_codigo_autorizacion
--     con ámbito «derivacion») y motivo escrito.
--
-- ANULAR NO ES BORRAR (0113): el contacto queda `descartado` y las columnas
-- anulado_* dicen que lo anuló quien lo registró, quién autorizó y por qué.
-- Así «Lo que mandé a Central» y gerencia lo distinguen del descarte de
-- Central (que significa «no procedía»).

alter table public.leads
  add column if not exists anulado_at        timestamptz,
  add column if not exists anulado_por       uuid references public.perfiles(id),
  add column if not exists anulado_autorizo  uuid references public.perfiles(id),
  add column if not exists anulado_motivo    text;

comment on column public.leads.anulado_at is
  'Lo anuló quien lo registró, con código de supervisor, mientras estaba en la bandeja de Central (0338). El estado queda descartado.';

-- ── Anular ────────────────────────────────────────────────────────────────
create or replace function public.anular_mi_registro(p_lead uuid, p_pin text, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo      uuid := auth.uid();
  v_lead    leads%rowtype;
  v_motivo  text := btrim(coalesce(p_motivo, ''));
  v_autorizo uuid;
begin
  if v_yo is null then raise exception 'Sesión no válida'; end if;
  if length(v_motivo) < 5 then
    raise exception 'Escriba por qué se anula (por ejemplo: «se registró dos veces» o «la razón social era otra»).';
  end if;

  select * into v_lead from leads where id = p_lead for update;
  if v_lead.id is null then raise exception 'Ese registro no existe'; end if;
  if v_lead.recibido_por is distinct from v_yo then
    raise exception 'Solo quien lo registró puede anularlo. Si es de otra persona, pídaselo a Central.';
  end if;
  if v_lead.estado <> 'pendiente_triaje' then
    raise exception 'Central ya lo sacó de su bandeja: ya no se anula desde acá. Pídale a Central que lo corrija.';
  end if;

  v_autorizo := validar_codigo_autorizacion(p_pin, 'derivacion');

  update leads
     set estado           = 'descartado',
         anulado_at       = now(),
         anulado_por      = v_yo,
         anulado_autorizo = v_autorizo,
         anulado_motivo   = v_motivo,
         updated_at       = now()
   where id = p_lead;

  return format('%s anulado. Autorizó %s.', coalesce(v_lead.codigo, 'Registro'),
                coalesce((select nombre from perfiles where id = v_autorizo), 'el supervisor'));
end $$;

-- ── Corregir los datos ────────────────────────────────────────────────────
-- Las mismas validaciones y el mismo rastro (datos_originales) que
-- corregir_datos_lead, que es la puerta de Central y sigue sin código.
create or replace function public.corregir_mi_registro(
  p_lead uuid, p_pin text, p_motivo text,
  p_nombre text, p_razon_social text default null, p_telefono text default null,
  p_email text default null, p_num_doc text default null, p_mensaje text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo      uuid := auth.uid();
  v_lead    leads%rowtype;
  v_motivo  text := btrim(coalesce(p_motivo, ''));
  v_nombre  text := btrim(coalesce(p_nombre, ''));
  v_razon   text := nullif(btrim(coalesce(p_razon_social, '')), '');
  v_tel     text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_doc     text := nullif(regexp_replace(coalesce(p_num_doc, ''), '[^0-9]', '', 'g'), '');
  v_msj     text := nullif(btrim(coalesce(p_mensaje, '')), '');
  v_autorizo uuid;
begin
  if v_yo is null then raise exception 'Sesión no válida'; end if;
  if length(v_motivo) < 5 then raise exception 'Escriba por qué se corrige.'; end if;
  if length(v_nombre) < 2 then raise exception 'Escriba el nombre de la persona que se contactó.'; end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ese correo no tiene forma de correo (falta el @ o el dominio).';
  end if;
  if v_doc is not null and length(v_doc) not in (8, 11) then
    raise exception 'El documento tiene que ser un DNI (8 dígitos) o un RUC (11). Si no lo sabe, déjelo vacío.';
  end if;
  if v_tel is not null and length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Ese teléfono tiene menos de 6 dígitos.';
  end if;

  select * into v_lead from leads where id = p_lead for update;
  if v_lead.id is null then raise exception 'Ese registro no existe'; end if;
  if v_lead.recibido_por is distinct from v_yo then
    raise exception 'Solo quien lo registró puede corregirlo. Si es de otra persona, pídaselo a Central.';
  end if;
  if v_lead.estado <> 'pendiente_triaje' then
    raise exception 'Central ya lo derivó: sus datos viven ahora en la ficha del cliente. Pídale a Central o al comercial que lo corrija.';
  end if;

  if v_nombre = coalesce(v_lead.nombre_contacto, '')
     and v_razon is not distinct from v_lead.razon_social
     and v_tel   is not distinct from v_lead.telefono
     and v_email is not distinct from v_lead.email
     and v_doc   is not distinct from v_lead.num_doc
     and (v_msj is null or v_msj is not distinct from v_lead.mensaje) then
    raise exception 'Los datos ya dicen exactamente eso. No hay nada que corregir.';
  end if;

  v_autorizo := validar_codigo_autorizacion(p_pin, 'derivacion');

  update leads
     set nombre_contacto    = v_nombre,
         razon_social       = v_razon,
         telefono           = v_tel,
         email              = v_email,
         num_doc            = v_doc,
         datos_originales   = coalesce(datos_originales, jsonb_build_object(
           'nombre_contacto', v_lead.nombre_contacto,
           'razon_social',    v_lead.razon_social,
           'telefono',        v_lead.telefono,
           'email',           v_lead.email,
           'num_doc',         v_lead.num_doc
         )) || jsonb_build_object('correccion_con_codigo', jsonb_build_object(
           'motivo', v_motivo, 'autorizo', v_autorizo, 'at', now())),
         datos_editados_por = v_yo,
         datos_editados_at  = now(),
         -- El texto, solo si cambió; el original queda como en «Editar lo que pide».
         mensaje            = coalesce(v_msj, v_lead.mensaje),
         mensaje_original   = case when v_msj is not null and v_msj is distinct from v_lead.mensaje
                                   then coalesce(v_lead.mensaje_original, v_lead.mensaje)
                                   else v_lead.mensaje_original end,
         mensaje_editado_por = case when v_msj is not null and v_msj is distinct from v_lead.mensaje
                                   then v_yo else v_lead.mensaje_editado_por end,
         mensaje_editado_at  = case when v_msj is not null and v_msj is distinct from v_lead.mensaje
                                   then now() else v_lead.mensaje_editado_at end,
         updated_at         = now()
   where id = p_lead;

  return format('%s corregido. Autorizó %s. Motivo: %s', coalesce(v_lead.codigo, 'Registro'),
                coalesce((select nombre from perfiles where id = v_autorizo), 'el supervisor'), v_motivo);
end $$;

revoke all on function public.anular_mi_registro(uuid, text, text) from public, anon;
revoke all on function public.corregir_mi_registro(uuid, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.anular_mi_registro(uuid, text, text) to authenticated;
grant execute on function public.corregir_mi_registro(uuid, text, text, text, text, text, text, text, text) to authenticated;
