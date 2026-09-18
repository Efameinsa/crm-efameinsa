-- 18-09-2026: los informes del almacén (Santos, con la lista de Lesly).
--
-- Prueba y embalaje y el despacho siguen siendo solo fotos y check (0246).
-- Lo nuevo son los informes que el almacén ESCRIBE y «sube» a postventa con
-- un check: puesta en marcha (todo ok / con observaciones / con la lista de
-- accesorios y costos que faltan para instalar), soporte técnico por
-- videollamada, y el mantenimiento en planta en tres informes (recepción,
-- prueba y revisión, ejecución). Viven en informes_servicio, que ya tiene el
-- correlativo, las fotos, el formato de Lesly (0242) y la impresión; se les
-- agrega la clase, a qué atención pertenecen (el mtto en planta lleva tres
-- informes por una misma atención) y la lista de materiales.

alter table informes_servicio
  add column if not exists clase_almacen text check (clase_almacen in (
    'puesta_en_marcha_ok', 'puesta_en_marcha_observaciones', 'puesta_en_marcha_accesorios',
    'soporte_videollamada', 'mtto_recepcion', 'mtto_prueba_revision', 'mtto_ejecucion')),
  add column if not exists atencion_id uuid references atenciones(id) on delete set null,
  add column if not exists lista_materiales jsonb not null default '[]'::jsonb,
  add column if not exists elevado_a_postventa_at timestamptz,
  add column if not exists elevado_por uuid references perfiles(id);

comment on column informes_servicio.clase_almacen is 'Qué informe del almacén es (0252); null en los informes de postventa.';
comment on column informes_servicio.lista_materiales is 'Accesorios y materiales que faltan para instalar, con cantidad y costo estimado: [{descripcion, cantidad, costo}] (0252).';
comment on column informes_servicio.elevado_a_postventa_at is 'El check con el que el almacén sube el informe a postventa (0252).';

create index if not exists informes_servicio_atencion_idx on informes_servicio (atencion_id) where atencion_id is not null;
create index if not exists informes_servicio_clase_idx on informes_servicio (clase_almacen) where clase_almacen is not null;

-- El almacén escribe sus informes (hasta hoy solo los leía, 0246). Edita los
-- suyos; los de postventa no los toca.
drop policy if exists informes_serv_almacen_escribe on informes_servicio;
create policy informes_serv_almacen_escribe on informes_servicio for insert to authenticated
  with check (es_almacen() and es_prueba = es_cuenta_prueba() and elaborado_por = auth.uid());
drop policy if exists informes_serv_almacen_edita on informes_servicio;
create policy informes_serv_almacen_edita on informes_servicio for update to authenticated
  using (es_almacen() and es_prueba = es_cuenta_prueba() and elaborado_por = auth.uid())
  with check (es_almacen() and es_prueba = es_cuenta_prueba() and elaborado_por = auth.uid());

-- El check: sube el informe a postventa. Avisa a cada persona de postventa
-- (misma serie: los de práctica no molestan a los reales) y deja la marca.
-- Si es una puesta en marcha con pedido, la fecha queda en el pedido.
create or replace function public.elevar_informe_a_postventa(p_informe uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quien uuid := auth.uid();
  v_inf record;
  v_cliente text;
  v_titulo text;
  v_n int := 0;
  v_p record;
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(es_almacen(), false) or coalesce(es_postventa(), false) or coalesce(es_backoffice(), false)) then
    raise exception 'Solo el almacén o postventa suben informes';
  end if;
  select i.*, c.razon_social into v_inf
    from informes_servicio i left join cuentas c on c.id = i.cuenta_id
   where i.id = p_informe;
  if v_inf.id is null then raise exception 'Ese informe no existe'; end if;
  if v_inf.clase_almacen is null then raise exception 'Ese informe no es del almacén'; end if;
  if v_inf.elevado_a_postventa_at is not null then
    return jsonb_build_object('ya_estaba', true, 'avisados', 0);
  end if;

  update informes_servicio
     set elevado_a_postventa_at = now(), elevado_por = v_quien
   where id = p_informe;

  if v_inf.servicio_id is not null and v_inf.clase_almacen like 'puesta_en_marcha%' then
    update servicios_postventa
       set puesta_en_marcha = coalesce(puesta_en_marcha, (v_inf.ejecutado_at at time zone 'America/Lima')::date)
     where id = v_inf.servicio_id;
  end if;

  v_cliente := coalesce(v_inf.razon_social, v_inf.cliente_texto, 'Cliente sin nombre');
  v_titulo := case v_inf.clase_almacen
    when 'puesta_en_marcha_ok' then 'Puesta en marcha OK: ' || v_cliente
    when 'puesta_en_marcha_observaciones' then 'Puesta en marcha con observaciones: ' || v_cliente
    when 'puesta_en_marcha_accesorios' then 'Puesta en marcha: faltan accesorios para instalar — ' || v_cliente
    when 'soporte_videollamada' then 'Soporte por videollamada: ' || v_cliente
    when 'mtto_recepcion' then 'Mtto en planta · recepción: ' || v_cliente
    when 'mtto_prueba_revision' then 'Mtto en planta · prueba y revisión: ' || v_cliente
    when 'mtto_ejecucion' then 'Mtto en planta · ejecutado: ' || v_cliente
    else 'Informe del almacén: ' || v_cliente end;

  for v_p in
    select p.id from perfiles p
     where p.es_postventa and p.activo and p.es_prueba = coalesce(v_inf.es_prueba, false)
  loop
    perform crear_notificacion(v_p.id, null, 'almacen', v_titulo,
      'El almacén subió el informe ' || coalesce(lpad(v_inf.correlativo::text, 3, '0') || '-' || v_inf.anio, 's/n') || '. Revíselo y cierre la atención si corresponde.',
      '/postventa/informes/' || p_informe);
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('ya_estaba', false, 'avisados', v_n);
end;
$$;
