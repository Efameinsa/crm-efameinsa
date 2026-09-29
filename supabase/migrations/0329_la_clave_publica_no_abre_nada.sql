-- 0329 · La clave pública, sola, no abre nada
--
-- 29-09-2026, auditoría pedida por Santos. La clave publicable viaja en el
-- navegador de cualquiera que abre crm.efameinsa.com. Sin iniciar sesión, con
-- esa clave se podía (todo comprobado contra producción):
--
--   · LISTAR Y DESCARGAR los adjuntos: 740 de 775 archivos (PDF de cierres,
--     fotos de pedidos, capturas de leads). La 0306 volvió a crear la política
--     `adjuntos_lectura` sin «to authenticated» y quedó para todo el mundo.
--   · ver la lista de supervisores y calcular su código de autorización
--     vigente (`supervisores_del_pin` + `codigo_pin_supervisor`);
--   · gastar números de cotización y de informe (`siguiente_correlativo_*`);
--   · dejarle una notificación con enlace a cualquier usuario
--     (`crear_notificacion`).
--
-- El CRM entra SIEMPRE con sesión: en 24 horas de registros (191 mil pedidos)
-- el rol anónimo no llamó ni una función. Lo único que entra sin sesión es el
-- coordinador local de correlativos, que se identifica con su secreto.
--
-- Regla que queda: **lo nuevo nace cerrado para `anon`**. Si algún día una
-- función tiene que responderle a alguien sin sesión, se le da el permiso a
-- mano en su migración: `grant execute on function x(...) to anon`.

-- ───────────────────────── 1. Los adjuntos ─────────────────────────────────
-- Con sesión no basta: tiene que ser una cuenta del CRM, y activa. Una cuenta
-- desactivada con la sesión todavía viva, o una sin perfil, no lee ni sube.

create or replace function public.tiene_perfil_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from perfiles p where p.id = auth.uid() and p.activo);
$$;

drop policy if exists adjuntos_lectura on storage.objects;
create policy adjuntos_lectura on storage.objects for select to authenticated
  using (
    bucket_id = 'adjuntos'
    and public.tiene_perfil_activo()
    and (
      name not like 'finanzas/%' or public.es_finanzas() or public.es_backoffice()
    )
    and (
      (name not like 'liquidaciones/%' and name not like 'facturas/%') or public.ve_documentos_de_finanzas()
    )
  );

drop policy if exists adjuntos_subida on storage.objects;
create policy adjuntos_subida on storage.objects for insert to authenticated
  with check (bucket_id = 'adjuntos' and public.tiene_perfil_activo());

-- ───────────────────────── 2. Tablas y vistas ──────────────────────────────
-- El RLS ya no le mostraba filas a `anon` (probado tabla por tabla), pero tenía
-- todos los permisos y una política mal escrita bastaba para abrir una tabla.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Las ventas con sus montos las lee el CRM solo a través de funciones con
-- control de rol (finanzas_marketing y las de CLTV). Directo, cualquier cuenta
-- con sesión las veía todas.
revoke all on public.v_ventas_detalle from authenticated;

-- ───────────────────────── 3. Funciones ────────────────────────────────────
do $$
declare
  f        record;
  r        text;
  quienes  text[];
  -- Entran sin sesión a propósito: el coordinador local, con su secreto.
  publicas constant text[] := array[
    'confirmar_uso_local', 'renovar_despensa_local', 'liberar_reservas_vencidas'
  ];
  -- Piezas internas: solo las llaman otras funciones (que corren como dueñas)
  -- o el servidor con la clave de servicio. Ninguna pantalla las pide.
  internas constant text[] := array[
    'codigo_pin_supervisor', 'crear_notificacion',
    'siguiente_correlativo', 'siguiente_correlativo_anual',
    'siguiente_correlativo_informe', 'siguiente_correlativo_de_practica',
    'atar_informe_suelto', 'sede_para_lead', 'informe_emitido_para_venta',
    'pedido_para_puesta_en_marcha', 'ficha_sin_identidad',
    'el_telefono_puede_unir', 'coordinador_autorizado'
  ];
begin
  for f in
    select p.oid, p.proname, p.oid::regprocedure::text as firma
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       -- Las de extensiones (pg_trgm) no se tocan: las usan los buscadores.
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
       and p.proname <> all (publicas)
  loop
    -- Quién más puede ejecutarla hoy: nadie que no sea `anon` pierde nada.
    select array_agg(x.rolname::text) into quienes
      from pg_roles x
     where x.rolname <> 'anon' and x.rolname !~ '^pg_' and not x.rolsuper
       and has_function_privilege(x.oid, f.oid, 'execute');

    execute format('revoke execute on routine %s from public, anon', f.firma);
    foreach r in array coalesce(quienes, '{}') loop
      execute format('grant execute on routine %s to %I', f.firma, r);
    end loop;

    if f.proname = any (internas) then
      execute format('revoke execute on routine %s from authenticated', f.firma);
    end if;
  end loop;
end $$;

-- ───────────────────────── 4. Lo que se cree desde hoy ─────────────────────
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
-- Postgres le da EXECUTE a PUBLIC (todos, `anon` incluido) en cada función
-- nueva, y eso solo se quita sin «in schema». Las de `public` siguen naciendo
-- con permiso para `authenticated` y `service_role`, que es lo que usa el CRM.
alter default privileges for role postgres revoke execute on functions from public;
