-- ============================================================
-- CRM EFAMEINSA · Migración 0052 · Grupo económico (empresa madre y sedes)
-- ============================================================
-- Una misma casa comercial factura bajo varias razones sociales, o tiene
-- sedes con RUC propio. En el archivo aparecen así:
--
--   "CONGELADOS Y FRESCOS S.A.C. - MARINASOL S.A."
--   "CORPORACION CENTRAL SUAREZ SAC - AVIVA DEL PERU SOCIEDAD ANONIMA CERRADA"
--   "HORTIFRUT PERU SAC (sede Salaverry)"
--
-- y Katerine lo anotó a mano en una gestión: "es el mismo gerente de ambas
-- empresas".
--
-- Fusionarlas sería un error: son contribuyentes distintos, con RUC distinto,
-- y una cotización se emite a UNO. Lo que hace falta es poder decir que
-- pertenecen al mismo grupo, para que el comercial vea el peso real del
-- cliente y no negocie a ciegas con la sede chica de una casa grande.
--
-- POR QUÉ UNA COLUMNA Y NO UNA TABLA DE GRUPOS: un grupo con una sola empresa
-- no existe, y con dos ya alcanza con señalar cuál es la madre. Una tabla
-- aparte obligaría a inventarle un nombre al grupo y a mantenerla sincronizada
-- sin que nadie gane nada. Es el mismo camino que toma HubSpot con sus
-- empresas madre e hijas.

alter table cuentas
  add column if not exists cuenta_padre_id uuid references cuentas(id) on delete set null;

-- Una empresa no puede ser su propia madre.
alter table cuentas drop constraint if exists cuentas_padre_distinto;
alter table cuentas add constraint cuentas_padre_distinto check (cuenta_padre_id is null or cuenta_padre_id <> id);

create index if not exists ix_cuentas_padre on cuentas (cuenta_padre_id) where cuenta_padre_id is not null;

comment on column cuentas.cuenta_padre_id is
  'Empresa madre del grupo económico. Las sedes y las razones sociales hermanas apuntan a ella; la madre lo deja en NULL. No se fusionan: son contribuyentes distintos y la cotización se emite a uno.';

-- Un solo nivel: la madre no puede tener madre. Sin esto aparecen cadenas
-- (A→B→C) y toda pantalla que muestre "el grupo" tendría que recorrer un
-- árbol de profundidad desconocida.
create or replace function validar_grupo_economico()
returns trigger language plpgsql as $fn$
begin
  if new.cuenta_padre_id is not null then
    if exists (select 1 from cuentas c where c.id = new.cuenta_padre_id and c.cuenta_padre_id is not null) then
      raise exception 'Esa empresa ya pertenece a otro grupo: apunte a la empresa madre';
    end if;
    if exists (select 1 from cuentas c where c.cuenta_padre_id = new.id) then
      raise exception 'Esta empresa ya es la madre de un grupo: no puede colgar de otra';
    end if;
  end if;
  return new;
end;
$fn$;

create trigger trg_grupo_economico
  before insert or update of cuenta_padre_id on cuentas
  for each row execute function validar_grupo_economico();

-- El grupo completo de una cuenta —ella, su madre y sus hermanas— con lo que
-- cada una compró. Es lo que se muestra en la ficha: el comercial necesita ver
-- el peso real del cliente, no solo el de la razón social que tiene delante.
create or replace function grupo_economico(p_cuenta_id uuid)
returns table (
  id uuid,
  razon_social text,
  num_doc text,
  es_madre boolean,
  es_esta boolean,
  comercial text,
  ventas bigint,
  monto numeric,
  cotizaciones bigint
)
language sql stable security invoker as $fn$
  with raiz as (
    select coalesce(c.cuenta_padre_id, c.id) id from cuentas c where c.id = p_cuenta_id
  ),
  miembros as (
    select c.* from cuentas c, raiz r where c.id = r.id or c.cuenta_padre_id = r.id
  )
  select m.id,
         m.razon_social,
         m.num_doc,
         m.cuenta_padre_id is null,
         m.id = p_cuenta_id,
         p.nombre,
         (select count(*) from ventas v join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = m.id),
         (select coalesce(sum(v.monto_total), 0) from ventas v join oportunidades o on o.id = v.oportunidad_id where o.cuenta_id = m.id),
         (select count(*) from cotizaciones_historicas ch where ch.cuenta_id = m.id)
  from miembros m
  left join perfiles p on p.id = m.comercial_id
  order by (m.cuenta_padre_id is null) desc, m.razon_social;
$fn$;

comment on function grupo_economico is
  'La cuenta, su empresa madre y sus hermanas, con ventas y cotizaciones de cada una. security invoker: cada quien ve lo que su RLS le permite.';
