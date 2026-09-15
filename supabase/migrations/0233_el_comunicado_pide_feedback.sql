-- ============================================================
-- CRM EFAMEINSA · Migración 0233 · El comunicado pide feedback y va en imágenes
-- ============================================================
-- Santos, 14-09 por la noche, con las 4 láminas ya diseñadas: «se muestran de
-- manera interactiva en el pop-up, haciéndole clic va avanzando una a otra,
-- finaliza con la disposición de gerencia, y luego deben enviar un correo o
-- un WhatsApp con el feedback que encuentren de la web; después podrán
-- cerrarlo».
--
-- El comunicado gana a dónde va el feedback (correo y/o WhatsApp) y el acuse
-- guarda lo que cada persona escribió y por dónde lo mandó: aunque el
-- WhatsApp se abra en su teléfono, el texto queda en el CRM.
-- ============================================================

alter table public.comunicados
  add column if not exists feedback_correo   text,
  add column if not exists feedback_whatsapp text,   -- 51987654321, sin +
  add column if not exists feedback_pregunta text;

alter table public.comunicados_acuses
  add column if not exists feedback     text,
  add column if not exists feedback_via text,        -- 'correo' | 'whatsapp'
  add column if not exists feedback_at  timestamptz;

create or replace function public.feedback_comunicado(p_comunicado uuid, p_texto text, p_via text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_texto text := btrim(coalesce(p_texto, ''));
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if p_via not in ('correo', 'whatsapp') then raise exception 'Vía desconocida'; end if;
  if length(v_texto) < 10 then raise exception 'Escriba qué vio en la web: un enlace, una captura o una sugerencia. Una línea alcanza.'; end if;
  insert into comunicados_acuses (comunicado_id, perfil_id, leido_at, feedback, feedback_via, feedback_at)
  values (p_comunicado, auth.uid(), now(), v_texto, p_via, now())
  on conflict (comunicado_id, perfil_id) do update
    set feedback = v_texto, feedback_via = p_via, feedback_at = now();
end $$;
revoke all on function public.feedback_comunicado(uuid, text, text) from public;
grant execute on function public.feedback_comunicado(uuid, text, text) to authenticated;

-- El pendiente trae ahora el estado del acuse y a dónde va el feedback.
drop function if exists public.comunicado_pendiente();
create or replace function public.comunicado_pendiente()
returns table (
  id uuid, clave text, titulo text, laminas jsonb, enlace text, enlace_texto text,
  disposicion text, disposicion_boton text, feedback_correo text, feedback_whatsapp text, feedback_pregunta text,
  leido_at timestamptz, cumplido_at timestamptz, feedback_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.clave, c.titulo, c.laminas, c.enlace, c.enlace_texto, c.disposicion, c.disposicion_boton,
         c.feedback_correo, c.feedback_whatsapp, c.feedback_pregunta,
         a.leido_at, a.cumplido_at, a.feedback_at
    from comunicados c
    left join comunicados_acuses a on a.comunicado_id = c.id and a.perfil_id = auth.uid()
   where c.activo
     and c.vigente_desde <= now()
     and (c.vigente_hasta is null or c.vigente_hasta > now())
     and (
       a.perfil_id is null
       or ((c.disposicion is not null and a.cumplido_at is null or c.feedback_correo is not null and a.feedback_at is null)
           and coalesce(a.recordar_desde, a.leido_at) <= now())
     )
   order by c.vigente_desde
   limit 1;
$$;
revoke all on function public.comunicado_pendiente() from public;
grant execute on function public.comunicado_pendiente() to authenticated;

-- Las láminas de la web, ya como imágenes (public/comunicados/web-2026-09).
update comunicados
   set laminas = '[
     {"titulo": "¡Nuestra nueva web ya está en línea!", "imagen": "/comunicados/web-2026-09/1.webp", "imagen2x": "/comunicados/web-2026-09/1@2x.webp", "mini": "/comunicados/web-2026-09/1-mini.webp"},
     {"titulo": "Entra, explora y descubre.", "imagen": "/comunicados/web-2026-09/2.webp", "imagen2x": "/comunicados/web-2026-09/2@2x.webp", "mini": "/comunicados/web-2026-09/2-mini.webp"},
     {"titulo": "Tú aportas. Juntos mejoramos.", "imagen": "/comunicados/web-2026-09/3.webp", "imagen2x": "/comunicados/web-2026-09/3@2x.webp", "mini": "/comunicados/web-2026-09/3-mini.webp"},
     {"titulo": "Hagamos crecer nuestra presencia digital.", "imagen": "/comunicados/web-2026-09/4.webp", "imagen2x": "/comunicados/web-2026-09/4@2x.webp", "mini": "/comunicados/web-2026-09/4-mini.webp"}
   ]'::jsonb,
       feedback_correo   = 'soypuromarketing@gmail.com',
       feedback_pregunta = '¿Viste algo por mejorar en www.efameinsa.com? Envíanos el enlace, una captura o tu sugerencia.',
       disposicion       = 'Disposición de gerencia: cada persona entra a www.efameinsa.com, crea su cuenta con su usuario y contraseña, y la recorre. Quien vende los equipos tiene que conocer la web por la que hoy llegan los clientes.'
 where clave = 'web-2026-09';
-- Que salga otra vez a quien ya lo vio en texto: el de verdad es este.
delete from comunicados_acuses where comunicado_id = (select id from comunicados where clave = 'web-2026-09') and cumplido_at is null;
