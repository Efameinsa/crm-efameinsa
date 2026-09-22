-- ============================================================
-- CRM EFAMEINSA · Migración 0264 · El que escribe con nombre de usuario
-- ============================================================
-- 22-09-2026, primer día de la campaña de LG Titan Max: de 35 conversaciones,
-- una («Anibal», PRO-09613) entró sin teléfono y sin chat, así que nadie pudo
-- contestarle. Meta ya no manda siempre el número: WhatsApp estrenó los
-- nombres de usuario y quien activa esa privacidad llega así —
--
--   "contacts": [{ "profile": { "name": "Anibal", "username": "anibal317" },
--                  "user_id": "PE.1656232456292725" }]
--   "messages": [{ "from_user_id": "PE.1656232456292725", ... }]   ← sin `from`
--
-- El webhook leía solo `from` y `wa_id`. Ahora acepta también el identificador
-- de usuario: la conversación se abre con ese identificador en la misma
-- columna `telefono` (es la llave con la que se responde a Meta) y el nombre
-- de usuario se guarda aparte para que en pantalla se lea «@anibal317» y no
-- un código. En `leads.telefono` NO se escribe ese identificador: esa columna
-- alimenta la búsqueda de duplicados por celular (celulares_de, 0201) y meter
-- ahí dígitos que no son un teléfono haría empatar fichas que no tienen nada
-- que ver. El contacto queda sin número, que es la verdad, y el comercial se
-- lo pide por el chat.
-- ============================================================

alter table wa_conversaciones add column if not exists usuario_wa text;

comment on column wa_conversaciones.usuario_wa is
  'Nombre de usuario de WhatsApp (sin @) cuando la persona oculta su número (0264). Si está, en pantalla se muestra este en lugar de telefono.';

comment on column wa_conversaciones.telefono is
  'E.164 sin el signo + (51999888777) o, si la persona escribe con nombre de usuario y oculta su número, el identificador que manda Meta (PE.1656…). Es la llave con la que se le responde.';
