-- ============================================================
-- CRM EFAMEINSA · Migración 0246 · El módulo de almacén
-- ============================================================
-- Reunión del 16-09, 17:39 (Carlos y Lesly). Lo que almacén necesita, en sus
-- palabras: «que me lleguen las aperturas, que me lleguen las visitas, me
-- tienen que llegar los reportes técnicos… tengo que ver mis pedidos, el
-- mismo pedido que tengo yo en postventa». Y el circuito de la máquina desde
-- su lado: postventa pide «prueba la máquina» → almacén prueba, sube el
-- protocolo y marca probado y embalado → postventa programa el despacho →
-- almacén confirma que está listo (montacarga) → despacha con 5 fotos
-- (frente, lateral izquierdo, lateral derecho, posterior, arriba) y un video
-- → en la agencia sube la guía y la máquina y marca despachado → postventa
-- da el doble check. Nombre acordado: almacén (no logística).
--
-- Se hace como con postventa y operaciones: una llave en el perfil
-- (`es_almacen`), no un rol nuevo — así ninguna política existente cambia de
-- sentido y lo que almacén puede tocar queda dicho función por función.
-- ============================================================

alter table public.perfiles add column if not exists es_almacen boolean not null default false;
comment on column public.perfiles.es_almacen is 'La cuenta del almacén (0246): ve los pedidos, las atenciones programadas, las visitas y los informes; marca lo suyo del despacho.';

create or replace function public.es_almacen()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select es_almacen from perfiles where id = auth.uid()), false)
$$;

-- ── Lo que almacén registra del pedido ────────────────────────────────────
alter table public.servicios_postventa
  add column if not exists almacen_listo_at timestamptz,
  add column if not exists almacen_listo_por uuid references public.perfiles (id),
  add column if not exists almacen_listo_nota text,
  add column if not exists salida_fotos jsonb not null default '[]'::jsonb,
  add column if not exists salida_nota text,
  add column if not exists agencia_at timestamptz,
  add column if not exists agencia_por uuid references public.perfiles (id),
  add column if not exists agencia_fotos jsonb not null default '[]'::jsonb,
  add column if not exists protocolo_fotos jsonb not null default '[]'::jsonb,
  add column if not exists despacho_verificado_at timestamptz,
  add column if not exists despacho_verificado_por uuid references public.perfiles (id);
comment on column public.servicios_postventa.almacen_listo_at is 'Almacén confirmó que está listo para el despacho programado (0246).';
comment on column public.servicios_postventa.salida_fotos is 'Las 5 fotos y el video de la salida: [{path, nombre, tipo, etiqueta}] (0246).';
comment on column public.servicios_postventa.agencia_at is 'Almacén dejó la máquina en la agencia o en el cliente, con la guía (0246).';
comment on column public.servicios_postventa.despacho_verificado_at is 'Postventa dio el doble check al despacho de almacén (0246).';

-- ── Lectura: lo mismo que ve postventa, sin cifras ────────────────────────
drop policy if exists servicios_pv_almacen on public.servicios_postventa;
create policy servicios_pv_almacen on public.servicios_postventa for select
  using ((select es_almacen()) and es_prueba = (select es_cuenta_prueba()));

drop policy if exists atenciones_almacen on public.atenciones;
create policy atenciones_almacen on public.atenciones for select
  using ((select es_almacen()) and es_prueba = (select es_cuenta_prueba()));

drop policy if exists informes_serv_almacen on public.informes_servicio;
create policy informes_serv_almacen on public.informes_servicio for select
  using ((select es_almacen()) and es_prueba = (select es_cuenta_prueba()));

drop policy if exists equipos_almacen on public.equipos_instalados;
create policy equipos_almacen on public.equipos_instalados for select
  using ((select es_almacen()) and es_prueba = (select es_cuenta_prueba()));

drop policy if exists visitas_planta_select on public.visitas_planta;
create policy visitas_planta_select on public.visitas_planta for select
  using (
    es_prueba = coalesce((select es_cuenta_prueba()), false)
    and (
      registrado_por = (select auth.uid())
      or (select es_backoffice())
      or (select rol_actual()) = 'central'
      or (select puede_postventa())
      or (select es_almacen())
    )
  );

-- Las fichas de cliente, solo para poner nombre y dirección al pedido.
drop policy if exists cuentas_almacen on public.cuentas;
create policy cuentas_almacen on public.cuentas for select
  using ((select es_almacen()));

-- ── Lo que almacén marca, función por función ─────────────────────────────
create or replace function public.almacen_marcar_probado(p_servicio uuid, p_protocolo_ref text, p_fotos jsonb default '[]'::jsonb, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Probado y embalado lo marca el almacén';
  end if;
  update servicios_postventa
     set prueba_lista_at = coalesce(prueba_lista_at, now()),
         prueba_lista_por = coalesce(prueba_lista_por, auth.uid()),
         prueba_embalaje = 'SI',
         protocolo_prueba_ref = coalesce(nullif(btrim(coalesce(p_protocolo_ref, '')), ''), protocolo_prueba_ref),
         protocolo_fotos = coalesce(protocolo_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb),
         observaciones = case when nullif(btrim(coalesce(p_nota, '')), '') is null then observaciones
                              else concat_ws(E'\n', observaciones, format('Almacén, %s: %s', to_char(now() at time zone 'America/Lima', 'DD-MM HH24:MI'), btrim(p_nota))) end,
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

create or replace function public.almacen_confirmar_listo(p_servicio uuid, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'Listo para despachar lo confirma el almacén';
  end if;
  update servicios_postventa
     set almacen_listo_at = coalesce(almacen_listo_at, now()),
         almacen_listo_por = coalesce(almacen_listo_por, auth.uid()),
         almacen_listo_nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), almacen_listo_nota),
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

create or replace function public.almacen_registrar_salida(p_servicio uuid, p_fecha date, p_fotos jsonb, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s servicios_postventa%rowtype;
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La salida la registra el almacén';
  end if;
  select * into v_s from servicios_postventa where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
  -- Sin apertura no sale nada del almacén (Carlos, 09-09); los pedidos
  -- anteriores al circuito, sin cierre en el CRM, siguen como estaban.
  if v_s.informe_cierre_id is not null and v_s.apertura_despacho_at is null then
    raise exception 'Sin apertura de despacho no sale nada del almacén: pídasela a postventa';
  end if;
  if jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)) < 3 then
    raise exception 'La salida se registra con las fotos de la máquina (mínimo 3: frente, lateral y posterior)';
  end if;
  update servicios_postventa
     set despachado_at = coalesce(despachado_at, (coalesce(p_fecha, (now() at time zone 'America/Lima')::date))::timestamptz + interval '12 hours'),
         fecha_despacho = coalesce(fecha_despacho, p_fecha),
         salida_fotos = coalesce(salida_fotos, '[]'::jsonb) || p_fotos,
         salida_nota = coalesce(nullif(btrim(coalesce(p_nota, '')), ''), salida_nota),
         updated_at = now()
   where id = p_servicio;
end $$;

create or replace function public.almacen_registrar_agencia(p_servicio uuid, p_transportista text, p_guia text, p_fotos jsonb, p_recibe text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_almacen(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'La entrega en la agencia la registra el almacén';
  end if;
  if nullif(btrim(coalesce(p_guia, '')), '') is null then
    raise exception 'Falta el número de la guía de remisión: es lo que el cliente necesita para recoger';
  end if;
  update servicios_postventa
     set agencia_at = coalesce(agencia_at, now()),
         agencia_por = coalesce(agencia_por, auth.uid()),
         transportista = coalesce(nullif(btrim(coalesce(p_transportista, '')), ''), transportista),
         guia = btrim(p_guia),
         recibe_nombre = coalesce(nullif(btrim(coalesce(p_recibe, '')), ''), recibe_nombre),
         agencia_fotos = coalesce(agencia_fotos, '[]'::jsonb) || coalesce(p_fotos, '[]'::jsonb),
         despachado_at = coalesce(despachado_at, now()),
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

-- El doble check de postventa sobre lo que despachó almacén.
create or replace function public.verificar_despacho(p_servicio uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(es_postventa(), false) or coalesce(es_backoffice(), false) or coalesce(es_operaciones(), false)) then
    raise exception 'El doble check del despacho lo da postventa';
  end if;
  update servicios_postventa
     set despacho_verificado_at = coalesce(despacho_verificado_at, now()),
         despacho_verificado_por = coalesce(despacho_verificado_por, auth.uid()),
         updated_at = now()
   where id = p_servicio and es_prueba = coalesce(es_cuenta_prueba(), false);
  if not found then raise exception 'Ese pedido no existe'; end if;
end $$;

revoke all on function public.almacen_marcar_probado(uuid, text, jsonb, text) from public;
revoke all on function public.almacen_confirmar_listo(uuid, text) from public;
revoke all on function public.almacen_registrar_salida(uuid, date, jsonb, text) from public;
revoke all on function public.almacen_registrar_agencia(uuid, text, text, jsonb, text) from public;
revoke all on function public.verificar_despacho(uuid) from public;
grant execute on function public.almacen_marcar_probado(uuid, text, jsonb, text) to authenticated;
grant execute on function public.almacen_confirmar_listo(uuid, text) to authenticated;
grant execute on function public.almacen_registrar_salida(uuid, date, jsonb, text) to authenticated;
grant execute on function public.almacen_registrar_agencia(uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.verificar_despacho(uuid) to authenticated;
