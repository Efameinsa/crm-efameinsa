-- 0328 · Lo que se leía con la clave pública y sin iniciar sesión
--
-- 29-09-2026. El aviso semanal de Supabase («security vulnerabilities») tenía
-- razón en tres objetos. Con la clave publicable —la que viaja en el navegador
-- de cualquiera que abre el CRM— y sin usuario, la API devolvía:
--
--   · v_ventas_detalle              1 466 ventas (fecha, monto, moneda, serie…)
--   · tipificacion_whatsapp_actual    235 filas
--   · _migraciones_aplicadas          346 filas, y además dejaba ESCRIBIR y
--                                     BORRAR: sin RLS y con todos los permisos.
--
-- Las dos vistas son del dueño (saltan el RLS de sus tablas): quien puede
-- leerlas lo ve todo. El CRM las lee siempre con sesión iniciada, así que al
-- rol anónimo se le quita el permiso y nada más cambia. No se pasan a
-- security_invoker: los reportes de gerencia dependen de que la vista vea todo.
--
-- _migraciones_aplicadas solo la usan los scripts que entran directo a la base
-- (dueño de la tabla, no le aplica el RLS).

revoke all on public.v_ventas_detalle from anon;
revoke all on public.tipificacion_whatsapp_actual from anon;

revoke all on public._migraciones_aplicadas from anon, authenticated;
alter table public._migraciones_aplicadas enable row level security;
