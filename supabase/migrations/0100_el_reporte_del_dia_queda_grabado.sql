-- ============================================================
-- CRM EFAMEINSA · Migración 0100 · El reporte del día queda grabado
-- ============================================================
-- Carlos, 28-08, mirando cómo trabajan: «me he dado cuenta que generan su
-- reporte para ir viendo psicológicamente cuántos seguimientos voy… van
-- generando constantemente sus agendas, pero la última, la que se genere al
-- cierre del día, debería ser la que queda grabada, así como los presupuestos».
--
-- Y la consecuencia que él mismo sacó: «no necesitamos que envíen por correo,
-- que esté todo ahí». Hoy el reporte se arma al vuelo y se va en un PDF que
-- alguien adjunta a un correo; si el correo no llega, no hay dónde mirarlo.
--
-- UNA FILA POR PERSONA Y POR DÍA, y se pisa cada vez que se regenera: eso es
-- exactamente «la última es la que queda». No se guarda el PDF sino los datos
-- con los que se armó — el documento se vuelve a dibujar cuando alguien lo
-- abre, así que un cambio de formato no deja el archivo de ayer con la cara
-- vieja, y no hay que administrar un bucket más.

create table if not exists reportes_diarios (
  id uuid primary key default gen_random_uuid(),
  comercial_id uuid not null references perfiles (id) on delete cascade,
  fecha date not null,

  -- El reporte tal como se armó, para poder redibujarlo idéntico.
  contenido jsonb not null,

  generado_at timestamptz not null default now(),
  -- Cuántas veces lo generó ese día. No es un contador ocioso: es la medida de
  -- lo que Carlos describió —el que mira su avance seis veces al día— y sirve
  -- para no confundir «cerró el día» con «pasó a mirar».
  veces integer not null default 1,

  unique (comercial_id, fecha)
);

create index if not exists ix_reportes_diarios_fecha on reportes_diarios (fecha desc);

comment on table reportes_diarios is
  'El cierre del día de cada comercial, con los datos con los que se armó el PDF. Una fila por persona y día: la última generación es la que queda (migración 0100).';

alter table reportes_diarios enable row level security;

-- Cada quien ve y escribe el suyo; gerencia, admin y central lo ven todo —es
-- el reporte que hoy reciben por correo—.
drop policy if exists reportes_diarios_propios on reportes_diarios;
create policy reportes_diarios_propios on reportes_diarios for all to authenticated
  using (comercial_id = (select auth.uid()) or es_backoffice() or rol_actual() = 'central')
  with check (comercial_id = (select auth.uid()) or es_backoffice());

-- Guardar el reporte no puede fallar por una carrera: dos pestañas abiertas a
-- la misma hora son dos generaciones del mismo día.
create or replace function guardar_reporte_diario(p_comercial uuid, p_fecha date, p_contenido jsonb)
returns void language sql security invoker as $$
  insert into reportes_diarios (comercial_id, fecha, contenido)
  values (p_comercial, p_fecha, p_contenido)
  on conflict (comercial_id, fecha)
  do update set contenido = excluded.contenido,
                generado_at = now(),
                veces = reportes_diarios.veces + 1;
$$;

comment on function guardar_reporte_diario is
  'Deja grabado el reporte del día pisando el anterior y contando las veces que se generó (migración 0100).';
