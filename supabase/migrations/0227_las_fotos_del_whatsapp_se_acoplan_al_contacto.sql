-- ============================================================
-- CRM EFAMEINSA · Migración 0227 · Las fotos del WhatsApp se acoplan al contacto que ya entró
-- ============================================================
-- Central, 11-09 (por Santos): «¿podrías acoplar también (adjuntar fotos)? Es
-- un prospecto que escribió al mismo tiempo en la web y por WhatsApp, y me
-- envió fotos». Carlos Timana (PRO-09287) entró por el formulario web a las
-- 14:10 y a la vez mandó por WhatsApp las fotos de su lavadora. Central podía
-- editar el texto («Editar lo que pide») pero no pegarle las fotos: la única
-- forma era registrar un SEGUNDO contacto —que es justo lo que abre fichas
-- repetidas, el problema de todo el día—.
--
-- `corregir_solicitud_lead` gana `p_adjuntos`: se AGREGAN a los que ya tiene
-- el contacto (nunca se reemplazan), con tope de 10 por contacto. El texto
-- pasa a ser opcional —se puede adjuntar sin reescribir— pero tiene que
-- venir al menos una de las dos cosas. Lo demás no cambia: solo Central o
-- gerencia, solo mientras el contacto está en circulación, el original del
-- texto se guarda la primera vez.
--
-- Firma reemplazada (drop + create): con dos sobrecargas PostgREST no sabría
-- cuál llamar. La app de hoy llama con (p_lead_id, p_texto) y sigue
-- funcionando. El cuerpo es la definición viva, no la de una migración vieja.
-- ============================================================

drop function if exists public.corregir_solicitud_lead(uuid, text);

create or replace function public.corregir_solicitud_lead(
  p_lead_id uuid,
  p_texto text default null,
  p_adjuntos jsonb default null
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quien    uuid := auth.uid();
  v_lead     leads%rowtype;
  v_texto    text := btrim(coalesce(p_texto, ''));
  v_nuevos   jsonb := coalesce(p_adjuntos, '[]'::jsonb);
  v_adj      jsonb;
  v_total    integer;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  -- Quién puede: quien atiende el teléfono y quien supervisa. El comercial no
  -- reescribe lo que el cliente pidió — eso es su gestión, y va en la ficha.
  if not (coalesce(rol_actual() = 'central', false) or coalesce(es_backoffice(), false)) then
    raise exception 'Solo Central o gerencia pueden corregir lo que solicita el prospecto';
  end if;

  if jsonb_typeof(v_nuevos) <> 'array' then
    raise exception 'Los adjuntos no son válidos.';
  end if;
  if v_texto = '' and jsonb_array_length(v_nuevos) = 0 then
    raise exception 'Escriba qué solicita el prospecto o adjunte lo que mandó: una de las dos cosas.';
  end if;
  if v_texto <> '' and length(v_texto) < 5 then
    raise exception 'Escriba qué solicita el prospecto (una frase alcanza).';
  end if;
  if length(v_texto) > 2000 then
    raise exception 'El detalle es demasiado largo. Resuma en lo que el comercial necesita para llamar.';
  end if;
  -- Cada adjunto tiene que ser de los que sube el propio CRM al bucket: un
  -- path fuera de leads/ es una ruta inventada y no se guarda.
  for v_adj in select value from jsonb_array_elements(v_nuevos) loop
    if coalesce(v_adj->>'path', '') !~ '^leads/' or coalesce(v_adj->>'nombre', '') = '' then
      raise exception 'Los adjuntos no son válidos. Quítelos y vuelva a agregarlos.';
    end if;
  end loop;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'Ese contacto no existe'; end if;

  -- Mientras el contacto siga vivo. Un descartado o un duplicado ya no lo lee
  -- nadie, y reescribirlos solo serviría para maquillar por qué salieron.
  if v_lead.estado not in ('pendiente_triaje', 'asignado') then
    raise exception 'Ese contacto ya no está en circulación (%). No se corrige lo que pidió.', v_lead.estado;
  end if;

  if v_texto <> '' and coalesce(v_lead.mensaje, '') = v_texto and jsonb_array_length(v_nuevos) = 0 then
    raise exception 'El detalle ya dice exactamente eso. No hay nada que corregir.';
  end if;

  v_total := jsonb_array_length(coalesce(v_lead.adjuntos, '[]'::jsonb)) + jsonb_array_length(v_nuevos);
  if v_total > 10 then
    raise exception 'Un contacto lleva hasta 10 archivos; este ya tiene %. Quite alguno o resuma.',
      jsonb_array_length(coalesce(v_lead.adjuntos, '[]'::jsonb));
  end if;

  update leads
     set mensaje             = case when v_texto <> '' and coalesce(mensaje, '') <> v_texto then v_texto else mensaje end,
         -- Solo la PRIMERA vez que cambia el texto: lo que se guarda es lo que
         -- entró, no la corrección anterior.
         mensaje_original    = case when v_texto <> '' and coalesce(mensaje, '') <> v_texto
                                    then coalesce(mensaje_original, mensaje) else mensaje_original end,
         mensaje_editado_por = case when v_texto <> '' and coalesce(mensaje, '') <> v_texto then v_quien else mensaje_editado_por end,
         mensaje_editado_at  = case when v_texto <> '' and coalesce(mensaje, '') <> v_texto then now() else mensaje_editado_at end,
         adjuntos            = coalesce(adjuntos, '[]'::jsonb) || v_nuevos,
         updated_at          = now()
   where id = p_lead_id;

  return coalesce(nullif(v_texto, ''), v_lead.mensaje);
end $function$;

comment on function public.corregir_solicitud_lead(uuid, text, jsonb) is
  'Central corrige lo que pide el prospecto y/o le acopla los archivos que mandó por otro canal (0199, 0227). Los adjuntos se agregan, nunca se reemplazan; tope 10 por contacto.';
