-- CORREGIR «QUÉ SOLICITA» DESDE LA BANDEJA DE TRIAJE.
--
-- Central, 09-09 por la mañana: «¿se podría editar lo que solicita el
-- prospecto desde la bandeja de triaje?».
--
-- El dato existe desde el 24-08 (lo pidió Brenda: «necesito ver el detalle de
-- la solicitud de cada prospecto nuevo, cada uno tiene diferente interés de
-- compra») pero hasta hoy era de una sola escritura: lo que se tecleó al
-- registrar el contacto es lo que lee el comercial, para siempre. Y el texto
-- se escribe MIENTRAS se atiende el teléfono — con el cliente hablando —, así
-- que sale con lo que se alcanzó a anotar. Cuando el cliente sigue contando
-- («son dos lavadoras, una de 70 kg»), Central no tenía dónde ponerlo: la
-- única salida era escribirle al comercial por WhatsApp, fuera del CRM.
--
-- POR QUÉ SIN CÓDIGO DE SUPERVISOR, a diferencia del canal (0195). El canal es
-- el dato con el que gerencia audita —«dice WhatsApp, pásame el WhatsApp»—; si
-- se pudiera cambiar sin firma, la auditoría no valdría. Lo que pide el
-- cliente no se audita: se usa para atenderlo. Pedir un código de supervisor
-- para completar una frase sería garantizar que nadie la complete, y el
-- comercial seguiría trabajando con el texto incompleto.
--
-- PERO NO SE PIERDE LO QUE ENTRÓ. `mensaje_original` guarda el primer texto la
-- primera vez que se corrige, y queda quién y cuándo. Es la diferencia entre
-- corregir y borrar: la pantalla muestra el texto vigente y, debajo, lo que
-- decía antes. Importa sobre todo con los contactos de Google Ads, cuyo
-- mensaje NO lo escribió nadie —son los pares «Campaña: …· Ciudad: …» que
-- manda el formulario— y que al corregirse a mano perderían la procedencia.

alter table leads
  add column if not exists mensaje_original    text,
  add column if not exists mensaje_editado_por uuid references perfiles(id),
  add column if not exists mensaje_editado_at  timestamptz;

comment on column leads.mensaje_original is
  'El texto tal como entró, guardado la primera vez que se corrige `mensaje`. Null = nunca se corrigió.';

create or replace function public.corregir_solicitud_lead(
  p_lead_id uuid,
  p_texto   text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien   uuid := auth.uid();
  v_lead    leads%rowtype;
  v_texto   text := btrim(coalesce(p_texto, ''));
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  -- Quién puede: quien atiende el teléfono y quien supervisa. El comercial no
  -- reescribe lo que el cliente pidió — eso es su gestión, y va en la ficha.
  if not (coalesce(rol_actual() = 'central', false) or coalesce(es_backoffice(), false)) then
    raise exception 'Solo Central o gerencia pueden corregir lo que solicita el prospecto';
  end if;

  if length(v_texto) < 5 then
    raise exception 'Escriba qué solicita el prospecto (una frase alcanza).';
  end if;
  if length(v_texto) > 2000 then
    raise exception 'El detalle es demasiado largo. Resuma en lo que el comercial necesita para llamar.';
  end if;

  select * into v_lead from leads where id = p_lead_id for update;
  if v_lead.id is null then raise exception 'Ese contacto no existe'; end if;

  -- Mientras el contacto siga vivo. Un descartado o un duplicado ya no lo lee
  -- nadie, y reescribirlos solo serviría para maquillar por qué salieron.
  if v_lead.estado not in ('pendiente_triaje', 'asignado') then
    raise exception 'Ese contacto ya no está en circulación (%). No se corrige lo que pidió.', v_lead.estado;
  end if;

  if coalesce(v_lead.mensaje, '') = v_texto then
    raise exception 'El detalle ya dice exactamente eso. No hay nada que corregir.';
  end if;

  update leads
     set mensaje            = v_texto,
         -- Solo la PRIMERA vez: lo que se guarda es lo que entró, no la
         -- corrección anterior. Si no, a la tercera pasada el original se
         -- habría perdido igual.
         mensaje_original   = coalesce(mensaje_original, mensaje),
         mensaje_editado_por = v_quien,
         mensaje_editado_at  = now()
   where id = p_lead_id;

  return v_texto;
end $$;

comment on function public.corregir_solicitud_lead(uuid, text) is
  'Corrige o completa lo que solicita el prospecto (leads.mensaje) desde la bandeja de triaje o después de derivar. Guarda el texto original la primera vez: se corrige a la vista, no se borra.';

revoke all on function public.corregir_solicitud_lead(uuid, text) from public;
grant execute on function public.corregir_solicitud_lead(uuid, text) to authenticated;
