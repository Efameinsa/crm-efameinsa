# Corregir una cotización ya numerada — mapa de la experiencia

**Escrito el 29-08-2026.** Diseño de la pantalla que pidió el ing. Carlos en la
reunión del 28-08 (transcripción `28-08-2026 14.19.txt`), con el reparto que
confirmó Lesly (operaciones) el 29-08. Todavía no está construido: esto es lo
que se va a construir y por qué cada cosa está donde está.

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
documento: la pantalla la abre alguien que la usó por última vez hace dos
meses.** No se aprende, no se recuerda, no se consulta un manual: se abre y se
entiende.

### El caso que lo destapó

Una cotización de Lesly (OPEN 500-26) llevaba el equipo equivocado: el cliente
pidió **apilable** y el documento decía **no apilable**. Se salvó porque todavía
no había salido al cliente —se hizo la 501 y el cierre N.º 1 se anuló—, pero
Carlos dejó planteado el otro caso, el que no tiene salida.

---

## 2. Quién corrige, y quién da la llave

**Corrige el comercial. La llave la dan operaciones o gerencia.** Es lo que dijo
Carlos con todas las letras y lo que confirmó Lesly el 29-08:

> «Si tu gestor quiere modificar esta cotización, **viene el administrador, pone
> la clave y ya modifica**.»
> — ing. Carlos, 28-08

Y tiene sentido más allá de la autoridad: **el comercial es el único que sabe
qué pidió el cliente**. Habló con él, tiene el correo, sabe si era apilable o
no. Poner a operaciones a adivinar el equipo correcto agrega un intermediario
que no tiene la información — y le agrega a Lesly una pantalla de edición para
usar seis veces al año.

### Consecuencia de diseño: operaciones no gana ninguna pantalla

Lesly hace exactamente lo que ya hace hoy para anular un cierre y para corregir
una derivación: **atiende el teléfono y dicta el código**. El mismo código
rotativo de cuatro dígitos, el mismo reloj de diez minutos, el mismo `ámbito`
que ya acepta a operaciones, gerencia y admin (`validar_codigo_autorizacion`,
migraciones 0114 y 0116).

Y la corrección aparece sola en la bitácora que ella ya mira todos los días,
«Lo que se autorizó», junto a los cierres anulados. Un tipo de fila más, no una
sección más.

### Dónde vive la puerta

En la cotización misma, en los dos lugares donde el comercial ya la tiene
delante:

1. **La pantalla de confirmación** (`CotizacionConfirmada`), justo después de
   emitirla y cada vez que vuelve a entrar.
2. **La lista de cotizaciones** — la de la oportunidad y «Mis cotizaciones»,
   que es donde busca una vieja por su número.

Ruta: `/comercial/oportunidades/[id]/cotizar/[cotizacionId]/corregir`.

### Se va «Duplicar»

Hasta ahora, la pantalla de confirmación ofrecía **duplicar** como única salida:
*«el documento queda cerrado: para cambiarle algo hay que duplicarla»*. Con
«Corregir» esa oferta deja de tener sentido en ese lugar — duplicar era el
sustituto de corregir, y ahora hay corregir. La pantalla de confirmación queda
con dos acciones y nada más:

```
  [ Descargar el PDF ]      [ Corregir esta cotización ]
```

> **Queda por decidir:** «Duplicar» también aparece en la lista de cotizaciones
> de la oportunidad (`lista-cotizaciones.tsx`), donde su trabajo es otro —
> arrancar una cotización nueva reusando los equipos de una anterior para el
> mismo cliente, sin tener que volver a buscarlos. **Recomendación:** dejarlo
> ahí y quitarlo solo de la pantalla de confirmación, que es donde se leía como
> «así se arreglan los errores». Si tampoco lo quieren ahí, es borrar un botón.

---

## 3. El recorrido, de punta a punta

Cuatro pasos y una llamada telefónica.

```
   El comercial                        Operaciones o gerencia
   ────────────                        ──────────────────────
 1 Abre su cotización y toca
   «Corregir esta cotización»
           │
           ▼
 2 Escribe qué está mal
   y pide el código        ──teléfono──►  Lo dicta desde su pantalla
                           ◄─────────────  (4 dígitos, 10 minutos,
           │                                sirve para UNA corrección)
           ▼
 3 Corrige
   · clic en el equipo → buscador
   · cantidad, precio, color
   · entrega, garantía, pago
           │
           ▼
 4 Ve qué cambia y el PDF real,          Le aparece en «Lo que se
   y guarda ──────────────────────────►  autorizó», con el motivo
   Mismo número.                          y el antes/después
```

### Paso 1 — La puerta, donde ya está mirando

En la pantalla de confirmación:

```
  ┌──────────────────────────────────────────────────────────┐
  │                          ✓                               │
  │            Cotización confirmada como 500-26             │
  │      Ya tiene su número de la serie Open. El documento   │
  │      queda cerrado: corregirlo necesita autorización.    │
  │                                                          │
  │      [ Descargar el PDF ]  [ Corregir esta cotización ]  │
  └──────────────────────────────────────────────────────────┘
```

«Corregir» va en segundo plano —contorno, no relleno—: lo normal es descargar
el PDF y mandarlo. Corregir es la excepción, y el texto de arriba ya avisó que
cuesta una autorización, así que nadie lo toca por curiosidad.

En las listas es un enlace más, junto a «Ver PDF», y **solo aparece en las
emitidas**: un borrador se edita sin pedirle permiso a nadie, porque no gastó
número.

### Paso 2 — El motivo primero, después el código

Un solo cuadro, en este orden, que es el orden en que ocurre la llamada:

```
  ┌──────────────────────────────────────────────────────────┐
  │  Corregir la cotización N.º 500-26 · Open                │
  │                                                          │
  │  El número no cambia. El cliente ya la tiene con este    │
  │  número y así va a quedar.                               │
  │                                                          │
  │  ¿Qué está mal?                                          │
  │  ┌────────────────────────────────────────────────────┐  │
  │  │ El cliente pidió apilable y salió la variante      │  │
  │  │ equivocada. Ya está presentada en el banco.        │  │
  │  └────────────────────────────────────────────────────┘  │
  │                                                          │
  │  Código de autorización        ┌──┬──┬──┬──┐             │
  │  Pídaselo a operaciones o a    │  │  │  │  │             │
  │  gerencia.                     └──┴──┴──┴──┘             │
  │                                                          │
  │                        [ Cancelar ]  [ Abrir para corregir ] │
  └──────────────────────────────────────────────────────────┘
```

**El motivo va antes del código a propósito**: es lo que el comercial le lee a
Lesly por teléfono para pedírselo. Escribirlo primero es prepararse la llamada,
no llenar un campo.

**Y el código se pide para ABRIR, no para guardar.** El código dura diez
minutos y corregir toma más que eso: pedirlo al final significaría que se vence
mientras el comercial elige el equipo, y tendría que llamar dos veces. Validarlo
al abrir deja la corrección autorizada durante media hora — una autorización,
una corrección, la misma regla de siempre («se quema al usarse»).

### Paso 3 — Un clic en el equipo y vuelve el buscador

Es **el cotizador que ya existe** (`pantalla-cotizador.tsx`), con otro traje.
Que sea el mismo importa: el comercial cotiza todos los días en esa pantalla, y
una pantalla que se usa seis veces al año no puede tener reglas propias.

Arriba, una franja granate que no deja dudar de dónde está uno:

```
  ┌────────────────────────────────────────────────────────────────┐
  │  Corrigiendo la cotización N.º 500-26 · Open                   │
  │  El número, el cliente y la fecha no cambian.                  │
  │  Autorizó Lesly Ríos · quedan 26 minutos                       │
  └────────────────────────────────────────────────────────────────┘
```

El reloj no es adorno: dice hasta cuándo vale la autorización que ya consiguió.

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

### Paso 4 — Ver qué cambia, y el PDF real, antes de guardar

Al pie, siempre visible, **el antes y el después**. No un registro técnico: las
frases que va a leer quien autorizó.

```
  Qué cambia en la 500-26
  ─────────────────────────────────────────────────────────
  Línea 1   LAVADORA TITAN no apilable  →  TITAN MAX apilable
  Total     US$ 12.450,00               →  US$ 12.980,00
  ─────────────────────────────────────────────────────────

  [ Ver el PDF corregido ]            [ Guardar la corrección ]
```

**«Ver el PDF corregido»** abre el documento real —el mismo que sale al
cliente—, igual que hace hoy la hoja técnica en el catálogo de operaciones. Es
el único control que de verdad sirve: la ficha del equipo cambia la página
entera, y eso solo se ve mirándolo.

**Guardar exige un segundo toque** cuando el cambio mueve la plata: si el total
sube o baja, el botón pide confirmar con el monto nuevo dicho en palabras. Un
equipo cambiado es un error corregido; un total cambiado es un compromiso
distinto con el cliente.

### Y después de guardar

1. **El número no se movió.** El documento sigue siendo la 500-26.
2. **Le aparece a quien autorizó**, en «Lo que se autorizó» de operaciones:
   qué se corrigió, de quién era, con qué motivo y el antes/después. Quien dio
   la llave ve para qué se usó, sin tener que preguntar.
3. **La versión anterior no se pierde.** Queda archivada completa —equipos,
   precios, totales—: si el banco pregunta qué decía el documento que recibió,
   hay con qué responderle.
4. **La cotización queda marcada** como «corregida 1 vez» en las listas, con la
   fecha. No se esconde que el documento cambió.

---

## 4. Los frenos

Tres situaciones en las que corregir hace daño. Se avisan **antes de pedir el
código** —no después—, como ya hace `cierreEnJuego()` al anular un cierre: nadie
llama a Lesly para que le den permiso a algo que no se va a poder hacer.

**1. La cotización ya tiene un cierre de venta emitido.** Cambiar el monto de una
cotización que ya se vendió descuadra el cierre y el récord del comercial. No se
corrige: primero se anula el cierre —que es el procedimiento que ya existe— y
después se corrige. La pantalla lo dice con el número del cierre en la mano.

**2. La corrección deja un precio bajo el piso de lista.** Vuelve a pedir
aprobación de gerencia, igual que al cotizar (migración 0064, aprobación por
ítem). La corrección se guarda, pero el PDF corregido no se libera hasta que
gerencia resuelva. El código de corrección no puede ser una puerta trasera al
descuento.

**3. Postventa ya está despachando la máquina.** Si hay un pedido o una puesta en
marcha enganchada a esa venta, cambiar el equipo del papel no cambia la máquina
que va en el camión. Se avisa con el caso a la vista.

---

## 5. Lo que hay que decidirle a Carlos

Se le llevan con la pantalla armada, que es como se decidió todo lo demás.

1. **¿El PDF corregido dice que es una corrección?** Un renglón discreto
   («Versión 2 · corregida el 29-08-2026») es honesto y protege a la empresa,
   pero el banco puede leerlo como que el expediente cambió. La alternativa es
   que el documento salga idéntico y la traza viva solo adentro del CRM.
   **Recomendación:** que no salga nada impreso —el propósito de todo esto es
   que el banco no note diferencia— y que la traza quede completa adentro.
2. **¿«Duplicar» se va también de la lista de la oportunidad?** (§2).
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
  cuándo, por qué y quién autorizó — no abriendo la edición.
- **El código ya existe y no se reinventa.** `validar_codigo_autorizacion(pin,
  ámbito)` con ámbito `operaciones` ya resuelve exactamente «operaciones o
  gerencia» (migración 0116). Se suma un ámbito propio si conviene distinguirlo
  en la bitácora, no una mecánica nueva.
- **Autorizar abre una ventana, no ejecuta.** Validar el código inserta la
  autorización —que se quema, `unique_violation` mediante— y habilita esa
  cotización para ese comercial por un rato. Guardar comprueba que la ventana
  siga viva; vencida, se pide el código otra vez.
- **Una sola puerta de escritura:** una función `corregir_cotizacion_emitida()`
  `security definer` que archiva la versión vigente y recién entonces escribe.
  El trigger sigue rechazando todo lo demás.
- **`editar_cotizacion` y `crear_cotizacion` NO se copian para hacer la nueva.**
  Se parcha la definición viva con regexp. Copiarlas revivió reglas revertidas
  tres veces (`docs/memoria/crm-no-copiar-funciones-cotizacion.md`).
- **Mirar el último número de migración antes de crear la suya.** Han chocado
  tres veces.
- **Verificación**, como siempre en la casa: sesión real de un comercial
  —comprobando que **sin código no puede**, que con un código vencido tampoco, y
  que no puede tocar la cotización de otro—, sesión real de Lesly para ver la
  bitácora, PDF antes y después leído con `pdfjs-dist`, y la cotización de
  prueba creada y borrada. El catálogo y las cotizaciones reales no se tocan.
