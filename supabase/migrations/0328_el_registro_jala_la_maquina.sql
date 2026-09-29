-- EL REGISTRO JALA LA MÁQUINA (Rubí, 28-09 19:17: «aquí no debería de ir para
-- registrar, pero no puedo registrar nada»).
--
-- Rubí registró ella misma la puesta en marcha de AGROCASAGRANDE con sus dos
-- series (autoderivado, 0327) y a los tres minutos el circuito le volvió a
-- preguntar de qué máquina hablaba, sin ninguna caja donde escribir. La serie
-- que se da al registrar nunca llegó al caso: registrar_atencion_postventa
-- recibe p_equipo y no lo guarda —la serie viaja solo como texto, «Serie: X»—
-- y crear_atencion_al_derivar copia oportunidades.equipo_id, que nadie llena.
-- TODOS los casos nacían sin máquina y con la garantía sin verificar.
--
-- Es lo que la reunión del 28-09 (14:18) ya había dicho del paso Registro:
-- «no, ahí no registras, sino jalas». Desde acá, al nacer el caso se buscan en
-- el pedido las series del parque de ESE cliente: la que viene en «Serie:» es
-- la principal, con su garantía verificada, y las demás quedan sumadas al caso.
-- Si el texto no nombra ninguna, el caso nace como antes y la máquina se elige
-- en el Paso 1.
--
-- Sin columnas nuevas ni cambios de firma: se lee lo que el registro ya escribe.

-- ¿El texto nombra esta serie? Entera, no como parte de otra más larga.
create or replace function menciona_serie(p_texto text, p_serie text)
returns boolean
language plpgsql
immutable
as $$
declare
  t text := upper(coalesce(p_texto, ''));
  s text := limpiar_serie(p_serie);
  i integer;
  desde integer := 1;
  antes text;
  despues text;
begin
  -- Una serie de menos de seis caracteres aparece en cualquier texto.
  if s is null or length(s) < 6 then return false; end if;
  loop
    i := position(s in substr(t, desde));
    exit when i = 0;
    i := i + desde - 1;
    antes := case when i > 1 then substr(t, i - 1, 1) else ' ' end;
    despues := substr(t, i + length(s), 1);
    if antes !~ '[A-Z0-9]' and (despues = '' or despues !~ '[A-Z0-9]') then
      return true;
    end if;
    desde := i + 1;
  end loop;
  return false;
end $$;

-- Las máquinas del cliente que el pedido ya nombra. Primero la que viene en
-- «Serie:» (la que se eligió al registrar); después, en el orden del texto.
create or replace function maquinas_mencionadas(p_cuenta uuid, p_texto text)
returns table (equipo_id uuid, orden integer)
language plpgsql
stable
set search_path = public
as $$
declare
  v_pos integer := position(E'\nSerie: ' in coalesce(p_texto, ''));
  v_principal text;
begin
  if p_cuenta is null or coalesce(btrim(p_texto), '') = '' then return; end if;
  if v_pos > 0 then
    v_principal := limpiar_serie(split_part(substr(p_texto, v_pos + 8), E'\n', 1));
  end if;
  return query
    select e.id,
           case when limpiar_serie(e.serie) = v_principal then 0
                else position(limpiar_serie(e.serie) in upper(p_texto)) end
      from equipos_instalados e
     where e.cuenta_id = p_cuenta
       and menciona_serie(p_texto, e.serie)
     order by 2, e.created_at;
end $$;

CREATE OR REPLACE FUNCTION public.crear_atencion_al_derivar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tipo tipo_atencion;
  v_mensaje text;
  v_equipo uuid;
  v_garantia jsonb;
  v_atencion uuid;
begin
  if new.lead_id is null or new.tipo_postventa is null then return new; end if;

  select l.sugerido_atencion, l.mensaje into v_tipo, v_mensaje from leads l where l.id = new.lead_id;
  if v_tipo is null then
    v_tipo := case new.tipo_postventa::text
      when 'garantia' then 'problema_tecnico'::tipo_atencion
      when 'puesta_en_marcha' then 'puesta_en_marcha'::tipo_atencion
      when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
      when 'despacho' then null
      when 'soporte_tecnico' then 'soporte_tecnico'::tipo_atencion
      when 'seguimiento' then null
      else 'solicitud_mantenimiento'::tipo_atencion
    end;
  end if;

  -- SOPORTE TÉCNICO LLEVA EL CIRCUITO COMPLETO (reunión 28-09). Si Central lo
  -- deriva como soporte técnico, el caso es de soporte aunque la sugerencia
  -- dijera otra cosa; y si la sugerencia era soporte pero Central eligió otro
  -- tipo, manda Central (la sugerencia solo desempata la puesta en marcha que
  -- viajaba como «garantia», 0231).
  if new.tipo_postventa::text = 'soporte_tecnico' then
    v_tipo := 'soporte_tecnico'::tipo_atencion;
  elsif v_tipo = 'soporte_tecnico' then
    v_tipo := case new.tipo_postventa::text
      when 'garantia' then 'problema_tecnico'::tipo_atencion
      when 'puesta_en_marcha' then 'puesta_en_marcha'::tipo_atencion
      when 'repuesto' then 'solicitud_repuesto'::tipo_atencion
      when 'mantenimiento' then 'solicitud_mantenimiento'::tipo_atencion
      when 'mantenimiento_correctivo' then 'solicitud_mantenimiento'::tipo_atencion
      else null
    end;
  end if;

  if v_tipo is null or v_tipo not in ('puesta_en_marcha', 'problema_tecnico', 'soporte_tecnico') then return new; end if;
  if exists (select 1 from atenciones a where a.oportunidad_id = new.id) then return new; end if;

  -- EL REGISTRO JALA LA MÁQUINA (0328): la serie que el pedido ya trae es la
  -- máquina del caso, con la garantía verificada al nacer. Va en el insert y
  -- no en un update posterior para que el enganche al pedido (0244) ya la vea.
  v_equipo := new.equipo_id;
  if v_equipo is null then
    select m.equipo_id into v_equipo
      from maquinas_mencionadas(new.cuenta_id, v_mensaje) m
     order by m.orden
     limit 1;
  end if;
  if v_equipo is not null then
    v_garantia := garantia_del_equipo(v_equipo);
  end if;

  insert into atenciones (
    cuenta_id, equipo_id, tipo, etapa, oportunidad_id,
    asignado_a, recibido_por, registrado_at, detalle, es_prueba,
    en_garantia, hizo_preventivo, garantia_verificada_at, garantia_verificada_por
  )
  select
    new.cuenta_id,
    v_equipo,
    v_tipo,
    'registro',
    new.id,
    new.comercial_id,
    l.recibido_por,
    now(),
    l.mensaje,
    coalesce(l.es_prueba, false),
    (v_garantia->>'en_garantia')::boolean,
    (v_garantia->>'hizo_preventivo')::boolean,
    case when v_equipo is not null then now() end,
    case when v_equipo is not null then auth.uid() end
  from leads l where l.id = new.lead_id
  returning id into v_atencion;

  -- Las otras máquinas que nombra el pedido quedan sumadas al caso (0253).
  if v_atencion is not null and v_equipo is not null then
    insert into atencion_equipos (atencion_id, equipo_id, agregado_por)
    select v_atencion, m.equipo_id, auth.uid()
      from maquinas_mencionadas(new.cuenta_id, v_mensaje) m
     where m.equipo_id <> v_equipo
    on conflict do nothing;
  end if;

  return new;
end $function$;

-- Los casos abiertos que ya traían la serie en su pedido y nacieron sin
-- máquina: al 29-09 es uno, el de AGROCASAGRANDE. No toca los que siguieron
-- «sin identificar la máquina» a propósito, ni los de práctica.
do $$
declare
  r record;
  v_equipo uuid;
  v_garantia jsonb;
begin
  for r in
    select a.id, a.cuenta_id, a.detalle
      from atenciones a
     where a.cerrado_at is null
       and a.equipo_id is null
       and a.cuenta_id is not null
       and a.garantia_omitida_at is null
       and coalesce(a.es_prueba, false) = false
  loop
    select m.equipo_id into v_equipo
      from maquinas_mencionadas(r.cuenta_id, r.detalle) m
     order by m.orden
     limit 1;
    continue when v_equipo is null;

    v_garantia := garantia_del_equipo(v_equipo);
    update atenciones
       set equipo_id = v_equipo,
           en_garantia = (v_garantia->>'en_garantia')::boolean,
           hizo_preventivo = (v_garantia->>'hizo_preventivo')::boolean,
           garantia_verificada_at = now()
     where id = r.id;

    insert into atencion_equipos (atencion_id, equipo_id)
    select r.id, m.equipo_id
      from maquinas_mencionadas(r.cuenta_id, r.detalle) m
     where m.equipo_id <> v_equipo
    on conflict do nothing;
  end loop;
end $$;
