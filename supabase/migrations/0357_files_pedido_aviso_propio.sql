-- 0357 · El pedido de files le llega a Central como aviso propio, con campanada
--
-- 30-09-2026, Central: «¿se llegó a poner la notificación…? campanita, alarma,
-- ventana emergente». El pedido ya avisaba (0334), pero como tipo 'otro':
-- «Aviso nuevo», pitido corto y 8 segundos en pantalla, igual que cualquier
-- aviso informativo. Ahora sale como 'file_pedido' («Piden files») y la
-- pantalla le da campanada y más tiempo, como a lo que exige hacer algo.
--
-- Además, desde una cuenta de práctica ahora avisa a la Central de práctica
-- (antes a nadie), igual que «Terminé» (0350).
--
-- Misma firma que 0341: solo cambia el aviso.

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
  -- Le llega a cada cuenta de Central con su propio tipo (antes 'otro', que
  -- salía como «Aviso nuevo» y un pitido corto). Una cuenta de práctica no le
  -- avisa a Central real (0336), pero sí a la Central de práctica, como
  -- «Terminé» (0350), para poder probar el circuito completo.
  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  select id, 'file_pedido',
         format('Pedido de %s file%s · %s', v_n, case when v_n = 1 then '' else 's' end, coalesce(v_yo.codigo_comercial || ' ' , '') || v_yo.nombre),
         left(v_nombres, 300) || coalesce(' — ' || nullif(btrim(coalesce(p_nota, '')), ''), ''),
         '/files'
    from perfiles
   where rol = 'central' and activo and coalesce(es_prueba, false) = coalesce(v_yo.es_prueba, false);
  return v_n;
end $$;

revoke all on function public.files_solicitar(uuid[], text, text[]) from public, anon;
grant execute on function public.files_solicitar(uuid[], text, text[]) to authenticated, service_role;
