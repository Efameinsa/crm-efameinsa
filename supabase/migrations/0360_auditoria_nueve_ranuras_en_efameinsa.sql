-- 0360 (30-09-2026): las vistas de auditoría de gerencia pasan de 5 a 9 y de
-- ver1…ver5.crm.efameinsa.com a ver1…ver9.efameinsa.com.
--
-- Por qué cambia el nombre: con el CRM servido por el túnel de Cloudflare, el
-- certificado gratuito cubre *.efameinsa.com (un nivel) y no
-- *.crm.efameinsa.com (dos niveles). Por qué 9: lo pidió Santos el 30-09.
alter table auditorias_sesion drop constraint if exists auditorias_sesion_ranura_check;
alter table auditorias_sesion add constraint auditorias_sesion_ranura_check check (ranura between 1 and 9);

comment on table auditorias_sesion is
  'Quién de gerencia entró como quién, en qué ranura (ver1…ver9.efameinsa.com) y cuándo (0160, 0360). Solo lectura para gerencia y admin; escribe el servidor.';
