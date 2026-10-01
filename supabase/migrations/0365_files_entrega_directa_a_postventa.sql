-- 0365 · Central entrega el file a postventa al generar el pedido, sin que nadie lo pida
--
-- Ing. Carlos, reunión 01-10-2026 11:05: «cuando todavía estamos con el
-- proceso, se hace el pedido, que lo hace la Central … Lo único que tiene que
-- hacer Alondra es agarrar el expediente y físicamente llevarle a postventa. Y
-- se lo entrega en su mano. Pero esa entrega no está registrada … acá no
-- empezó y ya le estamos entregando … yo te entrego porque hemos generado un
-- pedido. Entonces no sé si lo enlazamos».
--
-- El cuaderno de files (0334) solo conocía el préstamo que alguien pide. Ahora
-- Central registra la ENTREGA DIRECTA: la fila nace ya entregada, a nombre de
-- quien la recibe, y enlazada al pedido que se acaba de generar. Desde ahí el
-- circuito es el de siempre: quien lo recibe firma «Recibí el file», aprieta
-- «Terminé» (0350), Central lo recoge y lo marca «Devuelto».
--
--   · pedido_id        el pedido (servicios_postventa) que motivó la entrega.
--   · pedido_numero    su número (PED-0001-2026) anotado al entregar, como el
--                      nombre del cliente (0335): quien recibe puede no leer
--                      ese pedido por RLS.
--   · entrega_directa  la entregó Central sin pedido de nadie; en esas filas
--                      `solicitado_por` es quien recibió el file (es quien lo
--                      tiene y quien firma), no quien lo pidió.
--
-- Sincronización nube↔local (piloto, 29-09): como la 0341, solo se agregan
-- columnas; el disparador zz_sync de la 0334 sigue valiendo. Aplicar en las
-- DOS bases antes de desplegar.

alter table public.prestamos_file
  add column if not exists pedido_id uuid references public.servicios_postventa (id) on delete set null,
  add column if not exists pedido_numero text,
  add column if not exists entrega_directa boolean not null default false;

create index if not exists ix_prestamos_file_pedido on public.prestamos_file (pedido_id) where pedido_id is not null;

-- p_a: quien recibe el file en la mano (por lo general, postventa).
-- p_empresa: 'open', 'efameinsa' o 'ambos' (0341); acá es obligatorio.
-- p_pedido: el pedido recién generado; null = «Entregar sin pedido» desde /files.
-- Devuelve el id del préstamo.
create or replace function public.files_entregar_directo(
  p_cuenta uuid,
  p_a uuid,
  p_empresa text,
  p_pedido uuid default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo perfiles%rowtype;
  v_a perfiles%rowtype;
  v_c cuentas%rowtype;
  v_s servicios_postventa%rowtype;
  v_cuenta_pedido uuid;
  v_ya record;
  v_id uuid;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
  v_empresa_txt text;
begin
  if not lleva_los_files() then raise exception 'La entrega directa del file la registra Central'; end if;
  select * into v_yo from perfiles where id = auth.uid() and activo;
  if v_yo.id is null then raise exception 'Sesión no válida'; end if;

  select * into v_a from perfiles where id = p_a and activo;
  if v_a.id is null then raise exception 'Esa persona no existe o ya no está activa'; end if;
  if v_a.id = v_yo.id then raise exception 'El file se entrega a otra persona, no a usted misma'; end if;
  -- Una cuenta de práctica no le entrega (ni avisa) a una real, ni al revés
  -- (0336, 0357): la fila y el aviso quedarían en el mundo equivocado.
  if coalesce(v_a.es_prueba, false) <> coalesce(v_yo.es_prueba, false) then
    raise exception 'Desde una cuenta de práctica solo se entrega a cuentas de práctica';
  end if;

  if p_empresa is null or p_empresa not in ('open', 'efameinsa', 'ambos') then
    raise exception 'Marque OPEN, EFAMEINSA o ambos';
  end if;

  -- El cliente; si su ficha se unió a otra (0272), el file es el de la que quedó.
  select * into v_c from cuentas where id = p_cuenta;
  if v_c.id is null then raise exception 'Ese cliente no existe'; end if;
  if v_c.fusionada_en is not null then
    select * into v_c from cuentas where id = v_c.fusionada_en;
  end if;

  if p_pedido is not null then
    -- Un solo file vivo por pedido: dos clics (o dos pestañas) no lo entregan dos veces.
    perform pg_advisory_xact_lock(hashtext('files_entregar_directo_' || p_pedido::text));
    select * into v_s from servicios_postventa
     where id = p_pedido and es_prueba = coalesce(v_yo.es_prueba, false);
    if v_s.id is null then raise exception 'Ese pedido no existe'; end if;
    if v_s.numero_pedido_erp is null then raise exception 'Primero genere el pedido: la entrega queda enlazada a su número'; end if;
    if v_s.cuenta_id is not null then
      select coalesce(fusionada_en, id) into v_cuenta_pedido from cuentas where id = v_s.cuenta_id;
      if v_cuenta_pedido is distinct from v_c.id then raise exception 'Ese pedido es de otro cliente'; end if;
    end if;
    select pf.entregado_at, p.nombre into v_ya
      from prestamos_file pf join perfiles p on p.id = pf.solicitado_por
     where pf.pedido_id = p_pedido and pf.anulado_at is null and pf.devuelto_at is null
     limit 1;
    if found then
      raise exception 'El file de este pedido ya se entregó a % el %', v_ya.nombre,
        to_char(v_ya.entregado_at at time zone 'America/Lima', 'DD/MM HH24:MI');
    end if;
  end if;

  insert into prestamos_file (grupo, cuenta_id, cliente_texto, cliente_doc, empresa, solicitado_por, solicitado_at, nota,
                              entregado_at, entregado_por, es_prueba, pedido_id, pedido_numero, entrega_directa)
  values (gen_random_uuid(), v_c.id, v_c.razon_social, v_c.num_doc, p_empresa, v_a.id, now(), v_nota,
          now(), v_yo.id, coalesce(v_yo.es_prueba, false), v_s.id, v_s.numero_pedido_erp, true)
  returning id into v_id;

  -- Aviso a quien lo recibió, para que firme el cargo virtual. Mismo mundo
  -- (real o práctica) que Central, garantizado arriba.
  v_empresa_txt := case p_empresa when 'open' then 'OPEN' when 'efameinsa' then 'EFAMEINSA' else 'OPEN y EFAMEINSA' end;
  insert into notificaciones (user_id, tipo, titulo, cuerpo, url)
  values (v_a.id, 'file_entregado',
          left('Central le entregó un file · ' || v_c.razon_social || ' (' || v_empresa_txt || ')', 200),
          case when v_s.numero_pedido_erp is not null
               then 'Se lo entregó en su mano al generar el pedido ' || v_s.numero_pedido_erp || '. '
               else 'Se lo entregó en su mano. ' end ||
          'Confírmelo con «Recibí el file» y, al terminar, «Terminé, pueden recogerlo».' ||
          coalesce(' — ' || v_nota, ''),
          '/files');

  return v_id;
end $$;

revoke all on function public.files_entregar_directo(uuid, uuid, text, uuid, text) from public, anon;
grant execute on function public.files_entregar_directo(uuid, uuid, text, uuid, text) to authenticated, service_role;
