-- ============================================================
-- CRM EFAMEINSA · Migración 0234 · El feedback va al correo corporativo
-- ============================================================
-- Santos, 15-09: «soypuromarketing@gmail.com es mi cuenta personal, no
-- debería estar; todo correo debe salir de corporacionefameinsa.sa@gmail.com».
-- El remitente ya era ese (la credencial de Gmail del n8n); lo que estaba
-- en la cuenta personal era el DESTINO del feedback (0233) y el contacto de
-- su perfil. Los dos pasan al corporativo.
-- ============================================================
update comunicados set feedback_correo = 'corporacionefameinsa.sa@gmail.com' where feedback_correo = 'soypuromarketing@gmail.com';
update perfiles set email_contacto = 'corporacionefameinsa.sa@gmail.com' where email_contacto = 'soypuromarketing@gmail.com';
