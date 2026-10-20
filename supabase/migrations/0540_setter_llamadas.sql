-- 0540 · Modo setter: cada lead nuevo de un formulario hace llamar al celular de quien está de setter.
-- Santos, 20-10-2026: «cada vez que llegue un lead a un Google Sheets se conecte con mi cuenta de admin
-- de la apk del CRM en mi celular y se llame inmediatamente a la persona (quiero hacer el papel de setter)».
--
-- · perfiles.setter_llamadas: quién recibe esas llamadas (hoy, admin@efameinsa.com).
-- · llamadas_por_hacer: la cola. La llena el CRM al registrar el lead; la lee el celular (token del dispositivo).

alter table perfiles add column if not exists setter_llamadas boolean not null default false;

create table if not exists llamadas_por_hacer (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references perfiles(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  nombre text not null,
  telefono text not null,
  detalle text,
  estado text not null default 'pendiente' check (estado in ('pendiente','avisada','llamada','descartada')),
  creada_at timestamptz not null default now(),
  avisada_at timestamptz,
  cerrada_at timestamptz
);
create index if not exists ix_llamadas_por_hacer_user on llamadas_por_hacer (user_id, estado, creada_at);

alter table llamadas_por_hacer enable row level security;
-- Cada quien ve las suyas; gerencia y admin, todas. Escribe solo el servidor (service_role).
create policy llamadas_por_hacer_ver on llamadas_por_hacer for select to authenticated
  using (user_id = auth.uid() or coalesce(es_backoffice(), false));

-- Santos es el setter.
update perfiles set setter_llamadas = true where id = '7903ef3b-b139-4fa9-aaec-83f172ae7c69';
