-- ============================================================
-- CRM EFAMEINSA · Migración 0223 · Derivar como «cliente nuevo» con una coincidencia delante lleva razón
-- ============================================================
-- Caso GATE GOURMET (10-09). El correo de Nayeli Loayza (@gategroup.com, sin
-- RUC) entró a la bandeja; el cruce por dominio casaba con la ficha de C4 y el
-- buscador por nombre del diálogo, con las de C4 y C1. Central lo derivó como
-- «Cliente nuevo» a C5 y nació una TERCERA ficha vacía. C5, al día siguiente:
-- «no jaló historial». Es el mismo caso de CANDELA PERÚ del 09-09.
--
-- La app ahora (a) une el contacto a la ficha que Central elige en el diálogo
-- —antes el clic solo preseleccionaba al comercial y la ficha nueva se creaba
-- igual— y (b) cuando hay coincidencias y Central deriva como nuevo de todos
-- modos, exige una razón. Esa razón tiene que quedar ESCRITA en la
-- derivación, que es lo que C5 o gerencia van a leer después: para eso
-- `asignar_lead_con_pin` gana `p_nota`.
--
-- Se reemplaza la firma (drop + create): con dos sobrecargas PostgREST no
-- sabría cuál llamar. La app vieja sigue funcionando porque el parámetro
-- nuevo tiene valor por defecto. El cuerpo es la definición viva, no la de
-- una migración anterior.
-- ============================================================

drop function if exists public.asignar_lead_con_pin(uuid, uuid, motivo_asignacion, tipo_postventa, text);

create or replace function public.asignar_lead_con_pin(
  p_lead_id uuid,
  p_comercial_id uuid,
  p_motivo motivo_asignacion default null,
  p_tipo_postventa tipo_postventa default null,
  p_pin text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_juego record;
  v_supervisor uuid;
  v_oportunidad uuid;
begin
  select * into v_juego from cartera_en_juego(p_lead_id, p_comercial_id);

  if v_juego.cuenta_id is not null then
    -- Un caso de postventa no toma cartera nunca (0080), así que no se le pide
    -- nada: `asignar_lead` ya deja la cuenta donde está.
    if p_tipo_postventa is null then
      if coalesce(btrim(p_pin), '') = '' then
        raise exception 'DERIVACION_MUEVE_CARTERA: % es cliente de % (%). Derivarlo a otro comercial le cambia el dueño y eso lo autoriza gerencia.',
          v_juego.razon_social, v_juego.dueno_nombre, coalesce(v_juego.dueno_codigo, 's/c');
      end if;
      v_supervisor := validar_pin_supervisor(p_pin);
    end if;
  end if;

  v_oportunidad := asignar_lead(p_lead_id, p_comercial_id, p_motivo, p_tipo_postventa);

  -- Queda escrito quién autorizó el traspaso, que es lo que hoy no existía.
  if v_supervisor is not null then
    update asignaciones
       set decidida_por = v_supervisor,
           notas = coalesce(notas || ' · ', '') || 'Traspaso de cartera autorizado con código de supervisor'
     where lead_id = p_lead_id
       and created_at > now() - interval '1 minute';
  end if;

  -- La razón por la que se derivó como cliente nuevo teniendo una coincidencia
  -- delante (0223). Se guarda tal cual la escribió Central, con su rótulo,
  -- para que se distinga de una nota de traspaso.
  if length(btrim(coalesce(p_nota, ''))) > 0 then
    update asignaciones
       set notas = coalesce(notas || ' · ', '') || 'Derivado como cliente nuevo pese a la coincidencia: ' || btrim(p_nota)
     where lead_id = p_lead_id
       and created_at > now() - interval '1 minute';
  end if;

  return v_oportunidad;
end;
$function$;

comment on function public.asignar_lead_con_pin(uuid, uuid, motivo_asignacion, tipo_postventa, text, text) is
  'Deriva un contacto; pide el código del supervisor si la derivación mueve cartera (0107) y anota la razón cuando se deriva como cliente nuevo pese a una coincidencia (0223).';
