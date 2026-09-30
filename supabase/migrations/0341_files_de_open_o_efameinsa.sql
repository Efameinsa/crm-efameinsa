-- 0341 · Al pedir un file se marca de qué empresa: OPEN, EFAMEINSA o ambos
--
-- 30-09-2026: cada cliente puede tener archivador en las dos empresas del
-- grupo. «Cuando el comercial, postventa o finanzas solicite el file, que
-- tenga la opción para un check para indicar OPEN o EFAMEINSA o ambos.»
--
-- Una columna por pedido de file. Los pedidos anteriores quedan en null
-- («sin indicar»). La pantalla exige marcar al menos una; la base lo acepta
-- vacío solo para no romper a quien todavía tenga la versión anterior abierta.

alter table public.prestamos_file
  add column if not exists empresa text;

alter table public.prestamos_file drop constraint if exists prestamos_file_empresa_check;
alter table public.prestamos_file
  add constraint prestamos_file_empresa_check check (empresa is null or empresa in ('open', 'efameinsa', 'ambos'));

-- p_empresas va en el mismo orden que p_cuentas: 'open', 'efameinsa' o 'ambos'.
drop function if exists public.files_solicitar(uuid[], text);
create or replace function public.files_solicitar(p_cuentas uuid[], p_nota text default null, p_empresas text[] default null)
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
  if p_empresas is not null then
    if coalesce(array_length(p_empresas, 1), 0) <> array_length(p_cuentas, 1) then
      raise exception 'Marque OPEN, EFAMEINSA o ambos en cada cliente';
    end if;
    if exists (select 1 from unnest(p_empresas) e where e is null or e not in ('open', 'efameinsa', 'ambos')) then
      raise exception 'Marque OPEN, EFAMEINSA o ambos en cada cliente';
    end if;
  end if;

  insert into prestamos_file (grupo, cuenta_id, cliente_texto, cliente_doc, empresa, solicitado_por, nota, es_prueba)
  select v_grupo, c.id, c.razon_social, c.num_doc, p.empresa, v_yo.id, nullif(btrim(coalesce(p_nota, '')), ''), coalesce(v_yo.es_prueba, false)
    from unnest(p_cuentas, coalesce(p_empresas, array_fill(null::text, array[array_length(p_cuentas, 1)]))) as p(cuenta_id, empresa)
    join cuentas c on c.id = p.cuenta_id and c.fusionada_en is null;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Ninguno de esos clientes existe'; end if;

  select string_agg(c.razon_social || coalesce(' (' || case p.empresa when 'open' then 'OPEN' when 'efameinsa' then 'EFAMEINSA' when 'ambos' then 'OPEN y EFAMEINSA' end || ')', ''),
                    ' · ' order by c.razon_social) into v_nombres
    from unnest(p_cuentas, coalesce(p_empresas, array_fill(null::text, array[array_length(p_cuentas, 1)]))) as p(cuenta_id, empresa)
    join cuentas c on c.id = p.cuenta_id;
  -- Una cuenta de práctica no le avisa a Central real (0336).
  if coalesce(v_yo.es_prueba, false) then return v_n; end if;
  perform crear_notificacion(null, 'central', 'otro',
    format('Pedido de %s file%s · %s', v_n, case when v_n = 1 then '' else 's' end, coalesce(v_yo.codigo_comercial || ' ' , '') || v_yo.nombre),
    left(v_nombres, 300) || coalesce(' — ' || nullif(btrim(coalesce(p_nota, '')), ''), ''),
    '/files');
  return v_n;
end $$;

revoke all on function public.files_solicitar(uuid[], text, text[]) from public, anon;
grant execute on function public.files_solicitar(uuid[], text, text[]) to authenticated, service_role;
