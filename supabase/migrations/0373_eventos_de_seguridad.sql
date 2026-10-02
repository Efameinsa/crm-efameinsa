-- 0373 · Conducta sospechosa: qué hace cada cuenta con la información, y avisos a gerencia
--
-- Santos (02-10-2026): «queremos estar enterados si hace screenshots, o tiene algún comportamiento
-- sospechoso como copiar información y llevársela a otro lado; tenemos información muy delicada».
-- Y aclaró: «no quiero que bloquees nada». Esto SOLO anota y avisa.
--
--   · `eventos_seguridad`: una fila por cosa que hizo una cuenta con la información: captura de
--     pantalla (la app, o la tecla Impr Pant en la web), copiar (cuántos caracteres, NUNCA el texto),
--     exportar un documento, descargar un archivo, imprimir, compartirlo a otra app.
--   · `alertas_seguridad`: cada vez que una regla se cumplió y se avisó a gerencia. Sirve para no
--     repetir el mismo aviso a cada rato (enfriamiento) y para ver el historial.
--
-- Las reglas (cuántos eventos en cuánto tiempo) viven en el código (lib/seguridad-conducta.ts) para
-- poder probarlas y ajustarlas sin migración.
--
-- Solo gerencia y admin leen estas tablas. Las filas las escribe el servidor (service_role) después
-- de comprobar la sesión: el navegador de la persona nunca escribe directo.

create table if not exists eventos_seguridad (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references perfiles (id) on delete cascade,
  tipo       text not null check (tipo in ('captura_pantalla', 'copiar', 'exportacion', 'descarga', 'impresion', 'compartir')),
  -- 'app' = la app de Android; 'web' = navegador.
  origen     text not null default 'web' check (origen in ('app', 'web')),
  -- Lista blanca (ver sanearDetalle): ruta sin parámetros, nº de caracteres, nombre del archivo.
  detalle    jsonb not null default '{}'::jsonb,
  dispositivo text,
  creado_at  timestamptz not null default now()
);
create index if not exists ix_eventos_seguridad_user on eventos_seguridad (user_id, creado_at desc);
create index if not exists ix_eventos_seguridad_fecha on eventos_seguridad (creado_at desc);

create table if not exists alertas_seguridad (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references perfiles (id) on delete cascade,
  regla     text not null,
  cuenta    integer not null,
  resumen   text not null,
  creada_at timestamptz not null default now()
);
create index if not exists ix_alertas_seguridad_user on alertas_seguridad (user_id, regla, creada_at desc);
create index if not exists ix_alertas_seguridad_fecha on alertas_seguridad (creada_at desc);

comment on table eventos_seguridad is
  'Lo que hace cada cuenta con la información: capturas, copias, exportaciones, descargas, impresiones (0373; Santos 02-10-2026). Solo mira y avisa, no bloquea. Nunca guarda el contenido copiado.';
comment on table alertas_seguridad is
  'Avisos que se dieron a gerencia por conducta sospechosa (0373). Sirve de historial y de enfriamiento.';

alter table eventos_seguridad enable row level security;
alter table alertas_seguridad enable row level security;
revoke all on public.eventos_seguridad from anon;
revoke all on public.alertas_seguridad from anon;
grant select on public.eventos_seguridad to authenticated;
grant select on public.alertas_seguridad to authenticated;
grant all on public.eventos_seguridad to service_role;
grant all on public.alertas_seguridad to service_role;

drop policy if exists eventos_seguridad_backoffice on eventos_seguridad;
create policy eventos_seguridad_backoffice on eventos_seguridad for select to authenticated
  using (coalesce(es_backoffice(), false));

drop policy if exists alertas_seguridad_backoffice on alertas_seguridad;
create policy alertas_seguridad_backoffice on alertas_seguridad for select to authenticated
  using (coalesce(es_backoffice(), false));

notify pgrst, 'reload schema';
