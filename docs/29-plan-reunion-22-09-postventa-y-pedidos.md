# Plan de acción — reunión del 22-09-2026 (12:37) y lo que sigue pendiente de las reuniones del 21 y 22

**Para quien lo ejecute (una sesión de Claude Sonnet):** este documento es autosuficiente. Cada
ítem trae qué dijo el ing. Carlos (cita de la transcripción), qué hay hoy en el código (archivo y
función), qué hay que hacer, cómo se prueba y cómo se verifica en producción. Ejecutar **en el
orden dado**; los ítems 1 a 4 son los que más se notan en la reunión de mañana.

Transcripciones: `Downloads/22-09-2026 12.37 - parte 1 de 3.txt`, `… parte 2 de 3.txt`,
`Downloads/22-09-2026 11.00.txt`, `Downloads/21-09-2026 10.06.txt` y `10.31.txt`.
Lo ya aplicado de esas reuniones está en `docs/historial/20-reunion-15-09-y-formatos-de-lesly.md`
(secciones 21-09 y 22-09) y en las migraciones 0259 a 0269. **No repetir nada de eso.**

---

## 0. Reglas de la casa (leer antes de tocar nada)

- Worktree: `C:\Users\diseno\Projects\crm-main-tmp`, rama `main`. Otra sesión puede empujar a
  `main` al mismo tiempo: **antes de cada push** `git fetch && git rebase origin/main`.
- **Stagear archivo por archivo** (`git add <ruta>`), nunca `git commit -a` ni `git add .`: la
  carpeta tiene scripts sueltos sin trackear que no deben entrar.
- Migraciones en `supabase/migrations/`, numeradas: la siguiente libre es **0270**. Se aplican con
  `npm run db:migrar` (idempotente). **Nunca reescribir una función SQL de memoria**: volcarla con
  `node --env-file=.env.local scripts/_fn.mjs <nombre_funcion>` y parchar solo el bloque que
  cambia (ver cómo se hizo en 0267 y 0268). Copiar una función de una migración vieja revive
  reglas ya revertidas.
- Índice único de `equipos_instalados` es sobre la EXPRESIÓN `upper(btrim(serie))`: cualquier
  `on conflict` sobre esa tabla va como `on conflict ((upper(btrim(serie))))`.
- Un archivo `"use server"` (todo `src/lib/acciones/*.ts`) solo puede exportar funciones
  `async`. Constantes, tipos con valor y helpers síncronos van en `src/lib/*.ts`.
- Constantes exportadas desde un archivo `"use client"` rompen las páginas de servidor: van en
  `src/lib/`.
- Lint que muerde: `react-hooks/set-state-in-effect` (usar `useSyncExternalStore`),
  `react-hooks/purity` (mover consultas a funciones auxiliares). Correr
  `npx tsc --noEmit -p .` y `npx eslint <archivos tocados>` antes de cada commit.
- Después de sembrar con un RPC dentro de un render, una consulta idéntica devuelve vacío (Next
  memoriza el fetch): cambiar el filtro (ver `equiposDelPedido` en `src/lib/acciones/postventa.ts`).
- Despliegue: `git push origin main` → `SHA=$(git rev-parse HEAD) node --env-file=.env.local
  scripts/_esperar-despliegue.mjs` → `node --env-file=.env.local scripts/_humo-produccion.mjs`
  (tiene que decir `38 ok, 0 mal`; si toca añadir rutas, agregarlas ahí).
- Verificar **con la cuenta de quien lo va a usar**, no con admin:
  `export MSYS_NO_PATHCONV=1; COMO=<correo> RUTA=/ruta node --env-file=.env.local
  scripts/_pantallazo.mjs` (imagen en `scripts/data/_pantallazos/`), o
  `COMO=<correo> RUTA=/ruta SALIDA=archivo node --env-file=.env.local scripts/_bajar-como.mjs`
  para PDF/HTML. Cuentas: `postventa@efameinsa.com` (PV, Rubí), `almacen@efameinsa.com`,
  `comercial1@` (Brenda C1), `comercial4@` (Ariana C4), `comercial5@` (Katerine C5),
  `admin@efameinsa.com`. PV2 (Gabriela) es el perfil «Postventa 2»; buscar su correo con
  `auth.admin.getUserById`.
- Mensajes de commit en castellano, con el porqué y la cita de quien lo pidió; al final las dos
  líneas de atribución que da el sistema. Documentar cada tanda en
  `docs/historial/20-reunion-15-09-y-formatos-de-lesly.md` (sección nueva por fecha).
- Los mensajes de error de la base **no** se muestran crudos al usuario: traducir (ver
  `enCastellano()` en `src/lib/acciones/postventa.ts`).

---

## 1. Central convierte el cierre en PEDIDO con las series (prioridad máxima)

**Qué dijo Carlos (parte 1):** «Ahora la central tiene que tener un paso más: el cierre es lo
mismo, pero lo va a convertir en pedido. ¿Cómo lo va a convertir? Con el número de serie […] y
este pedido, recién ahí es donde sube la liquidación y el ok, ya no en el cierre, sino en el
pedido, y con eso recién ahí va a postventa. […] Para que la Central ingrese la serie del
equipo, la descripción, suba la liquidación y dé el ok para que avance. Ese es nuestro punto de
partida.» Y el 21-09: «cuando ingrese el pedido, la serie… Está con la serie: significa que hay
stock. La secadora: no stock».

**Qué hay hoy:**
- Central libera el pedido en `/central/cierres` con dos checks (`liberarPedido` en
  `src/lib/acciones/postventa.ts`, migración 0087): pedido ejecutado + liquidación → nace
  `servicios_postventa` y postventa recibe aviso. **No pide series.**
- Las series se registran después, en `pedido_equipos` (0260): postventa o almacén, en
  `src/components/crm/equipos-del-pedido.tsx` (`registrarSerieDelEquipo`).
- La lista de equipos se siembra la primera vez que alguien abre el pedido
  (`sembrar_equipos_del_pedido`).

**Qué hacer:**
1. En la pantalla de Central donde libera el pedido, **sembrar la lista de equipos al momento de
   liberar** (llamar `sembrar_equipos_del_pedido` dentro de `liberarPedido`, o un RPC nuevo que
   lo haga en la misma transacción) y mostrar la lista `EquiposDelPedido` en modo nuevo
   `"central"`: por cada unidad vendida, campo **serie** (opcional por unidad) y marca «sin
   stock» cuando queda vacía. Central escribe las series que le dio el almacén por correo/WhatsApp
   (es lo que hace hoy a mano).
2. El paso «liquidación + ok» queda igual, pero el aviso a postventa debe decir cuántas unidades
   tienen serie y cuántas no («2 equipos: 1 con serie, 1 sin stock»).
3. RLS/RPC: `registrar_serie_del_equipo` hoy exige `puede_postventa() or es_backoffice() or
   es_almacen()`. Central es backoffice → ya puede. Verificar con la cuenta de Central.
4. En `/postventa/pedidos/[id]` y `/almacen/pedidos/[id]` no cambia nada: ya leen
   `pedido_equipos`.

**Prueba:** con un cierre de práctica (cuenta `es_prueba`), liberar desde Central poniendo serie
en 1 de 2 unidades → postventa ve «1 con serie · 1 sin stock» y el almacén ve la serie ya puesta.
**Verificar:** pantallazo de `/central/cierres` como Central, de `/postventa/pedidos/<id>` como
`postventa@` y de `/almacen/pedidos/<id>` como `almacen@`.

---

## 2. Doble filtro del despacho: postventa programa, el almacén ve en ROJO lo que falta

**Qué dijo Carlos (parte 1):** «Tú programas el despacho, pero de nada se va a despachar. No
debería permitirte despachar si no ha cumplido los otros pasos. […] Al almacén tendría que
aparecerle: si hay programación del despacho para el 30, perfecto, pero me sale con rojo, o sea
que postventa no ha cumplido. Si no ha cumplido, no puedo hacer nada. Eso sería el condicional.
[…] Entonces ya está claro que sí puedes hacer la programación del despacho.»

**Qué hay hoy:**
- Postventa puede programar sin cumplir pasos (a propósito, 21-09: «todo lo programamos
  unilateralmente»). `programarDespacho` en `src/lib/acciones/postventa.ts`.
- El almacén solo tiene el candado «Sin apertura de despacho no sale nada del almacén»
  (`puedeSalir` en `src/components/crm/pedido-almacen.tsx`).
- `faltaParaApertura(s)` en `src/lib/postventa.ts` ya calcula qué falta (pago según condición,
  prueba, plano, dirección).

**Qué hacer:**
1. En `pedido-almacen.tsx`, la tarjeta «Despacho programado para el …» pasa a tener **tono
   rojo** cuando `faltaParaApertura(s)` no está vacío o no hay `apertura_despacho_at`, con el
   texto «Postventa todavía no cumplió: <lista de lo que falta>. No se prepara ni sale hasta que
   esté.» y el botón «Estamos listos» deshabilitado. En verde cuando está todo.
2. En la lista `/almacen/pedidos` y en «Mi día» del almacén, el mismo semáforo por fila (rojo /
   verde) usando `faltaParaApertura`.
3. En `/postventa/pedidos/[id]`, al programar sin haber cumplido, un aviso ámbar (no bloqueo):
   «Programado. El almacén lo ve en rojo hasta que estén: …».
4. Calendario de postventa: el evento «Despacho · programado, almacén sin confirmar» lleva un
   punto rojo si falta algo (`eventosDePedido` en `src/lib/calendario-postventa.ts`; añadir un
   campo `trabado: string | null` al `EventoCalendario` y pintarlo en `calendario-postventa.tsx`).

**Prueba:** pedido de práctica sin pago confirmado → programar → almacén lo ve rojo con «falta la
confirmación de Finanzas»; confirmar pago, prueba, plano, dirección y apertura → verde.
**Verificar:** pantallazos de `/almacen/pedidos/<id>` en ambos estados como `almacen@`.

---

## 3. La derivación a postventa NO abre un caso suelto cuando ya hay pedido: postventa clasifica

**Qué dijo (parte 2):** Lesly: «Comercial 1 dice garantía, comercial 2 dice consulta técnica…
todos me van a llegar y me van a generar varios casos. Yo lo tengo allí y yo tengo que
generarme el caso.» Carlos: «Más bien lo centralizamos, porque ustedes son las que van a
recibir. […] Él es el triaje.» Y sobre Titan: «Dice solicitud, registro… esto es una atención
técnica, no es una puesta en marcha. […] Acá se está capturando un caso cuando esto es
repetitivo, de despacho, en pedidos.» Santos: «Lo de que no le aparezca, eso lo podemos
solucionar.»

**Qué hay hoy:**
- Central deriva a postventa eligiendo el tipo (`sugerido_atencion`) y la 0132 crea la
  `atencion` con ese tipo al asignar (`insert into atenciones` en
  `supabase/migrations/0132_la_atencion_entra_por_central.sql`, dentro de `asignar_lead`).
- Si el cliente tiene un `servicios_postventa` abierto (pedido en circuito), la llamada «¿cuándo
  sale mi máquina?» abre una atención tipo puesta en marcha **aparte del pedido**, y postventa
  ve dos cosas que son la misma.
- El tipo ya es editable en la atención (`src/app/(app)/postventa/atenciones/[id]`).

**Qué hacer (migración 0270 + UI):**
1. En `asignar_lead` (parchar sobre la definición viva), cuando `p_tipo_postventa is not null`
   y la cuenta tiene un `servicios_postventa` con `cerrado_at is null` y `despachado_at is null`
   o `puesta_en_marcha` pendiente: **no crear atención**; enganchar el lead al pedido
   (`leads.servicio_id` — columna nueva si no existe — y una nota en `servicios_postventa`
   tipo «El cliente escribió el 22-09 por Central: <mensaje>»), avisar a postventa con enlace al
   pedido. El expediente (oportunidad de postventa) sí se crea/consolida como hoy (0267).
2. Cuando NO hay pedido abierto: crear la atención como hoy, pero en etapa «por clasificar»
   (nueva etapa o marca `clasificada_at null`): en la bandeja de postventa esas salen arriba con
   el botón «Clasificar» (elige tipo: garantía / soporte / mantenimiento / repuesto / puesta en
   marcha) y recién ahí entra al circuito. Es el «yo tengo que convertirlo a un caso».
3. En `/postventa/pedidos/[id]` mostrar «Lo que el cliente dijo por Central» con las llamadas
   enganchadas (quién registró, cuándo, texto).

**Prueba:** cliente de práctica con pedido abierto → Central deriva «puesta en marcha» → no nace
atención; el pedido muestra la llamada. Cliente sin pedido → nace atención «por clasificar»;
postventa la clasifica como repuesto y sigue.
**Verificar:** pantallazos de la bandeja de postventa y del pedido como `postventa@`.

---

## 4. Los contactos del cliente se ELIGEN, no se vuelven a tipear

**Qué dijo Carlos (parte 2):** «Rivera cierto verda… le ha puesto un apellido más… acá con
minúscula. Cada vez que lo escribe le pone otro nombre. Más bien agrega el contacto: hoy ingresa
su esposa, agregas el contacto, y para la siguiente oportunidad solo jalas el nuevo contacto. No
tienes que volver a escribirlo. ¿Y si es otra persona? Registras el nuevo contacto.» Y sobre
Freddy: «Se le cayó su teléfono y perdió todo… en el cierre solo está el 1003, no hay otro
contacto.»

**Qué hay hoy:**
- «Pasar contacto a Central» (`src/components/crm/pasar-contacto-central.tsx`) y «Registrar
  contacto» (`registro-caso.tsx`) tipean nombre y teléfono libres. Hay búsqueda de EMPRESA en la
  cartera propia (`buscarCoincidencias`), no de contactos.
- Los contactos viven en `contactos` (cuenta_id, nombre, cargo, telefono, email, es_principal).
- La 0201 (`celulares_de`) empareja por celular al derivar; la 0236 crea contacto con correo.

**Qué hacer:**
1. En ambos formularios, cuando la empresa se elige de la cartera (o el teléfono tipeado ya está
   en `contactos` de una cuenta del usuario), mostrar un selector **«¿Quién llama?»** con los
   contactos de esa cuenta (nombre · cargo · teléfono) y la opción «Otra persona → agregar
   contacto» que abre nombre + cargo + teléfono y lo **guarda en `contactos`** al enviar.
2. Al elegir un contacto existente, `nombre_contacto` y `telefono` se rellenan y quedan
   bloqueados (editable con «cambiar»).
3. Si el teléfono tipeado es nuevo pero la cuenta ya existe, al enviar se agrega como contacto
   nuevo de esa cuenta (es el caso de Freddy con celular nuevo).
4. En el cierre (`/comercial/informes/nuevo`), los contactos del cierre se eligen de la misma
   lista, con «agregar», y se guardan en `contactos` (hoy `contacto_despacho` es un JSON suelto:
   además de guardarlo, crear el contacto).
5. Aviso opcional de escritura: si el nombre tipeado difiere solo en mayúsculas/acentos de un
   contacto existente, sugerirlo.

**Prueba:** en la cuenta de Rivera (C5), registrar una llamada de «Freddy» con número nuevo →
queda como contacto; la segunda vez aparece en el selector; nada se tipea dos veces.
**Verificar:** pantallazo del formulario como `comercial5@` con el selector desplegado, y
`select * from contactos where cuenta_id = <Rivera>` con las dos personas.

---

## 5. Detectar un RUC escrito dentro del nombre y mandarlo a su casilla

**Por qué:** el caso Huamán Ruiz del 22-09 (ver `docs/historial/20…`, sección 22-09 11:00):
Brenda escribió «20600852893 - INVERSIONES HUAMAN RUIZ S.R.L» en **nombre de contacto** y el RUC
quedó vacío → nació una ficha sin RUC y el cliente no se reconoció. Carlos: «hay que consolidarlo».

**Qué hacer:** en `pasar-contacto-central.tsx` y `registro-caso.tsx`, al perder el foco de
nombre/empresa, si el texto contiene `\b(10|20)\d{9}\b` y el campo RUC está vacío: mover el
número a RUC, dejar el resto como empresa (si estaba en nombre de contacto, dejar solo la parte
que no es empresa) y mostrar «Se detectó un RUC: lo pasamos a su casilla. Revise.» Servidor:
en `registrarContacto` (`src/lib/acciones/leads.ts`) la misma limpieza como red de seguridad.
**Prueba:** pegar «20600852893 - INVERSIONES HUAMAN RUIZ S.R.L / RUIZ PANGALIMA» en nombre → RUC
20600852893, empresa INVERSIONES HUAMAN RUIZ S.R.L, contacto RUIZ PANGALIMA; al derivar, engancha
con la ficha con ese RUC.

---

## 6. La agenda y el reporte diario de postventa dicen QUÉ ESTÁ PENDIENTE por tipo

**Qué dijo Carlos (parte 1):** «Acá sí tiene que estar un poco más completo de las actividades.
El calendario está todo consolidado, pero en realidad está pendiente del despacho, pendiente de
videollamadas, servicio técnico, pendiente de mantenimiento preventivo. Hay varios puntos que
se tienen que ver acá. […] Si es en Lima, tenemos que hacer una videollamada previamente para
verificar que tenga todas las instalaciones» (Titan: cierre del 15, 7 días sin contacto).

**Qué hay hoy:** el reporte diario de postventa trae lo de hoy y lo de mañana
(`src/app/api/reportes/diario/route.tsx`, `cargarEventosPostventa`). La agenda tiene «El día del
área» (`el-dia-del-area.tsx`) con 4 números.

**Qué hacer:**
1. Función `pendientesDePostventa(supabase, perfil)` en `src/lib/agenda-postventa-datos.ts` que
   devuelva listas con cliente, equipo, desde cuándo y enlace, por tipo:
   - **Despachos pendientes**: pedidos sin `despachado_at` (separar «sin fecha» / «con fecha»).
   - **Videollamadas de preinstalación pendientes**: pedidos con `modalidad = 'lima'`,
     `esEquipo`, sin `preinstalacion_ok_at` (columna existente, con `preinstalacion_nota`) y
     sin puesta en marcha. No hace falta columna nueva.
   - **Puestas en marcha pendientes**: despachados sin `puesta_en_marcha` cerrada.
   - **Atenciones sin programar** (`etapa = 'diagnostico'`).
   - **Preventivos por vencer**: `equipos_instalados.proximo_mantenimiento` ≤ 15 días sin caso.
2. En la agenda de postventa, un panel «Pendiente por tipo» con conteos y listas plegables
   (patrón `SeccionPlegable`).
3. En el reporte diario (solo perfiles postventa), sección **«5b. Pendientes del área»** con esos
   mismos bloques (máximo 10 filas por bloque, «y N más»).
4. En el circuito del pedido (`bloquesPedido`, `src/lib/postventa.ts`), para Lima y equipo,
   añadir el paso «Videollamada de preinstalación hecha» (responsable postventa) antes de la
   puesta en marcha; se marca desde el pedido con fecha y con quién se habló.

**Prueba:** Titan (Lima, equipo, sin videollamada) aparece en «Videollamadas pendientes» y en el
reporte; al marcarla en el pedido, desaparece.
**Verificar:** `COMO=postventa@ RUTA="/api/reportes/diario?fecha=<hoy>" SALIDA=x.pdf …
_bajar-como.mjs` y leer el PDF; pantallazo de `/postventa/agenda`.

---

## 7. Liberar los pedidos de Herrera y Rivera para rehacer las fotos de prueba (dato, no código)

**Qué dijo (parte 2):** Santos: «Hay que liberarlo, sí. De Herrera y de Rivera. […] Ayer subimos
fotos de la prueba y embalaje. Vamos a dejar eso como que falta, para subir nuevamente. Han sido
imágenes de prueba.»

**Qué hacer (con confirmación de Santos antes, porque borra trabajo del almacén):**
- Pedidos `6aa02f79…` (HERRERA AVILA YESSENI LUZBITH) y `38abceb0…` (RIVERA CIERTO BERTHA
  FABIOLA). Para cada uno: `protocolo_fotos = '[]'`, `prueba_lista_at = null`,
  `prueba_lista_por = null`, `protocolo_prueba_ref = null` en `servicios_postventa`, y en
  `pedido_equipos` de ese pedido `prueba_lista_at = null`, `protocolo_fotos = '[]'`.
- **Cuidado:** Herrera ya está `despachado_at` (salió el 21 con 5 fotos de salida, esas se
  quedan). Rivera sale hoy 22 a las 2 pm: liberar la prueba la deja «sin probar» y el almacén
  tendrá que volver a marcar antes de registrar la salida. Hacerlo solo si Santos confirma la
  hora.
- Dejar el script en `scripts/_liberar-prueba-pedido.mjs` (recibe el id) para no repetirlo a mano.

---

## 8. Apertura de despacho: que Rubí la EMITA desde el sistema (capacitación + dos ajustes)

**Qué dijo (parte 1):** Carlos: «Ya no trabajes como en Word, porque lo tenemos aquí. Te da ya
todo el formato listo, lo tomas y lo envías.» Rubí: «No he hecho ninguna apertura como tal en el
sistema». Y Tunupa figura «Apertura de servicio emitida» aunque ella dice que no la generó.

**Qué hay hoy:** `/postventa/pedidos/[id]/apertura` arma el correo (asunto + cuerpo) con
`filasApertura` (`src/lib/apertura-servicio.ts`) y `apertura_despacho_at` se marca al «Emitir».
Verificado el 22-09: las aperturas de la semana las emitió la propia cuenta de Rubí (PV:
Tunupa ×2 el 18 y 19, Duo Lavandería el 19, Bungarena el 21) y Gabriela (PV2: Rivera y
Herrera el 21). O sea, **sí las está emitiendo desde el sistema**, solo que no lo identifica
como «la apertura» porque no obtiene el documento: lo que le falta es el PDF/copiar (punto 2).

**Qué hacer:**
1. Mostrar en el pedido y en la apertura «Emitida por X el …» (`apertura_despacho_por` ya
   existe; hoy solo se muestra la fecha).
2. Botón «Copiar correo» y «Descargar PDF» en la apertura (hoy solo se ve en pantalla): el PDF
   sale con `@react-pdf/renderer` como el cierre (`src/lib/pdf/informe-cierre-pdf.tsx` como
   modelo), con el formato de las 9 filas.
3. Registrar en el pedido cuándo se mandó el correo al almacén y al cliente (dos marcas de
   tiempo con «marcar enviado»).
4. **Capacitación** (no código): el circuito es dirección → apertura → programar. Santos se lo
   muestra a Rubí con un pedido real.

---

## 9. La ficha del cliente muestra «posibles fichas relacionadas» también a postventa

**Qué dijo Carlos (11:00):** «A mí cuando han derivado un cliente relacionado a otro me aparece
por defecto: dos relacionados, y yo puedo abrir. Acá Ruiz Pangalima solamente aparece él.»

**Qué hay hoy:** el panel de relacionados del expediente comercial se arma por RUC/teléfono; con
nombres distintos y sin RUC no hay nada que relacionar (caso Huamán Ruiz, tres fichas).

**Qué hacer:** en el expediente, sección «¿Es el mismo cliente?» con candidatas por **apellido
raro compartido** (tokens de ≥ 6 letras que no sean palabras genéricas: S.R.L, INVERSIONES,
HOTEL…) y por **mismo distrito + rubro**, cada una con botón «Unir a esta ficha» (usa el flujo
existente de «Ya es cliente», 0141) que **pide código de operaciones** (PIN) porque une carteras.
Solo se muestra cuando la ficha actual no tiene RUC. **No unir automáticamente.**

---

## 10. Pendientes menores que salieron en las mismas reuniones

- **Contacto por nombre de usuario de WhatsApp** («@anibal3127»): no se puede llamar; en el chat
  mostrar el aviso «Este cliente ocultó su número: pídale por chat un número para llamarlo» y que
  «Copiar número» no aparezca cuando `telefono` no es un número real (`esTelefonoDeVerdad`).
- **Tipificación de WhatsApp**: Carlos quiere dejar tres (interesado / no interesado / número
  equivocado) «porque solo retroalimenta a Meta», pero cerró con «déjame pensarlo». Katerine pidió
  «No contesta» (ya está). **Esperar la decisión; no cambiar.**
- **Bitácora libre de postventa** («Otras gestiones de hoy»): Carlos dijo que «va a estar
  aperturada solo unos días». Cuando lo pida, se quita el panel de `/postventa/agenda`.
- **Rubí ve el expediente de Huamán Ruiz sin la alerta «pidió dos veces»** (parte 2): revisar
  con `postventa@` que `/comercial/oportunidades/c2c4636d-a7b2-4209-9325-c43641b23def` muestre
  «El cliente volvió a escribir por WhatsApp» (ya se verificó el 22-09 por la tarde; si ella no lo
  ve, es caché del navegador: recargar con Ctrl+F5).
- **Unir las tres fichas de Inversiones Huamán Ruiz** cuando Gabriela confirme con el file:
  `70965099…` (con RUC, de C4) absorbe a `116555a7…` (RUIZ PANGALIMA) y a `15386142…`
  («- HOSPEDAJE MIGUEL ANGEL», de C5). Mover oportunidades, contactos, atenciones y
  servicios_postventa; conservar la cartera de C4. Dejar script en `scripts/_unir-fichas.mjs`.
- **59 pedidos «en cola» del Excel** que Rubí tiene que depurar: darle en `/postventa/pedidos` un
  filtro «anteriores al circuito» (sin `informe_cierre_id`) con botón «Cerrar como entregado»
  masivo con fecha, para limpiar en una tarde.
- **Chat comercial ↔ postventa**: Carlos lo descartó por ahora («se van a jalar los pelos»).
  No hacer.

---

## Orden sugerido y estimación

| # | Ítem | Tamaño | Migración |
|---|------|--------|-----------|
| 1 | Central convierte cierre en pedido con series | medio | no (usa 0260) |
| 2 | Doble filtro rojo/verde en almacén | chico | no |
| 3 | Derivación a postventa sin caso suelto + «por clasificar» | grande | 0270 |
| 4 | Contactos se eligen, no se tipean | medio | no |
| 5 | RUC dentro del nombre | chico | no |
| 6 | Pendientes por tipo en agenda y reporte | medio | quizá (llamada de preinstalación) |
| 7 | Liberar Herrera/Rivera | dato | no |
| 8 | Apertura: PDF, copiar, marcas de envío | chico | no |
| 9 | Fichas relacionadas por apellido | medio | no |
| 10 | Menores | chicos | no |

Cada ítem se despliega por separado (commit propio, humo, pantallazo) y se anota en
`docs/historial/20-reunion-15-09-y-formatos-de-lesly.md`. Al terminar todo, actualizar
`docs/19-estado-y-continuidad.md`.
