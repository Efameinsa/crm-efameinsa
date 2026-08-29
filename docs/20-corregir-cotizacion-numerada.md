# Corregir una cotización ya numerada — mapa de la experiencia

**Escrito el 29-08-2026.** Diseño de la pantalla que pidió el ing. Carlos en la
reunión del 28-08 (transcripción `28-08-2026 14.19.txt`). Todavía no está
construido: esto es lo que se va a construir y por qué cada cosa está donde
está.

---

## 1. El problema, en una frase

Una cotización emitida gasta un número de su serie, ese número sale al cliente
—y muchas veces **al banco**— y hoy la única forma de corregir un error es
emitir otra, que sale con el número siguiente.

### Por qué el número no se puede mover

> «no puedes variar el número, sobre todo mucho ocurre con el **banco, que es
> leasing, y tenemos varios leasing**. Al banco no le puedes dar otra
> numeración. **Un número más, se demora un mes más en que salga la operación.**
> Le tienes que dar exactamente el mismo número.»
> — ing. Carlos, 28-08

No es prolijidad administrativa: mandarle al banco la 501 en lugar de la 500
corregida le cuesta a la empresa **un mes de financiamiento**.

### Con qué frecuencia

Cinco a diez veces al año sobre unas 3.000 cotizaciones. Él mismo puso la
prioridad: *«mapeémoslo, eso no es urgente… pero para que lo pongamos en agenda,
porque sí ocurre»*. **De ahí sale la regla de diseño principal de este
documento: la pantalla tiene que ser obvia para alguien que la usa una vez cada
dos meses.** No se aprende, no se recuerda, no se consulta un manual: se abre y
se entiende.

### El caso que lo destapó

Una cotización de Lesly (OPEN 500-26) llevaba el equipo equivocado: el cliente
pidió **apilable** y el documento decía **no apilable**. Se salvó porque todavía
no había salido al cliente —se hizo la 501 y el cierre N.º 1 se anuló—, pero
Carlos dejó planteado el otro caso, el que no tiene salida.

---

## 2. Quién hace la corrección

En la reunión se dijeron dos cosas que conviene no confundir:

> «Esa opción también debería pedir autorización, o sea, **no lo tiene que hacer
> el gestor**. Si tu gestor quiere modificar esta cotización, viene el
> administrador, pone la clave y ya modifica.»

> «Necesitaría **una vista que Leslie pueda configurar** para poder editar esos
> campos… O sea, abrir la cotización. **Sí, Leslie tendría esa opción.**»

Lo firme es lo primero: **el comercial no corrige lo suyo**, que es la misma
regla que ya gobierna anular un cierre y corregir una derivación (`docs/19` §3).
Lo segundo define dónde vive la pantalla: **en la cuenta de operaciones**, el
puesto de Lesly (*administrador de autorizaciones en la parte operativa*, sus
palabras).

**Decisión de diseño:** la corrección la ejecuta **operaciones**, y el comercial
la **pide**. Así el motivo lo escribe quien conoce el error —el comercial habló
con el cliente, Lesly no— y la mano que toca el documento es la que tiene la
autoridad. Gerencia y admin entran igual que operaciones.

> **Pendiente de confirmar con Carlos:** si Lesly ejecuta y Lesly dicta el
> código, el código sobra — ella *es* la autorización. Queda por decidir si su
> propia corrección necesita además el código de gerencia (segunda llave) o si
> basta con que quede firmada con su nombre. Este documento asume lo segundo;
> cambiarlo es agregar un campo, no rehacer la pantalla.

---

## 3. El recorrido, de punta a punta

Cinco pasos. Ninguno tiene vocabulario de sistema.

```
   El comercial                     Operaciones (Lesly)
   ────────────                     ───────────────────
 1 Pide la corrección   ──────►  2 La ve en su lista
   (desde su cotización)            «Corregir cotizaciones»
   escribe qué está mal                    │
                                           ▼
                                  3 Abre la cotización
                                    y la corrige
                                    · clic en el equipo → buscador
                                    · cantidad, precio, color
                                    · entrega, garantía, pago
                                           │
                                           ▼
                                  4 Ve qué cambia y el PDF real
                                    antes de guardar
                                           │
 5 Le llega la campanada  ◄──────────────┘
   con el PDF corregido,
   mismo número
```

### Paso 1 — El comercial pide la corrección

En la cotización ya confirmada (`CotizacionConfirmada`, la pantalla que hoy dice
*«el documento queda cerrado: para cambiarle algo hay que duplicarla»*) aparece
un segundo camino:

- **Duplicar** — sigue siendo lo normal y lo primero. Sirve para el 99 % de los
  casos: el cliente cambió de idea, se cotiza de nuevo con número nuevo.
- **Pedir una corrección** — en letra más chica, debajo, con el motivo escrito:
  *«solo cuando el número no se puede cambiar (leasing, expediente ya
  presentado)»*. Se abre un cuadro con una sola pregunta: **¿qué está mal?**

El texto del botón le enseña al comercial cuándo usarlo sin que nadie se lo
explique. Es el mismo recurso que ya usa «Anular» frente a «Eliminar».

### Paso 2 — La lista: «Corregir cotizaciones»

Entrada nueva en la barra lateral de operaciones, debajo de «Autorizaciones»:

```
  Autorizaciones            (existe)
  Corregir cotizaciones     ← nueva
  Permisos                  (existe)
  El catálogo               (existe)
  Listas del sistema        (existe)
```

La pantalla tiene **dos partes**, y la de arriba es la que la hace útil:

**Pedidos pendientes** — lo que los comerciales pidieron corregir y todavía nadie
tocó. Vacío casi siempre; cuando hay algo, es lo primero que se ve, con el
motivo que escribió el comercial. Cero pedidos se dice sin drama: *«no hay nada
pendiente de corregir»*.

**Buscar cualquier cotización** — el mismo buscador de «Mis cotizaciones»
(`/comercial/cotizaciones`), pero sobre **todas**, no solo las de un comercial.
Se busca **por número**, que es como las nombran hablando («la 500-26»), y por
cliente. Cada fila:

```
  N.º 500-26 · Open      INVERSIONES NACIONALES TURÍSTICAS S.A.
  Lesly Ríos · 28-08-2026 · US$ 12.450,00              [ Corregir ]
```

Y si ya se corrigió alguna vez, lo dice en la misma fila: `corregida 1 vez`.

**Lo que NO aparece acá:** los borradores (esos los arregla el comercial solo, no
gastaron número) y las cotizaciones del archivo histórico (son PDF del pasado,
no hay nada que regenerar). Si alguien busca una del archivo, la fila lo dice en
vez de callarse.

### Paso 3 — La pantalla de corrección

Es **el cotizador que ya existe** (`pantalla-cotizador.tsx`), con otro traje. Que
sea el mismo importa: Lesly ya cotiza, ya conoce esa pantalla, y una pantalla
que se usa seis veces al año no puede tener reglas propias.

Arriba, una franja granate que no deja dudar de dónde está uno:

```
  ┌────────────────────────────────────────────────────────────────┐
  │  Corrigiendo la cotización N.º 500-26 · Open                   │
  │  El número, el cliente y la fecha no cambian.                  │
  │  Es de Lesly Ríos · INVERSIONES NACIONALES TURÍSTICAS S.A.     │
  └────────────────────────────────────────────────────────────────┘
```

**Lo que se puede tocar**, y nada más:

| Se corrige | No se toca |
|---|---|
| El equipo de cada línea | El número y la serie |
| Cantidad, precio, color | El cliente |
| La descripción escrita a mano | El comercial dueño |
| Entrega, garantía, forma de pago, saldo | La fecha de emisión |
| Condiciones y vigencia | |

Lo de la derecha es la **identidad del documento**: es lo que el banco ya tiene.
No aparece como campo bloqueado —aparece como dato impreso, sin caja de texto—,
porque un campo gris invita a intentarlo.

#### El clic en el equipo — el corazón de la pantalla

Esto es lo que hace que la corrección sea un gesto y no un formulario. Cada
línea de la cotización es **un botón**:

```
  ┌──────────────────────────────────────────────────────────────┐
  │ [foto] LAVADORA TITAN — 25 kg — no apilable      cambiar ⇄   │
  │        LAVMA172 · 1 unidad · US$ 8.999,00                    │
  └──────────────────────────────────────────────────────────────┘
           ↑ un clic en cualquier parte
```

Un clic y se abre **el mismo `BuscadorEquiposModal` del cotizador** —la ventana
grande de 1024 px con foto, ficha y stock que se hizo el 25-08 porque *«los
nombres son largos… una imagen pequeñita y algunas características clave»*— pero
en **modo reemplazar**:

- El título dice qué se está haciendo: **«Cambiar el equipo de la línea 1»**, y
  debajo, chiquito, el que está puesto ahora.
- El buscador **abre escrito** con el modelo actual (`titan`), porque el 90 % de
  las veces el reemplazo es la variante de al lado: apilable en vez de no
  apilable, gas en vez de eléctrica. Las dos aparecen juntas de entrada.
- El equipo que está ahora **se marca en la lista** con un «actual», para que no
  se elija el mismo por error.
- **Un clic elige y cierra.** Acá sí cierra —al revés que al agregar equipos,
  donde queda abierta porque se cargan cuatro o seis de una pasada. Reemplazar
  es una cosa y es una sola.
- **La cantidad y el precio se conservan**, y se avisa en un renglón si el equipo
  nuevo tiene otro precio de lista: *«El precio de lista de este equipo es
  US$ 9.400. La cotización dice US$ 8.999 — se mantiene.»* Se avisa, no se pisa:
  el precio es lo que se pactó con el cliente.

Y lo demás sigue igual que en el cotizador: `−` / `+` para la cantidad, el color
si el equipo tiene colores, `✕` para sacar la línea entera, y el buscador de
siempre para **agregar** una que faltaba.

### Paso 4 — Ver qué cambia, antes de guardar

Al pie, siempre visible, un panel corto con **el antes y el después**. No un
registro técnico: las frases que el comercial va a leer.

```
  Qué cambia en la 500-26
  ─────────────────────────────────────────────────────────
  Línea 1   LAVADORA TITAN no apilable  →  TITAN MAX apilable
  Total     US$ 12.450,00               →  US$ 12.980,00
  ─────────────────────────────────────────────────────────
  Por qué:  [ el cliente pidió apilable y salió la variante ]
            [ equivocada — pedido de Lesly Ríos             ]

  [ Ver el PDF corregido ]            [ Guardar la corrección ]
```

**«Ver el PDF corregido»** abre el documento real —el mismo que sale al
cliente—, igual que hace hoy la hoja técnica en el catálogo de operaciones. Es
el único control que de verdad sirve: la ficha del equipo cambia la página
entera, y eso solo se ve mirándolo.

**El motivo es obligatorio.** Si el pedido vino de un comercial ya viene escrito
y se puede completar. Es lo que va a quedar en la bitácora y lo que va a leer el
comercial.

**Guardar exige un segundo toque** cuando el cambio mueve la plata: si el total
sube o baja, el botón pide confirmar con el monto nuevo dicho en palabras. Un
equipo cambiado es un error corregido; un total cambiado es un compromiso
distinto con el cliente.

### Paso 5 — Después de guardar

1. **El número no se movió.** El documento sigue siendo la 500-26.
2. **Le llega la campanada al comercial**: *«Operaciones corrigió tu cotización
   500-26»*, con el antes/después y el enlace al PDF nuevo. Nadie se entera por
   casualidad de que su documento cambió.
3. **Queda en la bitácora de operaciones**, en la misma lista de «Lo que se
   autorizó» que ya se mira todos los días: qué se corrigió, de quién era, quién
   lo pidió, por qué y cuándo.
4. **La versión anterior no se pierde.** Queda archivada completa —equipos,
   precios, totales—: si el banco pregunta qué decía el documento que recibió, hay
   con qué responderle.

---

## 4. Los frenos

Tres situaciones en las que corregir hace daño. Se avisan **antes** de abrir la
pantalla, como ya hace `cierreEnJuego()` al anular un cierre.

**1. La cotización ya tiene un cierre de venta emitido.** Cambiar el monto de una
cotización que ya se vendió descuadra el cierre y el récord del comercial. No se
corrige: primero se anula el cierre —que es el procedimiento que ya existe— y
después se corrige. La pantalla lo dice con el número del cierre en la mano.

**2. La corrección deja un precio bajo el piso de lista.** Vuelve a pedir
aprobación de gerencia, igual que al cotizar (migración 0064, aprobación por
ítem). La corrección se guarda, pero el PDF corregido no se libera hasta que
gerencia resuelva. No se le puede dar a operaciones una puerta trasera al
descuento.

**3. Postventa ya está despachando la máquina.** Si hay un pedido o una puesta en
marcha enganchada a esa venta, cambiar el equipo del papel no cambia la máquina
que va en el camión. Se avisa con el caso a la vista.

---

## 5. Lo que hay que decidirle a Carlos

Tres preguntas que no se resuelven desde acá. Se le llevan con la pantalla
armada, que es como se decidió todo lo demás.

1. **¿El PDF corregido dice que es una corrección?** Un renglón discreto
   («Versión 2 · corregida el 29-08-2026») es honesto y protege a la empresa,
   pero el banco puede leerlo como que el expediente cambió. La alternativa es
   que el documento salga idéntico y la traza viva solo adentro del CRM.
   **Recomendación:** que no salga nada impreso —el propósito de todo esto es
   que el banco no note diferencia— y que la traza quede completa adentro.
2. **¿Lesly necesita el código de gerencia para su propia corrección?** (§2).
3. **¿Se puede corregir una cotización de cualquier antigüedad?** Una de hace
   ocho meses ya no está en ningún expediente vivo; corregirla es reescribir el
   pasado. **Recomendación:** dejarlo abierto y que la bitácora lo muestre, en
   vez de poner un plazo que un día va a estorbar.

---

## 6. Notas para quien lo construya

No es el diseño, es lo que va a costar trabajo si se olvida.

- **La base bloquea esto hoy, a propósito.** `bloquear_edicion_cotizacion()` y
  `bloquear_edicion_items_cotizacion()` (migraciones 0012 y 0064) existen porque
  gerencia pidió lo contrario en su momento: *«les ha pasado que el mismo número
  de cotización se envía al cliente con dos precios distintos»* (`docs/06`). Las
  dos reglas conviven: se corrige **versionando bajo el mismo número**, con quién,
  cuándo y por qué — no abriendo la edición.
- **Una sola puerta:** una función `corregir_cotizacion_emitida()` `security
  definer` que archiva la versión vigente y recién entonces escribe. El trigger
  sigue rechazando todo lo demás.
- **`editar_cotizacion` y `crear_cotizacion` NO se copian para hacer la nueva.**
  Se parcha la definición viva con regexp. Copiarlas revivió reglas revertidas
  tres veces (`docs/memoria/crm-no-copiar-funciones-cotizacion.md`).
- **Mirar el último número de migración antes de crear la suya.** Han chocado
  tres veces.
- **Verificación**, como siempre en la casa: sesión real de Lesly, sesión real
  de un comercial —comprobando que el comercial **no** puede—, PDF antes y
  después leído con `pdfjs-dist`, y la cotización de prueba creada y borrada. El
  catálogo y las cotizaciones reales no se tocan.
