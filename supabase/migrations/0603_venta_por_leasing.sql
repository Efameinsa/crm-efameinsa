-- VENTA POR LEASING (Santos, 24-10; caso AQU ANQA S.A.C. con el BanBif).
-- Tres papeles con un solo expediente:
--   · el BANCO financia: el cierre y la factura salen a su nombre;
--   · el CLIENTE FINAL (la ficha) recibe y usa el equipo: el pedido, el despacho,
--     la agenda del almacén y la ficha del equipo van a su nombre;
--   · la GUÍA DE REMISIÓN sale por defecto al cliente final; postventa puede
--     cambiarla al banco en la apertura de despacho.
-- Hasta hoy el pedido copiaba «RUC - razón social» del facturado a cliente_texto,
-- y TODO lo de abajo lee cliente_texto: el pedido de AQU ANQA le decía al almacén
-- «BANCO INTERAMERICANO DE FINANZAS» y el equipo salió con ese nombre en la ficha.
--
-- Los bancos van en un catálogo propio (entidades_financieras), no como fichas
-- de cliente: así no entran en carteras, derivaciones ni seguimientos, y cada
-- banco aparece una sola vez para listar los leasing por banco.

create table if not exists public.entidades_financieras (
  ruc          text primary key check (ruc ~ '^\d{11}$'),
  razon_social text not null,
  direccion    text,
  creado_por   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
alter table public.entidades_financieras enable row level security;
drop policy if exists entidades_financieras_ver on public.entidades_financieras;
create policy entidades_financieras_ver on public.entidades_financieras for select to authenticated using (true);
grant select on public.entidades_financieras to authenticated;
grant all on public.entidades_financieras to service_role;

insert into public.entidades_financieras (ruc, razon_social, direccion) values
  ('20101036813', 'BANCO INTERAMERICANO DE FINANZAS', 'AV. RICARDO RIVERA NAVARRETE NRO. 600 LIMA - LIMA - SAN ISIDRO')
on conflict (ruc) do nothing;

alter table public.informes_cierre
  add column if not exists leasing boolean not null default false,
  add column if not exists entidad_financiera_ruc text references public.entidades_financieras(ruc);

alter table public.servicios_postventa
  add column if not exists leasing boolean not null default false,
  add column if not exists factura_a_texto text,
  add column if not exists guia_a_nombre_de text not null default 'cliente';
alter table public.servicios_postventa drop constraint if exists servicios_postventa_guia_a_nombre_de_check;
alter table public.servicios_postventa add constraint servicios_postventa_guia_a_nombre_de_check check (guia_a_nombre_de in ('cliente', 'banco'));

comment on column public.informes_cierre.leasing is 'Venta por leasing (0603): cliente_nombre/doc es el banco que factura; cuenta_id es el cliente final.';
comment on column public.servicios_postventa.factura_a_texto is 'Leasing (0603): «RUC - razón social» del banco que factura. cliente_texto es el cliente final.';
comment on column public.servicios_postventa.guia_a_nombre_de is 'Leasing (0603): a nombre de quién sale la guía de remisión: cliente (final) o banco.';

-- El cierre de leasing: el RUC facturado ES el banco. Se registra en el
-- catálogo (o se reutiliza) y queda enlazado. Sin leasing, el enlace se borra.
create or replace function public.cierre_leasing_registra_banco()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.leasing then
    if coalesce(btrim(new.cliente_doc), '') !~ '^\d{11}$' then
      raise exception 'En una venta por leasing se factura al banco: escriba su RUC (11 dígitos)';
    end if;
    insert into entidades_financieras (ruc, razon_social, direccion)
    values (btrim(new.cliente_doc), btrim(new.cliente_nombre), nullif(btrim(coalesce(new.cliente_direccion, '')), ''))
    on conflict (ruc) do nothing;
    new.entidad_financiera_ruc := btrim(new.cliente_doc);
  else
    new.entidad_financiera_ruc := null;
  end if;
  return new;
end $$;

drop trigger if exists cierre_leasing_registra_banco on public.informes_cierre;
create trigger cierre_leasing_registra_banco
  before insert or update of leasing, cliente_doc, cliente_nombre on public.informes_cierre
  for each row execute function public.cierre_leasing_registra_banco();

-- El pedido que nace de un cierre de leasing va a nombre del cliente final.
create or replace function public.pedido_de_leasing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v record;
begin
  if new.informe_cierre_id is null then return new; end if;
  select i.leasing, i.cliente_doc, i.cliente_nombre, c.num_doc, c.razon_social
    into v
    from informes_cierre i join cuentas c on c.id = i.cuenta_id
   where i.id = new.informe_cierre_id;
  if coalesce(v.leasing, false) then
    new.leasing := true;
    new.factura_a_texto := coalesce(nullif(btrim(v.cliente_doc), '') || ' - ', '') || v.cliente_nombre;
    new.cliente_texto := coalesce(nullif(btrim(v.num_doc), '') || ' - ', '') || v.razon_social;
  end if;
  return new;
end $$;

drop trigger if exists pedido_de_leasing on public.servicios_postventa;
create trigger pedido_de_leasing
  before insert on public.servicios_postventa
  for each row execute function public.pedido_de_leasing();

-- Si el cierre se corrige (se marca o se quita el leasing, o cambia el banco),
-- el pedido sin cerrar lo sigue.
create or replace function public.leasing_del_cierre_al_pedido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cliente text;
begin
  if not (new.leasing or old.leasing) then return new; end if;
  if new.leasing is not distinct from old.leasing
     and new.cliente_doc is not distinct from old.cliente_doc
     and new.cliente_nombre is not distinct from old.cliente_nombre then
    return new;
  end if;
  select coalesce(nullif(btrim(num_doc), '') || ' - ', '') || razon_social into v_cliente from cuentas where id = new.cuenta_id;
  update servicios_postventa
     set leasing = new.leasing,
         factura_a_texto = case when new.leasing then coalesce(nullif(btrim(new.cliente_doc), '') || ' - ', '') || new.cliente_nombre end,
         cliente_texto = case when new.leasing then v_cliente
                              else coalesce(nullif(btrim(new.cliente_doc), '') || ' - ', '') || new.cliente_nombre end,
         guia_a_nombre_de = case when new.leasing then guia_a_nombre_de else 'cliente' end
   where informe_cierre_id = new.id and cerrado_at is null;
  return new;
end $$;

drop trigger if exists leasing_del_cierre_al_pedido on public.informes_cierre;
create trigger leasing_del_cierre_al_pedido
  after update of leasing, cliente_doc, cliente_nombre on public.informes_cierre
  for each row execute function public.leasing_del_cierre_al_pedido();

-- Postventa elige en la apertura a nombre de quién sale la guía.
create or replace function public.elegir_guia_a_nombre_de(p_servicio uuid, p_a_nombre_de text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_s record;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not (coalesce(puede_postventa(), false) or coalesce(es_backoffice(), false) or rol_actual() = 'central') then
    raise exception 'Solo postventa o Central eligen a nombre de quién sale la guía';
  end if;
  if p_a_nombre_de not in ('cliente', 'banco') then raise exception 'La guía sale al cliente final o al banco'; end if;
  select id, leasing, despachado_at, guia into v_s from servicios_postventa where id = p_servicio for update;
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  if not v_s.leasing then raise exception 'Este pedido no es por leasing: la guía sale al cliente'; end if;
  if v_s.despachado_at is not null or v_s.guia is not null then
    raise exception 'La guía ya se emitió: ya no se cambia a nombre de quién sale';
  end if;
  update servicios_postventa set guia_a_nombre_de = p_a_nombre_de where id = p_servicio;
end $$;

revoke all on function public.elegir_guia_a_nombre_de(uuid, text) from public, anon;
grant execute on function public.elegir_guia_a_nombre_de(uuid, text) to authenticated, service_role;

-- corregir_informe_emitido acepta «leasing» (el resto, igual que en la base).
CREATE OR REPLACE FUNCTION public.corregir_informe_emitido(p_informe uuid, p_cambios jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_quien    uuid := auth.uid();
  v_permiso  correcciones_informe;
  v_inf      informes_cierre;
  v_items    jsonb;
  v_monto    numeric;
  v_sin_igv  numeric;
  v_venta    ventas;
  v_k        text;
  v_tipo     text;
  v_permitidas text[] := array[
    'cliente_nombre','cliente_doc','cliente_direccion','cliente_correo',
    'referencia','asunto','presupuesto_ref','orden_compra','cliente_nuevo','urgente',
    'modalidad_pago','forma_pago','numero_operacion','tipo_cambio','comprobante','nota_condiciones',
    'entrega_fecha','entrega_hora','entrega_lugar','entrega_direccion','nota_despacho',
    'contacto_venta','contacto_contabilidad','contacto_despacho',
    'items','incluye','gratis','garantia','nota_final',
    -- 0436: qué se vende ("" = según los renglones).
    'tipo_pedido',
    -- 0603: venta por leasing (el banco factura; la ficha es el cliente final).
    'leasing'
  ];
begin
  if v_quien is null then raise exception 'Sesión no válida'; end if;

  select * into v_permiso
    from correcciones_informe
   where informe_id = p_informe and solicitante_id = v_quien
     and guardada_at is null and expira_at > now()
   order by abierta_at desc limit 1;
  if not found then
    raise exception 'La autorización para corregir este cierre venció o no se pidió. Toque «Editar» y pida un código nuevo a operaciones o gerencia.';
  end if;

  select * into v_inf from informes_cierre where id = p_informe;
  if not found then raise exception 'Ese cierre no existe'; end if;
  if v_inf.emitido_at is null then raise exception 'Ese cierre es un borrador: se edita directo, sin código'; end if;
  if v_inf.anulado_at is not null then raise exception 'El cierre % está anulado y no se corrige', v_inf.codigo; end if;

  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' or p_cambios = '{}'::jsonb then
    raise exception 'No llegó ningún cambio';
  end if;
  for v_k in select jsonb_object_keys(p_cambios) loop
    if not (v_k = any (v_permitidas)) then
      raise exception 'El campo «%» no se corrige por esta vía', v_k;
    end if;
  end loop;

  v_items := coalesce(p_cambios->'items', v_inf.items);
  if jsonb_typeof(v_items) <> 'array'
     or (select count(*) from jsonb_array_elements(v_items) e where coalesce(e->>'bloque', 'venta') <> 'gratuito') = 0 then
    raise exception 'El cierre necesita al menos un equipo con precio';
  end if;

  insert into informes_cierre_versiones (informe_id, version, datos, motivo, corregido_por, autorizo)
  values (p_informe, v_inf.version, to_jsonb(v_inf), v_permiso.motivo, v_quien, v_permiso.autorizo);

  v_sin_igv := importe_informe_sin_igv(v_items);
  v_monto   := importe_informe_con_igv(v_items);

  perform set_config('app.corrigiendo_cierre', 'si', true);
  perform set_config('app.expediente_autorizado', 'si', true);
  update informes_cierre set
    cliente_nombre        = coalesce(p_cambios->>'cliente_nombre', cliente_nombre),
    cliente_doc           = case when p_cambios ? 'cliente_doc' then nullif(p_cambios->>'cliente_doc', '') else cliente_doc end,
    cliente_direccion     = case when p_cambios ? 'cliente_direccion' then nullif(p_cambios->>'cliente_direccion', '') else cliente_direccion end,
    cliente_correo        = case when p_cambios ? 'cliente_correo' then nullif(p_cambios->>'cliente_correo', '') else cliente_correo end,
    referencia            = case when p_cambios ? 'referencia' then nullif(p_cambios->>'referencia', '') else referencia end,
    asunto                = coalesce(nullif(p_cambios->>'asunto', ''), asunto),
    presupuesto_ref       = case when p_cambios ? 'presupuesto_ref' then nullif(p_cambios->>'presupuesto_ref', '') else presupuesto_ref end,
    orden_compra          = case when p_cambios ? 'orden_compra' then nullif(p_cambios->>'orden_compra', '') else orden_compra end,
    cliente_nuevo         = coalesce((p_cambios->>'cliente_nuevo')::boolean, cliente_nuevo),
    urgente               = coalesce((p_cambios->>'urgente')::boolean, urgente),
    modalidad_pago        = case when p_cambios ? 'modalidad_pago'
                              then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_cambios->'modalidad_pago') x where trim(x) <> '')
                              else modalidad_pago end,
    forma_pago            = case when p_cambios ? 'forma_pago' then nullif(p_cambios->>'forma_pago', '')::forma_pago_informe else forma_pago end,
    numero_operacion      = case when p_cambios ? 'numero_operacion' then nullif(trim(p_cambios->>'numero_operacion'), '') else numero_operacion end,
    -- 0498: soles por dólar; acepta coma decimal. "" lo borra.
    tipo_cambio           = case when p_cambios ? 'tipo_cambio'
                              then nullif(replace(trim(p_cambios->>'tipo_cambio'), ',', '.'), '')::numeric
                              else tipo_cambio end,
    comprobante           = case when p_cambios ? 'comprobante' then nullif(p_cambios->>'comprobante', '')::comprobante_venta else comprobante end,
    nota_condiciones      = case when p_cambios ? 'nota_condiciones' then nullif(p_cambios->>'nota_condiciones', '') else nota_condiciones end,
    entrega_fecha         = case when p_cambios ? 'entrega_fecha' then nullif(p_cambios->>'entrega_fecha', '') else entrega_fecha end,
    entrega_hora          = case when p_cambios ? 'entrega_hora' then nullif(p_cambios->>'entrega_hora', '') else entrega_hora end,
    entrega_lugar         = case when p_cambios ? 'entrega_lugar' then nullif(p_cambios->>'entrega_lugar', '') else entrega_lugar end,
    entrega_direccion     = case when p_cambios ? 'entrega_direccion' then nullif(p_cambios->>'entrega_direccion', '') else entrega_direccion end,
    nota_despacho         = case when p_cambios ? 'nota_despacho' then nullif(p_cambios->>'nota_despacho', '') else nota_despacho end,
    contacto_venta        = coalesce(p_cambios->'contacto_venta', contacto_venta),
    contacto_contabilidad = coalesce(p_cambios->'contacto_contabilidad', contacto_contabilidad),
    contacto_despacho     = coalesce(p_cambios->'contacto_despacho', contacto_despacho),
    items                 = v_items,
    incluye               = case when p_cambios ? 'incluye'
                              then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p_cambios->'incluye') x where trim(x) <> '')
                              else incluye end,
    gratis                = case when p_cambios ? 'gratis' then nullif(p_cambios->>'gratis', '') else gratis end,
    garantia              = case when p_cambios ? 'garantia' then nullif(p_cambios->>'garantia', '') else garantia end,
    nota_final            = case when p_cambios ? 'nota_final' then nullif(p_cambios->>'nota_final', '') else nota_final end,
    tipo_pedido           = case when p_cambios ? 'tipo_pedido' then nullif(p_cambios->>'tipo_pedido', '') else tipo_pedido end,
    leasing               = coalesce((p_cambios->>'leasing')::boolean, leasing),
    monto_total           = v_monto,
    version               = version + 1,
    corregido_at          = now(),
    corregido_por         = v_quien
  where id = p_informe;

  if v_inf.venta_id is not null and v_monto <> v_inf.monto_total then
    select * into v_venta from ventas where id = v_inf.venta_id;
    if found and v_venta.monto_total <> v_sin_igv then
      update ventas
         set monto_total = v_sin_igv,
             notas = concat_ws(E'\n', notas, format(
               'El informe %s se corrigió (versión %s): la venta pasa de %s %s a %s %s.',
               coalesce(v_inf.codigo, '(sin código)'), v_inf.version + 1,
               v_venta.moneda, to_char(v_venta.monto_total, 'FM999G999G990D00'),
               v_venta.moneda, to_char(v_sin_igv, 'FM999G999G990D00')))
       where id = v_venta.id;
    end if;
  end if;

  -- 0582: el pedido sin cerrar que tenía el total anterior toma el nuevo.
  if v_monto <> v_inf.monto_total then
    update servicios_postventa
       set monto         = v_monto,
           observaciones = concat_ws(chr(10), observaciones, format(
             'El cierre %s se corrigió (versión %s): el total del pedido pasa de %s a %s (con IGV).',
             coalesce(v_inf.codigo, ''), v_inf.version + 1,
             to_char(monto, 'FM999G999G990D00'), to_char(v_monto, 'FM999G999G990D00')))
     where informe_cierre_id = p_informe
       and cerrado_at is null
       and monto = v_inf.monto_total;
  end if;

  -- 0436: si el comercial cambió qué se vende y el pedido ya está en
  -- postventa sin cerrar, el circuito del pedido cambia también (Rubí, 12-10).
  if p_cambios ? 'tipo_pedido' then
    v_tipo := coalesce(nullif(p_cambios->>'tipo_pedido', ''), tipo_pedido_del_informe(v_items));
    update servicios_postventa
       set tipo_pedido     = v_tipo,
           entrega_en      = case when v_tipo in ('repuesto', 'accesorio') and tipo_pedido in ('repuesto', 'accesorio') then entrega_en end,
           con_instalacion = case when v_tipo = 'repuesto' and tipo_pedido = 'repuesto' then con_instalacion
                                  when v_tipo = 'accesorio' then false end,
           tipo_servicio   = case v_tipo when 'mantenimiento' then 'MANTENIMIENTO' when 'revision' then 'REVISIÓN'
                                         when 'embalaje' then 'EMBALAJE' else 'ENTREGA DE EQUIPO' end,
           observaciones   = concat_ws(chr(10), observaciones,
             format('El comercial corrigió el cierre %s: se vendió %s.', coalesce(v_inf.codigo, ''),
               case v_tipo when 'equipo' then 'un equipo' when 'repuesto' then 'un repuesto' when 'accesorio' then 'un accesorio'
                           when 'mantenimiento' then 'un mantenimiento' when 'revision' then 'un servicio de revisión'
                           else 'un servicio de embalaje' end))
     where informe_cierre_id = p_informe
       and cerrado_at is null
       and tipo_pedido is distinct from v_tipo;
  end if;

  update correcciones_informe set guardada_at = now() where id = v_permiso.id;

  return (select to_jsonb(i) from informes_cierre i where i.id = p_informe);
end;
$function$;

-- AQU ANQA S.A.C. (cierre EFAMEINSA 015-2026, BanBif): primer leasing con la estructura nueva.
select set_config('app.corrigiendo_cierre', 'si', true);
update public.informes_cierre set leasing = true where id = '47ee70ef-c25d-4c3f-b4c5-9055324bffc8';
