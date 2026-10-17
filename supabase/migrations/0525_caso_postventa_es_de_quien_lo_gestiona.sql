-- 0525 · EL CASO DE POSTVENTA ES DE QUIEN LO GESTIONA (Santos, 17-10, ECOLAV).
--
-- Central le derivó a Ariana (PV3) la válvula de ECOLAV el 16-10, pero el
-- cliente ya tenía un expediente abierto de Rubí (PV1) y ahí se quedó. Ariana
-- registró la llamada, armó Presu_1208-26, gerencia la aprobó y ella la
-- confirmó, y en su Kanban no aparecía nada: «Mis oportunidades» lista por
-- dueño, y el dueño seguía siendo Rubí. Encima la próxima acción quedó en
-- «Volver a llamar 17-09»: a Rubí le figuraba vencida y a Ariana, nada.
--
-- La regla ya la había dado gerencia el 29-09 («cuando alguien lo gestiona es
-- suyo»), pero la 0333 solo la aplicaba a los casos de la cuenta del ÁREA.
-- Ahora vale también entre personas de postventa:
--   1. Una gestión, una cotización nueva o una cotización confirmada por otra
--      persona de postventa le pasa el caso. A quien lo tenía se le avisa; lo
--      sigue viendo en Atenciones → Casos anteriores, y el registro de acciones
--      guarda el cambio de dueño.
--   2. Al confirmar una cotización, si el expediente no tiene próxima acción o
--      la tiene vencida, queda «Hacer seguimiento de la cotización …» para el
--      siguiente día hábil (lunes a sábado, como emitir_cotizacion).
-- Práctica y real no se mezclan. Sin sesión (sincronía) no se mueve nada.

create or replace function public.caso_postventa_pasa_a(p_op uuid, p_quien uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_antes   uuid;
  v_cliente text;
  v_nombre  text;
begin
  if p_op is null or p_quien is null then return; end if;

  select o.comercial_id, c.razon_social into v_antes, v_cliente
    from oportunidades o
    left join cuentas c on c.id = o.cuenta_id
   where o.id = p_op and o.tipo_postventa is not null;
  if not found or v_antes is null or v_antes = p_quien then return; end if;

  -- Quien gestiona: una persona de postventa, no la cuenta del área.
  if not exists (select 1 from perfiles p
                  where p.id = p_quien and p.es_postventa and not es_cuenta_area_postventa(p.id)) then
    return;
  end if;
  -- Quien lo tenía: el área (como en la 0333) u otra persona de postventa del
  -- mismo mundo (práctica con práctica, real con real).
  if not (es_cuenta_area_postventa(v_antes) or exists (
            select 1 from perfiles a, perfiles q
             where a.id = v_antes and q.id = p_quien and a.es_postventa
               and coalesce(a.es_prueba, false) = coalesce(q.es_prueba, false))) then
    return;
  end if;

  update oportunidades set comercial_id = p_quien, updated_at = now() where id = p_op;

  if not es_cuenta_area_postventa(v_antes) then
    select nombre into v_nombre from perfiles where id = p_quien;
    insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
    values (
      v_antes,
      'otro',
      format('El caso de %s pasó a %s', coalesce(v_cliente, 'un cliente'), coalesce(v_nombre, 'otra persona de postventa')),
      'Lo está gestionando ahora. Usted lo sigue viendo en Atenciones → Casos anteriores.',
      '/comercial/oportunidades/' || p_op
    );
  end if;
end
$$;

revoke all on function public.caso_postventa_pasa_a(uuid, uuid) from public, anon, authenticated;

-- La misma función de la 0333 (gestiones y cotizaciones nuevas), ahora con la
-- regla completa.
create or replace function public.caso_del_area_pasa_a_quien_lo_gestiona()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- actividades trae realizada_por; cotizaciones, creada_por.
  v_quien uuid := coalesce(to_jsonb(new) ->> 'realizada_por', to_jsonb(new) ->> 'creada_por')::uuid;
begin
  perform caso_postventa_pasa_a(new.oportunidad_id, v_quien);
  return new;
end
$$;

-- Al confirmar: el caso pasa a quien confirmó y queda el seguimiento.
create or replace function public.tg_cotizacion_confirmada_deja_seguimiento()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_sig date := v_hoy + 1;
begin
  if new.enviada_at is null or old.enviada_at is not null or auth.uid() is null then
    return new;
  end if;
  if extract(dow from v_sig) = 0 then v_sig := v_sig + 1; end if;

  perform caso_postventa_pasa_a(new.oportunidad_id, auth.uid());

  update oportunidades
     set proxima_accion      = 'Hacer seguimiento de la cotización ' || coalesce(new.codigo, ''),
         proxima_accion_at   = v_sig,
         proxima_accion_hora = null,
         updated_at          = now()
   where id = new.oportunidad_id
     and (proxima_accion_at is null or proxima_accion_at < v_hoy)
     and etapa not in ('venta', 'derivada', 'historico');
  return new;
end
$$;

drop trigger if exists zy_cotizacion_confirmada_seguimiento on public.cotizaciones;
create trigger zy_cotizacion_confirmada_seguimiento
  after update of enviada_at on public.cotizaciones
  for each row execute function public.tg_cotizacion_confirmada_deja_seguimiento();
