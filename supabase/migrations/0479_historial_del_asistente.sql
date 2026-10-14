-- 0479 — EL HISTORIAL DEL ASISTENTE, PARA AUDITAR (14-10-2026, Santos).
--
-- El asistente deja de ser solo de gerencia: ahora lo usa todo el personal, con
-- Claude Opus 5.5. Santos lo pidió así: «sus historiales de preguntas se deben
-- de guardar para luego poder auditarlas en la vista de admin».
--
-- Dos tablas:
--   · asistente_conversaciones — un hilo de preguntas de una persona.
--   · asistente_mensajes — una fila por pregunta: qué preguntó, qué le
--     respondió, con qué consultas al CRM lo armó, cuánto tardó y cuánto costó.
--
-- `turno` guarda los mensajes que esa pregunta agregó a la conversación con el
-- modelo (la pregunta, las consultas y sus resultados, la respuesta). El
-- servidor rearma el hilo desde acá en la pregunta siguiente. Por eso el hilo
-- NO viaja desde el navegador: si viajara, alguien podría fabricar un resultado
-- de consulta y hacerle creer al modelo algo que el CRM no dijo.
--
-- QUIÉN ESCRIBE. Solo el servidor, con la llave de servicio. No hay política
-- de insert/update/delete para los usuarios: el historial no se edita ni se
-- borra desde el CRM. Cada persona puede leer lo suyo; admin y gerencia, todo.

create table if not exists public.asistente_conversaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id),
  titulo text,
  created_at timestamptz not null default now(),
  actualizada_at timestamptz not null default now()
);

create table if not exists public.asistente_mensajes (
  id bigint generated always as identity primary key,
  conversacion_id uuid not null references public.asistente_conversaciones(id),
  usuario_id uuid not null references public.perfiles(id),
  -- Con qué permisos preguntó: el rol cambia con el tiempo y la auditoría
  -- tiene que leer lo que valía ese día.
  rol text not null,
  alcance text,
  pregunta text not null,
  respuesta text,
  estado text not null default 'ok' check (estado in ('ok', 'error', 'rechazo', 'corte')),
  error text,
  consultas jsonb not null default '[]'::jsonb,
  turno jsonb,
  modelo text,
  tokens_entrada integer,
  tokens_salida integer,
  tokens_cache_lectura integer,
  tokens_cache_escritura integer,
  costo_usd numeric(10, 5),
  ms_primer_texto integer,
  ms_total integer,
  created_at timestamptz not null default now()
);

create index if not exists asistente_mensajes_conversacion on public.asistente_mensajes (conversacion_id, id);
create index if not exists asistente_mensajes_usuario on public.asistente_mensajes (usuario_id, created_at desc);
create index if not exists asistente_mensajes_fecha on public.asistente_mensajes (created_at desc);
create index if not exists asistente_conversaciones_usuario on public.asistente_conversaciones (usuario_id, actualizada_at desc);

alter table public.asistente_conversaciones enable row level security;
alter table public.asistente_mensajes enable row level security;

drop policy if exists asistente_conversaciones_leer on public.asistente_conversaciones;
create policy asistente_conversaciones_leer on public.asistente_conversaciones
  for select to authenticated
  using (usuario_id = auth.uid() or rol_actual() in ('admin', 'gerencia'));

drop policy if exists asistente_mensajes_leer on public.asistente_mensajes;
create policy asistente_mensajes_leer on public.asistente_mensajes
  for select to authenticated
  using (usuario_id = auth.uid() or rol_actual() in ('admin', 'gerencia'));

revoke insert, update, delete on public.asistente_conversaciones from anon, authenticated;
revoke insert, update, delete on public.asistente_mensajes from anon, authenticated;
revoke all on public.asistente_conversaciones from anon;
revoke all on public.asistente_mensajes from anon;

-- Aplicada desde psql como superusuario, la tabla nace sin permisos para los
-- roles del CRM: el servidor (service_role) no podía escribir el historial.
grant select on public.asistente_conversaciones, public.asistente_mensajes to authenticated;
grant all on public.asistente_conversaciones, public.asistente_mensajes to service_role, postgres;
