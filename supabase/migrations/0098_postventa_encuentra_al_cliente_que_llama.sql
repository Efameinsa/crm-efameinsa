-- ============================================================
-- CRM EFAMEINSA · Migración 0098 · Postventa encuentra al cliente que llama
-- ============================================================
-- Lo destapó el registro guiado de casos (plan 16 §6). Cuando el cliente llama
-- y su máquina todavía no está fichada —que hoy es lo normal: hay 10 equipos en
-- el parque instalado y años de máquinas en la calle—, el caso se registra
-- eligiendo el cliente a mano. Pero el área no podía encontrarlo: la política
-- de la 0081 solo le deja ver las cuentas sobre las que YA tiene un caso, y un
-- cliente que llama por primera vez, por definición, no tiene ninguno.
--
-- El resultado era un callejón sin salida: la pantalla pide elegir el cliente y
-- el buscador no devuelve nada.
--
-- LO QUE MANDA ES LA DECISIÓN D2 DEL 27-08, dicha comparando los dos oficios:
-- «yo como postventa sí tengo que ver el todo… pero tú como Ariana no puedes
-- ver la información». Por eso la puerta se le abre a `es_postventa()` —el
-- área, que atiende el teléfono de toda la empresa— y NO a `puede_postventa()`,
-- que incluiría a la comercial que además vende mantenimiento. Ella sigue
-- viendo su cartera y las cuentas donde tiene una oportunidad, como hasta hoy.
--
-- Y NO SE LE ABRE AL BANCO DE PRUEBAS. La 0092 se escribió justamente para
-- tapar esta fuga: la cuenta de práctica no puede ver clientes reales, ni
-- siquiera para buscar. Se queda con los suyos, que es todo lo que necesita
-- para practicar.
--
-- Ver la ficha no es tomarla: la cuenta sigue siendo del comercial que la
-- vendió (regla 1 del proyecto y migración 0080). Acá no se toca `comercial_id`
-- de nadie.

drop policy if exists cuentas_postventa_select on cuentas;
create policy cuentas_postventa_select on cuentas for select to authenticated
  using (
    (puede_postventa() and postventa_tiene_caso(id))
    or (es_postventa() and not es_cuenta_prueba())
  );

drop policy if exists contactos_postventa_select on contactos;
create policy contactos_postventa_select on contactos for select to authenticated
  using (
    (puede_postventa() and postventa_tiene_caso(cuenta_id))
    or (es_postventa() and not es_cuenta_prueba())
  );

comment on policy cuentas_postventa_select on cuentas is
  'El área de postventa ve el directorio de clientes porque atiende el teléfono de toda la empresa (D2, 27-08); el comercial que además vende mantenimiento, solo las cuentas donde ya tiene un caso (0095); y la cuenta de práctica, solo su banco (0092).';
