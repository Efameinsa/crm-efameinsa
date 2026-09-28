-- POSTVENTA REGULARIZA LA SERIE DE UN EQUIPO DEL PARQUE (reunión de gerencia,
-- 28-09).
--
-- Carlos, con BUNGARENA LODGE abierto: «van a haber clientes que quizás no
-- tienen especificada la serie en el CRM. Entonces el trabajo de postventa…
-- contrastamos la información. Si hay un error, rápidamente tenemos que
-- regularizar la serie del equipo… Y lo puedes editar. —Exactamente». Y el
-- porqué: «tú cuando cotizas, le vas a cotizar con la serie… el cliente puede
-- tener 20 máquinas de lo mismo».
--
-- Hasta hoy la única corrección era `corregir_serie_del_equipo`, por ítem de
-- pedido, con el código de operaciones y solo mientras el pedido no salía. Una
-- máquina que ya está en el parque (de un pedido viejo, de una guía, fichada a
-- mano) no tenía cómo corregirse ni cómo recibir la serie que le faltaba. Esta
-- función lo hace desde la ficha del equipo: postventa, operaciones o
-- gerencia; con motivo; sin repetir una serie que ya es de otra máquina; y
-- deja escrito el cambio en las observaciones del equipo. Si la máquina salió
-- de un pedido del CRM, el renglón del pedido se alinea para que los dos digan
-- lo mismo.

create or replace function corregir_serie_parque(p_equipo uuid, p_serie text, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e equipos_instalados%rowtype;
  -- Mismo criterio que el disparador (0313): sin «SERIE:», «S/N» ni espacios.
  v_nueva text := nullif(upper(btrim(coalesce(limpiar_serie(p_serie), ''))), '');
  v_quien text;
begin
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La serie del parque la corrige postventa, operaciones o gerencia';
  end if;
  if v_nueva is null or length(v_nueva) < 4 then
    raise exception 'Escriba la serie completa, como está en la placa, la guía o la caja';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escriba de dónde sale la serie correcta (una frase basta)';
  end if;
  select * into e from equipos_instalados where id = p_equipo for update;
  if e.id is null then raise exception 'Ese equipo no existe'; end if;
  if upper(btrim(coalesce(e.serie, ''))) = v_nueva then
    raise exception 'El equipo ya tiene esa serie';
  end if;
  if exists (select 1 from equipos_instalados x where x.id <> p_equipo and upper(btrim(x.serie)) = v_nueva) then
    raise exception 'La serie % ya es de otra máquina del parque: revise cuál es la buena antes de cambiarla', v_nueva;
  end if;
  select nombre into v_quien from perfiles where id = auth.uid();

  update equipos_instalados
     set serie = v_nueva,
         observaciones = concat_ws(E'\n', nullif(observaciones, ''),
           format('%s — %s corrigió la serie %s → %s: %s',
             to_char(now() at time zone 'America/Lima', 'DD-MM-YYYY HH24:MI'),
             coalesce(v_quien, 'alguien'), coalesce(e.serie, '(sin serie)'), v_nueva, btrim(p_motivo))),
         updated_at = now()
   where id = p_equipo;

  update pedido_equipos set serie = v_nueva where equipo_id = p_equipo;

  return (select serie from equipos_instalados where id = p_equipo);
end $$;

grant execute on function corregir_serie_parque(uuid, text, text) to authenticated;
