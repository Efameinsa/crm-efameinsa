-- ============================================================
-- CRM EFAMEINSA · Migración 0600 · El almacén lleva su stock
-- ============================================================
-- 23-10-2026 18:25, Santos y Lesly: «ya no vamos a trabajar desde el Excel… esto
-- debería estar en el módulo de almacén, porque almacén es el que va a trabajar el
-- stock». Hasta hoy solo operaciones cargaba y movía máquinas (0117). Ahora también
-- la cuenta del almacén: agrega lo que llega (con empresa, ubicación y fecha de
-- ingreso) y puede darla de baja o devolverla a disponible. El costo sigue siendo
-- solo de operaciones y gerencia (inventario_costos, 0596): esto no lo toca.

drop function if exists public.cargar_series_inventario(uuid, text[], text, text);

create or replace function public.cargar_series_inventario(
  p_producto uuid,
  p_series text[],
  p_ubicacion text default null,
  p_nota text default null,
  p_empresa text default null,
  p_ingreso date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_serie text;
  v_limpia text;
  v_cargadas int := 0;
  v_repetidas text[] := '{}';
  v_invalidas text[] := '{}';
  v_empresa text := nullif(upper(btrim(coalesce(p_empresa, ''))), '');
begin
  if not (es_operaciones() or es_backoffice() or es_almacen()) then
    raise exception 'El stock lo cargan el almacén u operaciones';
  end if;
  if not exists (select 1 from productos where id = p_producto) then
    raise exception 'Ese equipo no está en el catálogo';
  end if;
  if v_empresa is not null and v_empresa not in ('OPEN', 'EFAMEINSA') then
    raise exception 'La empresa es Open o Efameinsa';
  end if;

  foreach v_serie in array coalesce(p_series, '{}') loop
    v_limpia := upper(btrim(v_serie));
    -- Una serie sin ningún dígito casi siempre es basura pegada del Excel (un
    -- encabezado, un «S/N»): se aparta en vez de ensuciar el almacén.
    if v_limpia = '' then
      continue;
    elsif v_limpia !~ '[0-9]' then
      v_invalidas := v_invalidas || v_limpia;
    elsif exists (select 1 from inventario_equipos i
                   where upper(i.serie) = v_limpia and i.estado <> 'baja'
                     and i.es_prueba = coalesce(es_cuenta_prueba(), false)
                     and (v_limpia !~ '^\d{1,3}$' or i.producto_id = p_producto)) then
      v_repetidas := v_repetidas || v_limpia;
    else
      insert into inventario_equipos (producto_id, serie, ubicacion, nota, empresa, ingreso_at, creado_por, es_prueba)
      values (p_producto, v_limpia, nullif(btrim(coalesce(p_ubicacion, '')), ''), p_nota, v_empresa,
              coalesce(p_ingreso, (now() at time zone 'America/Lima')::date), auth.uid(), coalesce(es_cuenta_prueba(), false));
      v_cargadas := v_cargadas + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'cargadas', v_cargadas,
    'repetidas', to_jsonb(v_repetidas),
    'invalidas', to_jsonb(v_invalidas)
  );
end;
$function$;

revoke all on function public.cargar_series_inventario(uuid, text[], text, text, text, date) from public;
grant execute on function public.cargar_series_inventario(uuid, text[], text, text, text, date) to authenticated;

-- Mover una máquina (baja, devolver a disponible): también el almacén.
do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.proname = 'mover_equipo_inventario';
  v_def := replace(v_def, 'if not (es_operaciones() or es_backoffice()) then', 'if not (es_operaciones() or es_backoffice() or es_almacen()) then');
  v_def := replace(v_def, '''El inventario lo mueve operaciones''', '''El stock lo mueven el almacén u operaciones''');
  execute v_def;
end $$;
