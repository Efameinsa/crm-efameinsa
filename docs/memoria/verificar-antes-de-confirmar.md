---
name: verificar-antes-de-confirmar
description: "Antes de decirle a Darwin que algo ya funciona, hay que probarlo de punta a punta — no basta con probar la puerta"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f45e7f8f-fea2-4caf-a65f-21983e184bfe
  modified: 2026-08-29T17:17:48.690Z
---

**29-08-2026.** Reporté que las cuentas de gerencia podían rechazar un precio
bajo lista después de probar solo el **control de permiso** (una llamada que
reventaba antes de escribir). Darwin: *«¿estás seguro que el gerente ya puede
rechazar? verifica antes de confirmarle»*. Y además corrigió mi explicación con
un dato que yo no tenía: *«esa vista solo le aparece a los gerentes»*.

**Por qué:** él le va a repetir a una persona lo que yo le diga. Si le confirma
al ingeniero que ya puede y falla, pierde la confianza del usuario en el sistema
— y es de las pocas cosas que no se recuperan con un commit.

**Cómo aplicarlo:** probar el camino ENTERO, no la puerta. Acá fue armar
cotizaciones de práctica con la cuenta C0 y rechazarlas y aprobarlas con la
sesión real del gerente, y además ejecutar el rechazo **sobre la cotización real
dentro de una transacción con rollback** (`set local role authenticated` +
`request.jwt.claims`), que prueba el caso exacto sin escribir nada. Y cuando el
usuario aporta un dato que contradice mi teoría, revisar la teoría antes de
defenderla.

Relacionado: [[crm-permisos-null-en-la-base]].
