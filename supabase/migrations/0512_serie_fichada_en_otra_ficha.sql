-- ════════════════════════════════════════════════════════════════════════
-- 0512 · La serie que ya está en OTRA ficha frena y explica por qué
--
-- Ariana (PV3), 16-10, caso de CORPORACION HOTELERA Y TURISTICA DEL AMAZONAS:
-- la ficha del caso (sin RUC, nombre mal escrito) no tenía máquinas; la
-- lavadora 2405000107 estaba en la otra ficha del mismo cliente (con RUC,
-- cargada de la guía EG07-208). Al fichar la serie, fichar_equipo reusaba en
-- silencio la máquina de la otra ficha: el caso quedaba atado a una máquina de
-- otro cliente, con la garantía de esa guía y sin usar la fecha que ella
-- escribía. Ella lo vio como «no me deja» y hubo que deshacerlo a mano.
--
-- Santos: «debería de aparecerle un aviso de que no se puede seguir porque
-- está en otra ficha… para que explique y sepa y no se frustre».
--
-- Ahora, si la serie ya está fichada en otra ficha que no es este cliente
-- (ni una sede del mismo grupo, ni una ficha ya unida a esta), no se reusa: se
-- frena con un mensaje que dice en qué ficha está y qué hacer. Sin cliente en
-- la máquina, o en la misma ficha, todo sigue como antes.
-- ════════════════════════════════════════════════════════════════════════

create or replace function public.fichar_equipo(p_cuenta uuid, p_serie text DEFAULT NULL::text, p_modelo text DEFAULT NULL::text, p_producto uuid DEFAULT NULL::uuid, p_fecha_compra date DEFAULT NULL::date, p_garantia_meses integer DEFAULT 24, p_ubicacion text DEFAULT NULL::text, p_atencion uuid DEFAULT NULL::uuid, p_registrado_en text DEFAULT 'parque'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_serie   text := nullif(btrim(coalesce(p_serie, '')), '');
  v_equipo  uuid;
  v_cuenta  uuid := p_cuenta;
  v_otra    cuentas%rowtype;
  v_mia     cuentas%rowtype;
begin
  if p_atencion is not null and v_cuenta is null then
    select cuenta_id into v_cuenta from atenciones where id = p_atencion;
  end if;
  if v_cuenta is null then
    raise exception 'Hay que decir de qué cliente es la máquina';
  end if;

  -- La misma serie no se ficha dos veces: si ya está, se reusa esa ficha y se
  -- la ata a la atención. Que dos personas atiendan la misma llamada no puede
  -- terminar en dos máquinas iguales en el parque.
  if v_serie is not null then
    select id into v_equipo from equipos_instalados
     where upper(btrim(serie)) = upper(v_serie);
  end if;

  -- 0512: …salvo que esa máquina sea de OTRA ficha. Casi siempre es el mismo
  -- cliente partido en dos fichas; reusarla en silencio ataba el caso a otro
  -- cliente. Se frena y se dice dónde está.
  if v_equipo is not null then
    select c.* into v_otra
      from equipos_instalados e join cuentas c on c.id = e.cuenta_id
     where e.id = v_equipo;
    select * into v_mia from cuentas where id = v_cuenta;
    if v_otra.id is not null
       and v_otra.id <> v_cuenta
       and v_otra.fusionada_en is distinct from v_cuenta
       and v_otra.cuenta_padre_id is distinct from v_cuenta
       and v_mia.cuenta_padre_id is distinct from v_otra.id
       and (v_mia.cuenta_padre_id is null or v_mia.cuenta_padre_id is distinct from v_otra.cuenta_padre_id) then
      raise exception 'La serie % ya está registrada en otra ficha: «%»%. Seguramente es el mismo cliente partido en dos fichas. No se puede seguir desde acá: avise por el buzón del CRM para que unan las dos fichas; después la máquina aparece en la lista y se elige con «Es esta».',
        v_serie, v_otra.razon_social,
        case when coalesce(btrim(v_otra.num_doc), '') <> '' then format(' (%s %s)', v_otra.tipo_doc, v_otra.num_doc) else '' end;
    end if;
  end if;

  if v_equipo is null then
    insert into equipos_instalados (
      serie, cuenta_id, producto_id, modelo_texto, fecha_venta,
      garantia_meses, ubicacion, registrado_por, registrado_en
    ) values (
      v_serie, v_cuenta, p_producto, nullif(btrim(coalesce(p_modelo, '')), ''), p_fecha_compra,
      coalesce(p_garantia_meses, 24), nullif(btrim(coalesce(p_ubicacion, '')), ''),
      auth.uid(), p_registrado_en
    )
    returning id into v_equipo;
  end if;

  -- Si vino desde una atención, queda vinculada y con la garantía verificada:
  -- es el mismo clic que ya daba el panel de las series.
  if p_atencion is not null then
    update atenciones a
       set equipo_id = v_equipo,
           en_garantia = (select coalesce(e.garantia_hasta >= hoy_lima(), false)
                            from equipos_instalados e where e.id = v_equipo),
           hizo_preventivo = (select coalesce(e.ultimo_mantenimiento is not null, false)
                                from equipos_instalados e where e.id = v_equipo),
           garantia_verificada_at = now(),
           garantia_verificada_por = auth.uid()
     where a.id = p_atencion;
  end if;

  return v_equipo;
end;
$function$;
