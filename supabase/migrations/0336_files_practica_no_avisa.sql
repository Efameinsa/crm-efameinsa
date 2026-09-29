-- 0336 · Un pedido de files desde una cuenta de práctica no avisa a Central
--
-- 29-09-2026: al probar la pantalla con la cuenta de práctica de postventa, el
-- aviso «Pedido de 2 files» les llegó a las cuentas reales de Central.

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
  -- Una cuenta de práctica no le avisa a Central real (29-09: la prueba de la
  -- pantalla les dejó dos avisos).
  if coalesce(v_yo.es_prueba, false) then return v_n; end if;
  perform crear_notificacion(null, 'central', 'otro',
    format('Pedido de %s file%s · %s', v_n, case when v_n = 1 then '' else 's' end, coalesce(v_yo.codigo_comercial || ' ' , '') || v_yo.nombre),
    left(v_nombres, 300) || coalesce(' — ' || nullif(btrim(coalesce(p_nota, '')), ''), ''),
    '/files');
  return v_n;
end $$;
