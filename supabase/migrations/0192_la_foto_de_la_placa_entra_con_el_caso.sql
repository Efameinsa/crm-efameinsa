-- LA FOTO DE LA PLACA ENTRA POR DONDE ENTRA EL CASO.
--
-- Los casos de prueba del área dicen «el cliente manda la foto de la placa»,
-- pero el formulario de «Registrar un caso» no tenía dónde subirla: solo la
-- aceptaba el de Central. La foto de un caso que entra por el teléfono del
-- área se quedaba en el WhatsApp de quien contestó (informe de UX del 08-09).
--
-- Y es la foto la que resuelve el problema de identidad: la serie mal dictada
-- por teléfono es la razón por la que existen casos «sin equipo identificar».
--
-- No hace falta columna nueva: el aviso que crea esta función es un `lead`, y
-- `leads.adjuntos` existe desde la 0082 con las mismas reglas de bucket. Se le
-- agrega un parámetro a la función y se guarda ahí.
--
-- Se parcha la definición VIVA con reemplazos comprobados, nunca copiándola:
-- copiar el cuerpo de estas funciones ya revivió reglas revertidas tres veces
-- en este repositorio.

do $$
declare
  def text;
  antes text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'registrar_atencion_postventa';
  if def is null then
    raise exception 'No existe registrar_atencion_postventa: nada que parchar';
  end if;

  -- 1) El parámetro nuevo, al final y con valor por defecto: quien ya la
  --    llamaba sin fotos la sigue llamando igual.
  antes := def;
  def := replace(
    def,
    'p_codigo_error text DEFAULT NULL::text)',
    'p_codigo_error text DEFAULT NULL::text, p_adjuntos jsonb DEFAULT ''[]''::jsonb)'
  );
  if def = antes then raise exception 'No encontré la firma para agregar p_adjuntos'; end if;

  -- 2) La columna en el insert del lead.
  antes := def;
  def := replace(
    def,
    'sugerido_a, sugerido_tipo, sugerido_atencion, sugerido_por',
    'sugerido_a, sugerido_tipo, sugerido_atencion, sugerido_por, adjuntos'
  );
  if def = antes then raise exception 'No encontré la lista de columnas del insert'; end if;

  -- 3) Y su valor.
  antes := def;
  def := replace(
    def,
    'v_quien, v_tipo_viejo, p_tipo, v_quien' || E'\n  )',
    'v_quien, v_tipo_viejo, p_tipo, v_quien, coalesce(p_adjuntos, ''[]''::jsonb)' || E'\n  )'
  );
  if def = antes then raise exception 'No encontré los valores del insert'; end if;

  execute def;
end $$;

-- La firma vieja se retira para que PostgREST no quede con dos candidatas: con
-- las dos vivas, una llamada sin fotos es ambigua y falla en tiempo de uso.
drop function if exists public.registrar_atencion_postventa(uuid, tipo_atencion, text, uuid, text, text);

comment on function public.registrar_atencion_postventa(uuid, tipo_atencion, text, uuid, text, text, jsonb) is
  'Registra el aviso de un caso técnico en la bandeja de Central. Desde la 0192 acepta las fotos que mandó el cliente (la de la placa, sobre todo), que viajan en el lead.';
