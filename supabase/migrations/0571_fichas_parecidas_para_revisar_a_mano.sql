-- 0571 · Fichas parecidas para revisar a mano (el mismo cliente registrado distinto)
--
-- Reunión de gerencia del 20-10-2026 15:45. Santos: «yo tengo un Excel gigante
-- con los duplicados… algunos tienen poca coincidencia, 30 %… tienen que verlo
-- ustedes». Santos, 21-10: «no creaste algo para poder contrastarlo
-- manualmente? para poder juntar fichas de clientes que sean lo mismo pero los
-- han registrado diferente».
--
-- «Fichas repetidas» (0556/0569) solo junta el nombre idéntico o el mismo
-- documento. Aquí van las parejas PARECIDAS, con su porcentaje y el porqué:
--   · el nombre se parece (trigramas: «QUISPE GIL THOMY VICENTE» y «TOMY
--     VICENTE QUISPE GIL»),
--   · el nombre de una está casi entero dentro del de la otra,
--   · comparten un teléfono o un correo (que no esté en más de 3 fichas: los
--     números de la empresa o de un comercial no cuentan).
-- No se une nada solo: una persona compara las dos fichas lado a lado y decide
-- «Unir» o «No son el mismo». Dos fichas con documentos distintos (dos RUC, dos
-- DNI) no se proponen: son clientes distintos aunque se llamen parecido.
--
-- Es pesado (≈30 s), así que se guarda en una tabla y se recalcula cada noche
-- (timer de la VM, psql directo: por la API la base corta a los 8 s).

create table if not exists public.fichas_parecidas (
  cuenta_a uuid not null references public.cuentas(id) on delete cascade,
  cuenta_b uuid not null references public.cuentas(id) on delete cascade,
  porcentaje int not null,
  motivos text[] not null default '{}',
  calculado_at timestamptz not null default now(),
  primary key (cuenta_a, cuenta_b),
  check (cuenta_a < cuenta_b)
);
comment on table public.fichas_parecidas is '0571: parejas de fichas que podrían ser el mismo cliente, para revisarlas a mano (Santos 21-10).';
alter table public.fichas_parecidas enable row level security;
grant all on public.fichas_parecidas to service_role;

create or replace function public.puede_unir_fichas()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(rol_actual()::text, '') in ('central', 'operaciones', 'gerencia', 'admin')
      or coalesce((select p.es_operaciones from perfiles p where p.id = auth.uid()), false)
      or coalesce(edita_clientes_global(), false)
$$;
grant execute on function public.puede_unir_fichas() to authenticated;

create or replace function public.recalcular_fichas_parecidas()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  v_n int;
begin
  if auth.uid() is not null and not puede_unir_fichas() then
    raise exception 'Esto lo usan Central, operaciones y gerencia';
  end if;
  perform set_config('statement_timeout', '180s', true);
  perform set_limit(0.45);
  perform set_config('pg_trgm.word_similarity_threshold', '0.9', true);

  create temp table _b on commit drop as
  select c.id, c.num_doc, nombre_normalizado(c.razon_social) n,
         exists (select 1 from oportunidades o where o.cuenta_id = c.id)
      or exists (select 1 from servicios_postventa s where s.cuenta_id = c.id) as mov
    from cuentas c
   where c.fusionada_en is null and c.archivada_at is null and c.cuenta_padre_id is null
     and length(nombre_normalizado(c.razon_social)) >= 5;
  create index on _b using gin (n gin_trgm_ops);
  create index on _b (id);
  analyze _b;

  create temp table _p (a uuid, b uuid, pct int, motivo text) on commit drop;

  -- 1. El nombre se parece.
  insert into _p
  select least(a.id, x.id), greatest(a.id, x.id), round(similarity(a.n, x.n) * 100)::int, 'nombre parecido'
    from _b a
    join lateral (select x.id, x.n, x.mov from _b x where x.n % a.n and x.id <> a.id order by x.n <-> a.n limit 5) x on true
   where a.mov and (not x.mov or a.id < x.id);

  -- 2. El nombre de una está casi entero dentro del de la otra.
  insert into _p
  select least(a.id, x.id), greatest(a.id, x.id), round(word_similarity(a.n, x.n) * 80)::int, 'un nombre está dentro del otro'
    from _b a
    join lateral (select x.id, x.n from _b x where a.n <% x.n and x.id <> a.id order by a.n <<-> x.n limit 3) x on true
   where a.mov and array_length(regexp_split_to_array(a.n, ' '), 1) between 2 and 5;

  -- 3. El mismo teléfono (que no esté en más de 3 fichas).
  insert into _p
  select distinct least(c1.cuenta_id, c2.cuenta_id), greatest(c1.cuenta_id, c2.cuenta_id), 70, 'mismo teléfono'
    from contactos c1
    join contactos c2 on c2.telefono_normalizado = c1.telefono_normalizado and c2.cuenta_id <> c1.cuenta_id
   where length(c1.telefono_normalizado) >= 9
     and c1.cuenta_id in (select id from _b) and c2.cuenta_id in (select id from _b)
     and (select count(distinct x.cuenta_id) from contactos x where x.telefono_normalizado = c1.telefono_normalizado) <= 3;

  -- 4. El mismo correo (no de la empresa, y que no esté en más de 3 fichas).
  insert into _p
  select distinct least(c1.cuenta_id, c2.cuenta_id), greatest(c1.cuenta_id, c2.cuenta_id), 65, 'mismo correo'
    from contactos c1
    join contactos c2 on lower(btrim(c2.email)) = lower(btrim(c1.email)) and c2.cuenta_id <> c1.cuenta_id
   where c1.email like '%@%' and c1.email not ilike '%efameinsa%' and c1.email not ilike '%openinvest%'
     and c1.cuenta_id in (select id from _b) and c2.cuenta_id in (select id from _b)
     and (select count(distinct x.cuenta_id) from contactos x where lower(btrim(x.email)) = lower(btrim(c1.email))) <= 3;

  delete from fichas_parecidas;
  insert into fichas_parecidas (cuenta_a, cuenta_b, porcentaje, motivos)
  select p.a, p.b,
         case
           when coalesce(max(p.pct) filter (where p.motivo in ('nombre parecido', 'un nombre está dentro del otro')), 0) = 0
             then case when bool_or(p.motivo = 'mismo teléfono') and bool_or(p.motivo = 'mismo correo') then 85
                       when bool_or(p.motivo = 'mismo teléfono') then 70 else 65 end
           else least(100, max(p.pct) filter (where p.motivo in ('nombre parecido', 'un nombre está dentro del otro'))
                           + case when bool_or(p.motivo = 'mismo teléfono') then 30 else 0 end
                           + case when bool_or(p.motivo = 'mismo correo') then 25 else 0 end)
         end,
         array_agg(distinct p.motivo)
    from _p p
    join cuentas ca on ca.id = p.a
    join cuentas cb on cb.id = p.b
   where p.a <> p.b
     -- Dos documentos distintos = dos clientes distintos.
     and not (clave_documento(ca.num_doc) is not null and clave_documento(cb.num_doc) is not null
              and clave_documento(ca.num_doc) <> clave_documento(cb.num_doc))
     -- El mismo documento ya sale en «Fichas repetidas».
     and not (clave_documento(ca.num_doc) is not null and clave_documento(ca.num_doc) = clave_documento(cb.num_doc))
     and not exists (select 1 from fichas_no_repetidas f where f.clave = 'par:' || p.a || ':' || p.b)
   group by p.a, p.b;
  select count(*) into v_n from fichas_parecidas;
  return v_n;
end $$;
revoke all on function public.recalcular_fichas_parecidas() from public, anon;
grant execute on function public.recalcular_fichas_parecidas() to authenticated, service_role;

-- Lo que sirve para comparar una ficha (solo se calcula para las parejas que se muestran).
create or replace function public.datos_para_comparar_ficha(p_cuenta uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'id', c.id,
           'razon_social', c.razon_social,
           'documento', case when c.tipo_doc <> 'SIN_DOC' then c.tipo_doc || ' ' || c.num_doc end,
           'comercial', (select coalesce(p.codigo_comercial || ' · ', '') || p.nombre from perfiles p where p.id = c.comercial_id),
           'direccion', nullif(btrim(concat_ws(' · ', c.direccion, c.distrito, c.provincia)), ''),
           'creada', c.created_at,
           'contactos', (select coalesce(jsonb_agg(jsonb_build_object('nombre', k.nombre, 'telefono', k.telefono, 'email', k.email)), '[]'::jsonb)
                           from (select k.nombre, k.telefono, k.email from contactos k where k.cuenta_id = c.id order by k.es_principal desc nulls last limit 4) k),
           'expedientes', (select count(*) from oportunidades o where o.cuenta_id = c.id),
           'pedidos', (select count(*) from servicios_postventa s where s.cuenta_id = c.id),
           'casos', (select count(*) from atenciones t where t.cuenta_id = c.id),
           'cierres', (select count(*) from informes_cierre i where i.cuenta_id = c.id),
           'ultima_gestion', (select max(ac.realizada_at) from actividades ac join oportunidades o on o.id = ac.oportunidad_id where o.cuenta_id = c.id)
         )
    from cuentas c where c.id = p_cuenta
$$;
revoke all on function public.datos_para_comparar_ficha(uuid) from public, anon, authenticated;

-- La lista para la pantalla: las dos fichas lado a lado.
create or replace function public.fichas_parecidas_para_revisar(p_min int default 60, p_limite int default 200)
returns table (cuenta_a uuid, cuenta_b uuid, porcentaje int, motivos text[], a jsonb, b jsonb, calculado_at timestamptz)
language sql stable security definer set search_path = public as $$
  with pares as (
    select f.*
      from fichas_parecidas f
      join cuentas ca on ca.id = f.cuenta_a and ca.fusionada_en is null and ca.archivada_at is null
      join cuentas cb on cb.id = f.cuenta_b and cb.fusionada_en is null and cb.archivada_at is null
     where puede_unir_fichas()
       and f.porcentaje >= p_min
       and not exists (select 1 from fichas_no_repetidas n where n.clave = 'par:' || f.cuenta_a || ':' || f.cuenta_b)
     order by f.porcentaje desc, f.cuenta_a
     limit least(coalesce(p_limite, 200), 600)
  )
  select p.cuenta_a, p.cuenta_b, p.porcentaje, p.motivos,
         datos_para_comparar_ficha(p.cuenta_a), datos_para_comparar_ficha(p.cuenta_b), p.calculado_at
    from pares p
   order by p.porcentaje desc, p.cuenta_a
$$;
revoke all on function public.fichas_parecidas_para_revisar(int, int) from public, anon;
grant execute on function public.fichas_parecidas_para_revisar(int, int) to authenticated;

select recalcular_fichas_parecidas();
