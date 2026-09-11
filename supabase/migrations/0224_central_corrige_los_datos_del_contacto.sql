-- ============================================================
-- CRM EFAMEINSA · Migración 0224 · Central corrige los datos del contacto
-- ============================================================
-- Reunión de gerencia del 11-09, 12:00. Central: «quería poder editar, por
-- ejemplo, de un prospecto su nombre. Solamente la parte del nombre, no la
-- descripción». El caso: registró a un cliente de Topitop y en el nombre
-- puso «Topitop» donde iba «Carlos». Y en la misma frase: «no hay número de
-- contacto, no te permite corregir; solamente descripción».
--
-- Hasta hoy lo único que se corregía sin salir de la bandeja era «qué
-- solicita» (0199). El nombre, la razón social, el teléfono, el correo y el
-- documento eran de una sola escritura: si salían mal, se derivaban mal, y
-- la ficha del cliente nacía con el error puesto.
--
-- MISMA REGLA QUE LA 0199: sin código de supervisor —son los datos con los
-- que se atiende, no con los que se audita— y SIN BORRAR LO QUE ENTRÓ. Lo
-- que trajo el formulario o se tecleó al teléfono se guarda la primera vez
-- que se corrige, en `datos_originales`, y la tarjeta lo muestra debajo.
--
-- SOLO MIENTRAS ESTÁ EN LA BANDEJA. Una vez derivado, la ficha del cliente
-- ya existe con esos datos y es del comercial: corregir el contacto ahí no
-- corregiría la ficha, y tener dos verdades es peor que una equivocada. Al
-- derivar, el CRM toma los datos ya corregidos.
-- ============================================================

alter table leads
  add column if not exists datos_originales  jsonb,
  add column if not exists datos_editados_por uuid references perfiles(id),
  add column if not exists datos_editados_at  timestamptz;

comment on column leads.datos_originales is
  'Nombre, razón social, teléfono, correo y documento tal como entraron, guardados la primera vez que Central los corrige (0224). Null = nunca se corrigieron.';

create or replace function public.corregir_datos_lead(
  p_lead_id      uuid,
  p_nombre       text,
  p_razon_social text default null,
  p_telefono     text default null,
  p_email        text default null,
  p_num_doc      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien   uuid := auth.uid();
  v_lead    leads%rowtype;
  v_nombre  text := btrim(coalesce(p_nombre, ''));
  v_razon   text := nullif(btrim(coalesce(p_razon_social, '')), '');
  v_tel     text := nullif(btrim(coalesce(p_telefono, '')), '');
  v_email   text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_doc     text := nullif(regexp_replace(coalesce(p_num_doc, ''), '[^0-9]', '', 'g'), '');
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  if not (coalesce(rol_actual() = 'central', false) or coalesce(es_backoffice(), false)) then
    raise exception 'Solo Central o gerencia pueden corregir los datos del contacto';
  end if;

  if length(v_nombre) < 2 then
    raise exception 'Escriba el nombre de la persona que se contactó.';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ese correo no tiene forma de correo (falta el @ o el dominio).';
  end if;
  if v_doc is not null and length(v_doc) not in (8, 11) then
    raise exception 'El documento tiene que ser un DNI (8 dígitos) o un RUC (11). Si no lo sabe, déjelo vacío.';
  end if;
  if v_tel is not null and length(regexp_replace(v_tel, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Ese teléfono tiene menos de 6 dígitos.';
  end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'Ese contacto no existe'; end if;

  if v_lead.estado <> 'pendiente_triaje' then
    raise exception 'Ese contacto ya se derivó: sus datos viven ahora en la ficha del cliente, que corrige el comercial.';
  end if;

  if v_nombre = coalesce(v_lead.nombre_contacto, '')
     and v_razon is not distinct from v_lead.razon_social
     and v_tel   is not distinct from v_lead.telefono
     and v_email is not distinct from v_lead.email
     and v_doc   is not distinct from v_lead.num_doc then
    raise exception 'Los datos ya dicen exactamente eso. No hay nada que corregir.';
  end if;

  update leads
     set nombre_contacto    = v_nombre,
         razon_social       = v_razon,
         telefono           = v_tel,
         email              = v_email,
         num_doc            = v_doc,
         -- Solo la PRIMERA vez: lo que se guarda es lo que entró.
         datos_originales   = coalesce(datos_originales, jsonb_build_object(
           'nombre_contacto', v_lead.nombre_contacto,
           'razon_social',    v_lead.razon_social,
           'telefono',        v_lead.telefono,
           'email',           v_lead.email,
           'num_doc',         v_lead.num_doc
         )),
         datos_editados_por = v_quien,
         datos_editados_at  = now()
   where id = p_lead_id;
end $$;

comment on function public.corregir_datos_lead(uuid, text, text, text, text, text) is
  'Central corrige nombre, razón social, teléfono, correo y documento de un contacto mientras está en la bandeja de triaje (0224). Guarda lo que entró la primera vez: se corrige a la vista, no se borra.';

revoke all on function public.corregir_datos_lead(uuid, text, text, text, text, text) from public;
grant execute on function public.corregir_datos_lead(uuid, text, text, text, text, text) to authenticated;
