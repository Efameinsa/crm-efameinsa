-- ============================================================
-- CRM EFAMEINSA · Migración 0051 · RUC candidatos de SUNAT (sala de espera)
-- ============================================================
-- 3.791 cuentas quedaron sin documento porque el Excel de Central no lo traía,
-- y sin documento no hay con qué deduplicar: los 396 grupos duplicados salen
-- TODOS del nombre — por documento no hay ni uno solo.
--
-- SUNAT se puede consultar por razón social y devuelve el RUC. Pero buscar por
-- nombre trae homónimos, y **un RUC equivocado es peor que ningún RUC**: le
-- pegaría a una cuenta la identidad de otra empresa, la deduplicación las
-- fusionaría después y quedarían mezclados los historiales de venta de dos
-- clientes distintos. Un error silencioso y difícil de deshacer.
--
-- Por eso esta tabla es una SALA DE ESPERA. Lo que devuelve SUNAT se guarda
-- acá con todos los candidatos, una confianza y el motivo en castellano —
-- nunca se escribe en `cuentas`. Gerencia revisa y aprueba; recién entonces
-- otro script aplica solo lo aprobado.
--
-- Decisión de Darwin (21-08): "anda buscando y guardando hasta que el gerente
-- me confirme".

create table if not exists sunat_candidatos (
  id                uuid primary key default gen_random_uuid(),
  cuenta_id         uuid not null references cuentas(id) on delete cascade,
  -- Se guarda el nombre tal como estaba al consultar: si alguien corrige la
  -- razón social después, hay que poder ver contra qué se buscó.
  razon_social_crm  text not null,

  consultado_at     timestamptz not null default now(),
  -- 'exacta_unica' | 'unica_aproximada' | 'varias' | 'sin_resultado'
  resultado         text not null,
  -- TODO lo que devolvió SUNAT, sin filtrar: para que gerencia pueda elegir
  -- otro si el sugerido no es el bueno.
  candidatos        jsonb not null default '[]'::jsonb,

  ruc_sugerido      text,
  nombre_sunat      text,
  ubicacion_sunat   text,
  estado_sunat      text,               -- ACTIVO / BAJA DE OFICIO / …

  confianza         text not null,      -- 'alta' | 'media' | 'baja' | 'ninguna'
  motivo            text not null,      -- por qué, explicado para quien aprueba

  -- Señal fuerte en los dos sentidos: si ese RUC ya está en otra cuenta, o
  -- bien encontramos el duplicado que buscábamos, o bien nos equivocamos de
  -- empresa. En ambos casos lo tiene que mirar una persona.
  ruc_ya_en_cuenta  uuid references cuentas(id),

  decision          text,               -- null = sin revisar | 'aprobado' | 'rechazado'
  decidido_por      uuid references perfiles(id),
  decidido_at       timestamptz,
  nota_decision     text,

  unique (cuenta_id)
);

create index if not exists ix_sunat_cand_decision on sunat_candidatos (decision, confianza);

comment on table sunat_candidatos is
  'Sala de espera: RUC que SUNAT propone para cuentas sin documento. NO se escribe en cuentas hasta que gerencia apruebe — un RUC equivocado fusionaria dos clientes distintos.';

alter table sunat_candidatos enable row level security;

-- Solo backoffice: esto es trabajo de depuración de datos, no de la operación
-- diaria del comercial.
create policy sunat_cand_backoffice on sunat_candidatos for all to authenticated
  using ((select es_backoffice())) with check ((select es_backoffice()));
