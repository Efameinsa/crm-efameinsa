-- ============================================================
-- CRM EFAMEINSA · Migración 0138 · La oficina reserva números para trabajar sin internet
-- ============================================================
-- Plan 26 (docs/26-trabajo-sin-internet.md), decidido por Santos el 31-08:
-- el coordinador local de la oficina mantiene SIEMPRE una despensa de números
-- reservados (40 por serie, renovada mientras hay internet), y cuando el
-- internet se corta, las cotizaciones se numeran de esa despensa — imposible
-- chocar con la nube, porque la nube ya saltó esos números.
--
-- Tres cosas:
--   1. `correlativos_reservas` aprende vencimiento y uso (una reserva no
--      usada en 7 días vuelve sola) y deja de exigir una persona: la reserva
--      de la oficina es de la oficina.
--   2. `siguiente_correlativo_anual` (cotizaciones) aprende a SALTAR las
--      reservas vigentes — hasta hoy solo el contador de informes lo hacía
--      (0124), y sin esto la nube pisaría la despensa.
--   3. Las tres RPC del coordinador, con secreto compartido (patrón PIN: el
--      secreto vive en una tabla que ninguna política expone, y las funciones
--      son security definer que lo comparan en tiempo constante no hace
--      falta: no es un endpoint público, viaja por la RPC autenticada).

-- ── 1 · La reserva aprende a vencer ─────────────────────────────────────────
alter table correlativos_reservas alter column perfil_id drop not null;
alter table correlativos_reservas add column if not exists reservado_para text;
alter table correlativos_reservas add column if not exists vence_at timestamptz;
alter table correlativos_reservas add column if not exists usado_at timestamptz;

comment on column correlativos_reservas.vence_at is
  'Si pasa sin usarse, la reserva se libera (liberar_reservas_vencidas). NULL = no vence (reservas a persona, como la 0124).';
comment on column correlativos_reservas.usado_at is
  'El coordinador local confirmó que este número ya se emitió sin internet.';

-- Una reserva está VIGENTE si no venció, o si ya se usó (un número usado
-- jamás vuelve al pozo, esté o no sincronizada la cotización todavía).
create or replace function reserva_vigente(r correlativos_reservas)
returns boolean language sql immutable as $$
  select r.usado_at is not null or r.vence_at is null or r.vence_at > now()
$$;

-- ── 2 · El contador de cotizaciones salta las reservas vigentes ─────────────
-- Sobre la definición viva (última: 0077). Solo se agrega el tercer exit-check.
create or replace function public.siguiente_correlativo_anual(p_serie text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_anio   integer := extract(year from (now() at time zone 'America/Lima'))::integer;
  v_clave  text    := p_serie || '-' || v_anio;
  v        integer;
  v_saltos integer := 0;
begin
  insert into correlativos (clave, ultimo) values (v_clave, 0)
    on conflict (clave) do nothing;

  loop
    update correlativos set ultimo = ultimo + 1 where clave = v_clave
      returning ultimo into v;
    if v is null then
      raise exception 'No se pudo asignar el correlativo de la serie %', p_serie;
    end if;

    exit when not exists (
        select 1 from cotizaciones
         where serie = p_serie::serie_cotizacion and correlativo = v
      ) and not exists (
        select 1 from cotizaciones_historicas
         where serie = p_serie::serie_cotizacion and anio = v_anio and correlativo = v
      ) and not exists (
        select 1 from correlativos_reservas r
         where r.clave = v_clave and r.numero = v and reserva_vigente(r)
      );

    v_saltos := v_saltos + 1;
    raise notice 'Correlativo %-% ya estaba usado o reservado; se salta.', v, v_anio;
    if v_saltos > 500 then
      raise exception 'La serie % tiene 500 números seguidos ocupados: revisar el archivo antes de seguir emitiendo', p_serie;
    end if;
  end loop;

  return v;
end $function$;

-- ── 3 · El secreto del coordinador y sus tres RPC ───────────────────────────
create table if not exists coordinador_local (
  id      boolean primary key default true check (id),
  secreto text not null,
  actualizado_at timestamptz not null default now()
);
alter table coordinador_local enable row level security;
-- Sin políticas a propósito: solo service_role y las funciones definer lo leen.

create or replace function coordinador_autorizado(p_secreto text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from coordinador_local where secreto = p_secreto and length(p_secreto) >= 24)
$$;

-- Renueva la despensa de la serie: EXTIENDE la vigencia de los números que la
-- oficina ya tiene sin usar y aparta solo los que faltan para llegar al
-- objetivo. Así una renovación normal no quema ni un número — los mismos 40
-- esperan su corte de internet, con la fecha siempre fresca. Los nuevos salen
-- del MISMO contador que usa la nube: despensa y emisiones en línea comparten
-- una sola cola, en orden.
create or replace function renovar_despensa_local(
  p_secreto text, p_serie text, p_objetivo integer default 40, p_dias_vigencia integer default 7
) returns integer[]
language plpgsql security definer set search_path = public as $$
declare
  v       integer;
  i       integer;
  v_tengo integer;
  v_anio  integer := extract(year from (now() at time zone 'America/Lima'))::integer;
  v_clave text    := p_serie || '-' || v_anio;
begin
  if not coordinador_autorizado(p_secreto) then
    raise exception 'Coordinador no autorizado';
  end if;
  if p_objetivo < 1 or p_objetivo > 100 then
    raise exception 'La despensa admite entre 1 y 100 números';
  end if;

  update correlativos_reservas set vence_at = now() + make_interval(days => p_dias_vigencia)
   where clave = v_clave and reservado_para = 'oficina' and usado_at is null;

  select count(*) into v_tengo from correlativos_reservas
   where clave = v_clave and reservado_para = 'oficina' and usado_at is null;

  for i in 1..greatest(0, p_objetivo - v_tengo) loop
    v := siguiente_correlativo_anual(p_serie);
    insert into correlativos_reservas (clave, numero, motivo, reservado_para, vence_at)
      values (v_clave, v, 'Despensa del coordinador local (plan 26)', 'oficina',
              now() + make_interval(days => p_dias_vigencia));
  end loop;

  return array(
    select numero from correlativos_reservas
     where clave = v_clave and reservado_para = 'oficina' and usado_at is null
     order by numero);
end $$;

-- El coordinador avisa, al reconectar, qué número entregó sin internet.
create or replace function confirmar_uso_local(
  p_secreto text, p_serie text, p_anio integer, p_numero integer
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not coordinador_autorizado(p_secreto) then
    raise exception 'Coordinador no autorizado';
  end if;
  update correlativos_reservas set usado_at = coalesce(usado_at, now())
   where clave = p_serie || '-' || p_anio and numero = p_numero and reservado_para = 'oficina';
  return found;
end $$;

-- Lo reservado que venció sin usarse vuelve al pozo (se borra la reserva: el
-- contador ya pasó por esos números, así que quedan como huecos históricos
-- honestos — igual que un número anulado).
create or replace function liberar_reservas_vencidas(p_secreto text)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if not coordinador_autorizado(p_secreto) then
    raise exception 'Coordinador no autorizado';
  end if;
  delete from correlativos_reservas
   where reservado_para = 'oficina' and usado_at is null and vence_at is not null and vence_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;
