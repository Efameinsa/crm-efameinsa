-- 0423 — «Corregir con código» también corrige la vía y agrega archivos.
--
-- Brenda, 09-10: registró PRO-10877 (HOSPITAL CHANKA) como WhatsApp y fue una
-- llamada —el formulario de registro trae WhatsApp marcado de entrada—. Fue a
-- «Lo que mandé a Central» → Corregir con código, y la vía no estaba entre los
-- campos: solo razón social, RUC, contacto, teléfono, correo y lo que pide.
-- Santos: «prepara para que pueda editar todos los campos». Lo que la ventana
-- muestra y no se podía tocar eran la vía y los adjuntos.
--
-- La vía cambia con el mismo rastro que los demás datos (datos_originales).
-- Los archivos se AGREGAN, no se reemplazan: lo que ya se mandó lo pudo haber
-- abierto Central, y quitarlo en silencio es justo lo que el código evita.
-- Tope de 5 en total, el mismo del registro (esquemaAdjuntosLead).

drop function if exists public.corregir_mi_registro(uuid, text, text, text, text, text, text, text, text);

create or replace function public.corregir_mi_registro(
  p_lead uuid, p_pin text, p_motivo text,
  p_nombre text, p_razon_social text default null, p_telefono text default null,
  p_email text default null, p_num_doc text default null, p_mensaje text default null,
  p_canal text default null, p_adjuntos_nuevos jsonb default null
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
  v_canal   canal_contacto;
  v_nuevos  jsonb := coalesce(p_adjuntos_nuevos, '[]'::jsonb);
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
  if jsonb_typeof(v_nuevos) <> 'array'
     or exists (select 1 from jsonb_array_elements(v_nuevos) a
                 where coalesce(a->>'path', '') not like 'leads/%') then
    raise exception 'Los archivos no son válidos. Quítelos y vuelva a agregarlos.';
  end if;

  select * into v_lead from leads where id = p_lead for update;
  if v_lead.id is null then raise exception 'Ese registro no existe'; end if;
  if v_lead.recibido_por is distinct from v_yo then
    raise exception 'Solo quien lo registró puede corregirlo. Si es de otra persona, pídaselo a Central.';
  end if;
  if v_lead.estado <> 'pendiente_triaje' then
    raise exception 'Central ya lo derivó: sus datos viven ahora en la ficha del cliente. Pídale a Central o al comercial que lo corrija.';
  end if;

  begin
    v_canal := coalesce(nullif(btrim(coalesce(p_canal, '')), '')::canal_contacto, v_lead.canal);
  exception when invalid_text_representation then
    raise exception 'Esa vía no existe. Elija una de los botones.';
  end;

  if jsonb_array_length(coalesce(v_lead.adjuntos, '[]'::jsonb)) + jsonb_array_length(v_nuevos) > 5 then
    raise exception 'Son hasta 5 archivos por registro y ya tiene %. Agregue menos.',
      jsonb_array_length(coalesce(v_lead.adjuntos, '[]'::jsonb));
  end if;

  if v_nombre = coalesce(v_lead.nombre_contacto, '')
     and v_razon is not distinct from v_lead.razon_social
     and v_tel   is not distinct from v_lead.telefono
     and v_email is not distinct from v_lead.email
     and v_doc   is not distinct from v_lead.num_doc
     and v_canal = v_lead.canal
     and jsonb_array_length(v_nuevos) = 0
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
         canal              = v_canal,
         adjuntos           = coalesce(v_lead.adjuntos, '[]'::jsonb) || v_nuevos,
         datos_originales   = coalesce(datos_originales, jsonb_build_object(
           'nombre_contacto', v_lead.nombre_contacto,
           'razon_social',    v_lead.razon_social,
           'telefono',        v_lead.telefono,
           'email',           v_lead.email,
           'num_doc',         v_lead.num_doc
         ))
         -- La vía de antes solo se anota cuando cambió, y solo la primera vez:
         -- igual que los demás datos, lo que se guarda es lo ORIGINAL.
         || case when v_canal <> v_lead.canal and not (coalesce(datos_originales, '{}'::jsonb) ? 'canal')
                 then jsonb_build_object('canal', v_lead.canal) else '{}'::jsonb end
         || jsonb_build_object('correccion_con_codigo', jsonb_build_object(
           'motivo', v_motivo, 'autorizo', v_autorizo, 'at', now(),
           'adjuntos_agregados', jsonb_array_length(v_nuevos))),
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

revoke all on function public.corregir_mi_registro(uuid, text, text, text, text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.corregir_mi_registro(uuid, text, text, text, text, text, text, text, text, text, jsonb) to authenticated;
