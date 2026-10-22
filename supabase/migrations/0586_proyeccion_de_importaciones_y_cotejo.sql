-- ============================================================
-- CRM EFAMEINSA · Migración 0586 · Lo que está por llegar, y el cotejo del catálogo
-- ============================================================
-- Reunión Carlos–Santos–Lesly 22-10-2026 (10:29), dos cosas más:
--
-- 1. PROYECCIÓN. «Yo como comercial siempre estoy pidiendo: quiero ver la
--    proyección de lo que está llegando… un contenedor de 40 pies con 20
--    equipos, llega en 15 días. Entonces ya sé que puedo vender ese equipo.
--    Proyectado, con fecha. Que no se sume a los totales, pero que se vea que
--    está llegando». El comercial «tiene que vender lo que no hay».
--
-- 2. COTEJO. Carlos: «¿ya se actualizó el stock que había en el CRM con esto?
--    — No, todavía no se ha hecho el contraste». El catálogo venía mostrando
--    la cifra «(ref.)» del maestro de agosto. Cuando Lesly sube el Excel al
--    almacén, los equipos que no vinieron en él dejan de mostrar esa cifra
--    vieja: el stock pasa a ser lo que el almacén cuenta por serie.

create table if not exists stock_proyectado (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid references productos(id) on delete set null,
  codigo         text,
  descripcion    text not null,
  cantidad       int  not null check (cantidad > 0),
  fecha_estimada date,
  proveedor      text,
  referencia     text,
  nota           text,
  estado         text not null default 'en_camino' check (estado in ('en_camino', 'llego', 'cancelada')),
  llego_at       timestamptz,
  creado_por     uuid references perfiles(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  es_prueba      boolean not null default es_cuenta_prueba()
);
comment on table stock_proyectado is
  'Equipos que Importaciones tiene por llegar (0586, Carlos 22-10): el comercial los ve como proyección, con fecha, sin que sumen al stock.';

drop trigger if exists trg_stock_proyectado_updated on stock_proyectado;
create trigger trg_stock_proyectado_updated before update on stock_proyectado
  for each row execute function set_updated_at();

alter table stock_proyectado enable row level security;
drop policy if exists stock_proyectado_lectura on stock_proyectado;
create policy stock_proyectado_lectura on stock_proyectado for select to authenticated
  using (es_prueba = (select es_cuenta_prueba()));
drop policy if exists stock_proyectado_escribe on stock_proyectado;
create policy stock_proyectado_escribe on stock_proyectado for all to authenticated
  using ((select es_operaciones()) or (select es_backoffice()))
  with check ((select es_operaciones()) or (select es_backoffice()));
revoke all on stock_proyectado from anon;
grant select, insert, update, delete on stock_proyectado to authenticated;
grant all on stock_proyectado to service_role;

-- ------------------------------------------------------------
-- El cotejo: después de subir el Excel al almacén, la cifra «(ref.)» del
-- maestro deja de valer para los EQUIPOS que no vinieron. Guarda la anterior.
create or replace function catalogo_cotejar_con_almacen()
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_n int := 0;
  v_disponibles int;
begin
  if not (es_operaciones() or es_backoffice()) then
    raise exception 'El cotejo lo hace operaciones';
  end if;
  select count(*) into v_disponibles from inventario_equipos where estado = 'disponible' and es_prueba = es_cuenta_prueba();
  if v_disponibles = 0 then
    raise exception 'El almacén está vacío: primero suba el Excel de stock y pulse «Subir al almacén»';
  end if;
  -- El catálogo (productos) es uno solo, no tiene copia de prueba: una cuenta de práctica no lo toca.
  if es_cuenta_prueba() then
    return jsonb_build_object('puestos_en_cero', 0, 'disponibles', v_disponibles, 'prueba', true);
  end if;
  update productos p
     set ficha = coalesce(p.ficha, '{}'::jsonb)
                 || jsonb_build_object('stock_referencia_anterior', (p.ficha->>'stock_referencia')::int,
                                       'stock_referencia', 0,
                                       'cotejado_con_almacen_at', now())
   where p.segmento in ('industrial', 'semi_industrial')
     and coalesce((p.ficha->>'stock_referencia')::int, 0) > 0
     and not exists (select 1 from inventario_equipos i where i.producto_id = p.id and i.estado in ('disponible', 'reservado') and i.es_prueba = es_cuenta_prueba())
     -- Lo que vino en un Excel ya subido (con serie o sin ella: mesas, coches) conserva su cifra.
     and not exists (select 1 from stock_cargas c, jsonb_array_elements(c.filas) f
                      where c.estado = 'subida' and c.es_prueba = es_cuenta_prueba()
                        and f->>'decision' = 'subir' and upper(f->>'codigoFinal') = upper(p.sku));
  get diagnostics v_n = row_count;
  return jsonb_build_object('puestos_en_cero', v_n, 'disponibles', v_disponibles);
end $fn$;
revoke all on function catalogo_cotejar_con_almacen() from public;
grant execute on function catalogo_cotejar_con_almacen() to authenticated;
