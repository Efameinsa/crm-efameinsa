-- 0335 · El pedido de file guarda el nombre del cliente
--
-- 29-09-2026, prueba de la pantalla de files (0334): quien pide el file de un
-- cliente que no es de su cartera no puede leer esa ficha, y el pedido salía
-- como «Cliente» sin nombre. Como en el cuaderno de cargos, el nombre y el
-- documento se anotan en el pedido al hacerlo.

alter table public.prestamos_file
  add column if not exists cliente_texto text,
  add column if not exists cliente_doc text;

update public.prestamos_file p
   set cliente_texto = c.razon_social, cliente_doc = c.num_doc
  from public.cuentas c
 where c.id = p.cuenta_id and p.cliente_texto is null;

create or replace function public.files_solicitar(p_cuentas uuid[], p_nota text default null)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo perfiles%rowtype;
  v_grupo uuid := gen_random_uuid();
  v_n integer;
  v_nombres text;
begin
  select * into v_yo from perfiles where id = auth.uid() and activo;
  if v_yo.id is null then raise exception 'Sesión no válida'; end if;
  if coalesce(array_length(p_cuentas, 1), 0) = 0 then raise exception 'Agregue al menos un cliente'; end if;
  if array_length(p_cuentas, 1) > 20 then raise exception 'Máximo 20 files por pedido'; end if;

  insert into prestamos_file (grupo, cuenta_id, cliente_texto, cliente_doc, solicitado_por, nota, es_prueba)
  select v_grupo, c.id, c.razon_social, c.num_doc, v_yo.id, nullif(btrim(coalesce(p_nota, '')), ''), coalesce(v_yo.es_prueba, false)
    from cuentas c where c.id = any (p_cuentas) and c.fusionada_en is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Ninguno de esos clientes existe'; end if;

  select string_agg(c.razon_social, ' · ' order by c.razon_social) into v_nombres
    from cuentas c where c.id = any (p_cuentas);
  perform crear_notificacion(null, 'central', 'otro',
    format('Pedido de %s file%s · %s', v_n, case when v_n = 1 then '' else 's' end, coalesce(v_yo.codigo_comercial || ' ' , '') || v_yo.nombre),
    left(v_nombres, 300) || coalesce(' — ' || nullif(btrim(coalesce(p_nota, '')), ''), ''),
    '/files');
  return v_n;
end $$;
