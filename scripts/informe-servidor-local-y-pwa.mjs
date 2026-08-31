// ============================================================
// CRM EFAMEINSA · ¿Dejar la nube y correr en el servidor de la oficina?
// ============================================================
// Documento de análisis pedido por Santos el 31-08-2026: «quiero que en algún
// momento dejemos de usar Supabase y usemos el servidor físico que tenemos acá,
// para que el sistema funcione sin necesidad de estar en internet (…) parte de
// eso se arreglaría si trabajamos en PWA, simulando una aplicación de
// escritorio (…) y cuando el internet regrese, toda la gestión que se hizo en
// local se actualizaría en línea».
//
// TODO lo que dice este documento está MEDIDO el 31-08-2026: contra la base de
// producción, contra el servidor 192.168.10.210 y contra la red de la oficina.
// Lo que no se pudo medir está dicho como tal, no estimado.
//
// Marca (manual): granate #7E1210, carbón #2C2E35, gris #6B6B6B, Arial, trato
// de usted. Autor: Santos Lenin Vilcachagua Ayala.
//
// Uso: node scripts/informe-servidor-local-y-pwa.mjs [salida.docx]

import { writeFileSync } from "node:fs";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, WidthType, BorderStyle, ShadingType, PageBreak,
} from "docx";

const SALIDA = process.argv[2] ?? "C:/Users/diseno/Downloads/Servidor local y PWA - analisis de viabilidad.docx";

const GRANATE = "7E1210";
const CARBON = "2C2E35";
const GRIS = "6B6B6B";
const FUENTE = "Arial";
const FONDO_SUAVE = "F7F5F4";

const texto = (t, o = {}) =>
  new TextRun({ text: t, font: FUENTE, size: o.size ?? 21, color: o.color ?? "333333", bold: o.bold, italics: o.italics });

const parrafo = (t, o = {}) =>
  new Paragraph({ children: Array.isArray(t) ? t : [texto(t, o)], spacing: { after: o.after ?? 140, line: 276 } });

const tituloSeccion = (t) =>
  new Paragraph({
    children: [new TextRun({ text: t.toUpperCase(), font: FUENTE, size: 26, bold: true, color: GRANATE })],
    spacing: { before: 400, after: 160 },
    heading: HeadingLevel.HEADING_1,
  });

const subtitulo = (t) =>
  new Paragraph({
    children: [new TextRun({ text: t, font: FUENTE, size: 22, bold: true, color: CARBON })],
    spacing: { before: 240, after: 100 },
  });

const vineta = (t, o = {}) =>
  new Paragraph({ children: Array.isArray(t) ? t : [texto(t, o)], bullet: { level: 0 }, spacing: { after: 90, line: 276 } });

const SIN_BORDE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const borde = { style: BorderStyle.SINGLE, size: 1, color: "D8D2D0" };

function celda(contenido, { encabezado = false, ancho, fondo, etiqueta = false } = {}) {
  return new TableCell({
    width: ancho ? { size: ancho, type: WidthType.PERCENTAGE } : undefined,
    shading: encabezado
      ? { type: ShadingType.CLEAR, fill: GRANATE, color: "auto" }
      : fondo
        ? { type: ShadingType.CLEAR, fill: fondo, color: "auto" }
        : undefined,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    borders: { top: borde, bottom: borde, left: borde, right: borde },
    children: (Array.isArray(contenido) ? contenido : [contenido]).map((linea) =>
      new Paragraph({
        children: [
          new TextRun({
            text: linea,
            font: FUENTE,
            size: 19,
            bold: encabezado || etiqueta,
            color: encabezado ? "FFFFFF" : etiqueta ? CARBON : "333333",
          }),
        ],
        spacing: { after: 0, line: 260 },
      }),
    ),
  });
}

function tabla(encabezados, filas, anchos) {
  const filasTabla = filas.map((f, n) =>
    new TableRow({
      children: f.map((c, i) =>
        celda(c, { ancho: anchos?.[i], fondo: n % 2 ? FONDO_SUAVE : undefined, etiqueta: encabezados === null && i === 0 }),
      ),
    }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: borde, bottom: borde, left: borde, right: borde, insideHorizontal: borde, insideVertical: borde },
    rows: encabezados
      ? [new TableRow({ tableHeader: true, children: encabezados.map((h, i) => celda(h, { encabezado: true, ancho: anchos?.[i] })) }), ...filasTabla]
      : filasTabla,
  });
}

function aviso(lineas) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE, insideHorizontal: SIN_BORDE, insideVertical: SIN_BORDE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: GRANATE, color: "auto" },
            borders: { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE },
            children: [new Paragraph("")],
          }),
          new TableCell({
            width: { size: 99, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.CLEAR, fill: FONDO_SUAVE, color: "auto" },
            margins: { top: 130, bottom: 130, left: 180, right: 140 },
            borders: { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE },
            children: lineas.map((l, i) =>
              new Paragraph({
                children: [texto(l, { bold: i === 0, color: i === 0 ? CARBON : "333333" })],
                spacing: { after: i === lineas.length - 1 ? 0 : 80, line: 270 },
              }),
            ),
          }),
        ],
      }),
    ],
  });
}

const hoy = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "long", year: "numeric" });
const espacio = (n = 200) => new Paragraph({ text: "", spacing: { after: n } });

// ═══════════════════════════════════════════════════════════════════════════
const cuerpo = [];
const A = (...xs) => cuerpo.push(...xs);

// ── PORTADA ────────────────────────────────────────────────────────────────
A(
  new Paragraph({
    children: [new TextRun({ text: "EFAMEINSA", font: FUENTE, size: 20, bold: true, color: GRANATE, characterSpacing: 60 })],
    spacing: { after: 40 },
  }),
  new Paragraph({
    children: [new TextRun({ text: "Salir de la nube y trabajar sin internet", font: FUENTE, size: 40, bold: true, color: CARBON })],
    spacing: { after: 60 },
  }),
  new Paragraph({
    children: [texto("Análisis de viabilidad del servidor local, la PWA y la sincronización · " + hoy, { color: GRIS, size: 20 })],
    spacing: { after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GRANATE, space: 8 } },
  }),
  espacio(260),
);

A(
  parrafo("Este documento responde a un pedido concreto: dejar de depender de la nube para que el CRM siga funcionando cuando se corta el internet, servir los informes y las fotos desde el servidor de la oficina, y sincronizar con la nube cuando la conexión vuelva."),
  parrafo("Todo lo que se afirma acá está medido el 31 de agosto de 2026 contra la base de producción, contra el servidor 192.168.10.210 y contra la red de la oficina. Donde no se pudo medir, se dice."),
);

// ── 1. RESPUESTA CORTA ────────────────────────────────────────────────────
A(tituloSeccion("1. La respuesta corta"));
A(
  aviso([
    "Es técnicamente viable, pero hacerlo completo hoy sería resolver el problema equivocado y por el camino más caro.",
    "El sistema pesa 87 MB y lo escriben entre cuatro y cinco personas por día. Mover eso no es el problema. El problema es que dentro de la nube no vive solo la base: viven 106 reglas de permisos y 118 funciones que son las reglas del negocio, y la identidad de los 20 usuarios. Y hay un obstáculo que ninguna tecnología resuelve sola: la numeración correlativa de cotizaciones e informes, que por definición no puede repartirse entre puestos desconectados sin cambiar antes cómo se numera.",
    "La recomendación es hacerlo por etapas, empezando por lo que cuesta poco y cubre la mayor parte del dolor real, y dejar la migración completa como una decisión posterior y condicionada a una medición que hoy no existe: cuántas veces y por cuánto tiempo se corta realmente el internet.",
  ]),
);

// ── 2. LO QUE SE MIDIÓ ────────────────────────────────────────────────────
A(tituloSeccion("2. Lo que se midió"));

A(subtitulo("El sistema"));
A(
  tabla(null, [
    ["Peso de toda la base de datos", "87 MB"],
    ["Tablas / funciones / reglas de permisos", "44 tablas · 118 funciones · 106 políticas · 29 disparadores"],
    ["Migraciones acumuladas", "141"],
    ["Usuarios con acceso", "20 (todos con correo y contraseña; ningún acceso con Google ni similar)"],
    ["Filas nuevas por día hábil", "~312 (80 gestiones, 102 ventas, 65 oportunidades, 32 clientes, 19 contactos, 12 cotizaciones, 2 informes)"],
    ["Personas escribiendo el mismo día", "4 a 5"],
    ["Archivos del CRM", "5.498 PDF históricos en Cloudflare (1.670 MB) · 48 adjuntos (7 MB) · 296 fotos de producto (44 MB)"],
    ["Archivos en el servidor de la oficina", "2.118 informes de 2025-2026 (5,4 GB) · 8.913 informes de todos los años (22,6 GB)"],
  ], [38, 62]),
);

A(subtitulo("El servidor de la oficina"));
A(
  tabla(null, [
    ["Nombre y dirección", "SRV-FS · 192.168.10.210 · grupo de trabajo EFAMEINSA · hardware Dell"],
    ["Sistema operativo", "Windows Server (deducido: responde IIS 10 en el puerto 80 con autenticación NTLM)"],
    ["Qué corre hoy", "Servidor de archivos (≈155 recursos compartidos y 3 impresoras), IIS y SQL Server (puerto 1433 abierto)"],
    ["Disco", "4.471 GB en total · 2.936 GB usados · 1.535 GB libres (34 %)"],
    ["Respuesta en la red", "20 paquetes, 0 % de pérdida, 1 ms de media"],
    ["Puertos abiertos", "139 y 445 (archivos), 3389 (escritorio remoto), 80, 443, 1433 (SQL Server)"],
    ["PostgreSQL", "Puerto 5432 cerrado: hoy no hay ninguna base Postgres en ese servidor"],
  ], [38, 62]),
);

A(subtitulo("La red y el internet"));
A(
  tabla(null, [
    ["Enlace del puesto medido", "Cable Ethernet a 100 Mbps (no 1 Gbps)"],
    ["Velocidad real contra el servidor", "11,0 MB/s (≈88 Mbps) en dos pasadas: está al 88 % de su techo"],
    ["Equipos activos en la red", "16 direcciones en 192.168.10.x, una sola subred"],
    ["Internet hacia afuera (8.8.8.8)", "5 % de paquetes perdidos · 63 ms de media, muy variable (42 a 179 ms)"],
    ["Internet hacia el CRM", "0 % de pérdida · 14 ms de media"],
    ["Proveedor", "INTEGRATEL PERÚ S.A.A."],
    ["Puesto de trabajo tipo", "Dell Precision 3630, Core i7-9700, 32 GB de RAM, disco sólido de 960 GB"],
    ["Energía", "Los puestos son de escritorio, SIN batería: un corte de luz los apaga en el acto"],
  ], [38, 62]),
);

A(
  espacio(120),
  aviso([
    "Dos mediciones que conviene mirar juntas.",
    "La red interna va a 100 Mbps, no a 1 Gbps: el cuello de botella es la placa o el puerto del switch, no el servidor. Sirve de sobra para el CRM —que mueve texto— pero no para mover informes pesados a varios puestos a la vez.",
    "Y el internet hacia el CRM respondió perfecto: 0 % de pérdida y 14 ms. La pérdida del 5 % apareció contra un destino de afuera. Eso no descarta los cortes que ustedes viven, pero sí dice que en el momento de medir el problema no estaba del lado del CRM.",
  ]),
);

// ── 3. QUÉ PASA HOY SIN INTERNET ──────────────────────────────────────────
A(new Paragraph({ children: [new PageBreak()] }));
A(tituloSeccion("3. Qué pasa hoy cuando se corta el internet"));
A(parrafo("Hoy se cae el 100 % del CRM, y no por una sola razón sino por cuatro encadenadas:"));
A(
  vineta("La aplicación no está en la oficina: corre en Vercel, fuera."),
  vineta("La base de datos tampoco: está en Supabase."),
  vineta("La sesión se valida contra la nube en CADA pedido de página, así que ni siquiera se puede seguir mirando lo ya cargado."),
  vineta("Los archivos están repartidos entre Cloudflare (los 5.498 PDF históricos) y Supabase (los adjuntos)."),
);
A(parrafo("Además dejan de funcionar, pero sin bloquear el trabajo: las notificaciones push, los avisos por correo (que los manda n8n, no el CRM), la entrada de contactos desde la web y el formulario de Google, y el cálculo diario de gasto en publicidad."));
A(
  parrafo([
    texto("Una aclaración útil: ", { bold: true, color: CARBON }),
    texto("la validación de RUC no necesita internet. Se calcula en la propia máquina con el algoritmo de módulo 11. Eso ya funciona sin conexión."),
  ]),
);

// ── 4. EL PUNTO QUE DECIDE TODO ───────────────────────────────────────────
A(tituloSeccion("4. El punto que decide todo: la numeración"));
A(
  parrafo("El ingeniero lo intuyó en la reunión —«creo que íbamos a tener un problema con los presupuestos, la numeración»— y es exactamente el obstáculo central. No es un detalle: es lo que define si trabajar sin conexión es posible o no."),
  parrafo("Hoy los números correlativos se generan pidiéndole el siguiente a un contador único guardado en la base, que se bloquea mientras se entrega el número. Eso garantiza que no haya dos cotizaciones 2211. Funciona porque hay un solo contador y todos le preguntan a él."),
);
A(
  tabla(["Documento", "Número actual", "¿Se puede numerar sin conexión?"], [
    ["Contactos (PRO-xxxxx)", "9.075", "No. Contador único global."],
    ["Cotizaciones Efameinsa", "2.211", "No. Dos puestos desconectados darían el mismo número."],
    ["Cotizaciones Open", "524", "No, por lo mismo."],
    ["Informes de cierre", "4 y 5 según serie", "No, aunque ya existe un mecanismo de reservas sin usar."],
    ["Informes de servicio técnico", "7", "No, y es el más frágil: no tiene ninguna protección contra choques."],
  ], [34, 20, 46]),
);
A(
  espacio(120),
  aviso([
    "Qué significa esto en la práctica.",
    "Sin internet se puede seguir registrando gestiones, llamadas, notas, tareas y cambios de etapa: nada de eso lleva número. Lo que NO se puede hacer sin resolver antes la numeración es EMITIR una cotización o un informe de cierre, que es justamente el momento en que el documento sale hacia el cliente o hacia Central.",
    "La salida existe y no es exótica: repartir bloques de números por puesto —que la caja de Katerine tenga reservado del 2300 al 2349 y la de Brenda del 2350 al 2399—, de modo que cada uno pueda emitir sin preguntarle a nadie. Cuesta trabajo de diseño y hay que acordarlo con gerencia, porque cambia la forma en que se leen los correlativos: dejarían de ser una secuencia perfecta y aparecerían huecos.",
  ]),
);

// ── 5. LAS ALTERNATIVAS ───────────────────────────────────────────────────
A(new Paragraph({ children: [new PageBreak()] }));
A(tituloSeccion("5. Las cuatro alternativas"));

A(subtitulo("A · Internet de respaldo (no se toca el sistema)"));
A(parrafo("Un segundo enlace, por ejemplo 4G o 5G, y un router que cambie solo cuando el principal se cae. El CRM no se entera y sigue funcionando."));
A(
  tabla(["A favor", "En contra"], [
    ["Se resuelve en días, no en meses.", "No sirve si el corte es de luz y no de internet."],
    ["Cubre la inmensa mayoría de los cortes reales.", "Costo mensual permanente del segundo enlace."],
    ["No agrega ni una línea de código ni un riesgo nuevo.", "No resuelve la lentitud de abrir informes pesados desde la nube."],
    ["Es reversible: si no sirve, se cancela.", ""],
  ], [50, 50]),
);

A(subtitulo("B · Aplicación instalable (PWA) con trabajo sin conexión"));
A(parrafo("El CRM se instala como si fuera un programa de escritorio, guarda en la máquina lo que la persona necesita para su día y deja seguir trabajando cuando la conexión se corta. Lo que se hizo sin conexión se manda solo cuando vuelve."));
A(
  tabla(["A favor", "En contra"], [
    ["Es lo que ya estaba planificado como siguiente proyecto.", "Requiere resolver la numeración para poder emitir documentos."],
    ["Cubre el caso real: cortes de minutos u horas.", "Hay que decidir y programar qué pasa si dos personas tocan lo mismo."],
    ["Sirve además fuera de la oficina, en visitas a clientes.", "Solo funciona para quien ya abrió el CRM ese día."],
    ["No cambia dónde vive la información: cero riesgo de perderla.", "No sirve si la persona nunca cargó la aplicación."],
  ], [50, 50]),
);

A(subtitulo("C · Todo en el servidor de la oficina, con sincronización"));
A(parrafo("Instalar en SRV-FS la base de datos, el sistema de identidad, el almacenamiento de archivos y la propia aplicación; trabajar siempre contra la red local, y sincronizar con la nube cuando haya internet."));
A(
  tabla(["A favor", "En contra"], [
    ["El sistema funciona aunque no haya internet en absoluto.", "Hay que reproducir 106 reglas de permisos y 118 funciones."],
    ["Los informes se abren a velocidad de red local.", "125 puntos del sistema dependen de la identidad que hoy da la nube."],
    ["La información no sale de la empresa.", "Sincronizar en los dos sentidos es el problema más difícil de todos."],
    ["No hay costo mensual de nube.", "El servidor ya carga archivos, IIS y SQL Server: sumarle esto lo pone en riesgo."],
    ["", "Sin UPS, un corte de luz apaga el sistema entero, no solo un puesto."],
    ["", "Alguien tiene que respaldar, actualizar y vigilar ese servidor todos los días."],
  ], [50, 50]),
);

A(subtitulo("D · Los archivos desde el servidor, el CRM en la nube"));
A(parrafo("Independiente de las anteriores y ya planteado en la documentación del proyecto: que el CRM muestre los informes, las fotos y los videos leyéndolos del servidor de la oficina, sin subirlos a ningún lado."));
A(
  tabla(["A favor", "En contra"], [
    ["Los 5,4 GB de informes ya están ahí: no hay que mover nada.", "Solo funciona desde dentro de la oficina."],
    ["Resuelve el pedido de gerencia sin costo de almacenamiento.", "Requiere un puente entre el CRM y la red interna."],
    ["La información sensible no sale de la empresa.", "La red va a 100 Mbps: varios informes pesados a la vez la saturan."],
    ["Es la más barata de las cuatro en relación a lo que resuelve.", ""],
  ], [50, 50]),
);

// ── 6. COMPARACIÓN ────────────────────────────────────────────────────────
A(new Paragraph({ children: [new PageBreak()] }));
A(tituloSeccion("6. Comparación y esfuerzo"));
A(
  parrafo("El esfuerzo está expresado en semanas de trabajo de una persona dedicada, y supone que el resto del CRM se congela mientras tanto. Las estimaciones de la alternativa C son las menos confiables: es la única que incluye un problema —la sincronización en dos sentidos— cuya dificultad no se conoce hasta que se está adentro."),
);
A(
  tabla(["Alternativa", "Esfuerzo", "Riesgo", "Qué resuelve"], [
    ["A · Internet de respaldo", "Días. Trabajo de proveedor, no de programación", "Muy bajo", "Los cortes de internet, que es el 90 % del dolor"],
    ["D · Archivos desde el servidor", "2 a 3 semanas", "Bajo", "Ver el histórico del cliente sin subir 5,4 GB a ningún lado"],
    ["B · PWA con trabajo sin conexión", "5 a 8 semanas", "Medio", "Seguir trabajando durante un corte, y fuera de la oficina"],
    ["C · Todo en el servidor local", "4 a 7 meses", "Alto", "Independencia total de internet"],
  ], [26, 24, 12, 38]),
);

A(
  espacio(140),
  aviso([
    "Por qué la alternativa C cuesta tanto más de lo que parece.",
    "No es «mudar la base de datos»: eso son 87 MB y se copia en un minuto. Es reconstruir todo lo que hoy la nube hace gratis. Hay que levantar y mantener el motor de base de datos, el sistema de identidad de los 20 usuarios, el servicio que traduce las 342 consultas que el CRM ya escribe de una manera concreta, el almacenamiento de archivos y la propia aplicación. Y encima, escribir desde cero una sincronización en dos sentidos que decida qué hacer cuando la misma ficha se tocó en los dos lados.",
    "A eso se suma lo que no es programación y suele olvidarse: respaldos diarios probados, un UPS que aguante el corte de luz, actualizaciones de seguridad y una persona responsable de que ese servidor esté vivo un lunes a las 8 de la mañana. Hoy todo eso lo hace el proveedor de nube sin que nadie de la empresa lo piense.",
  ]),
);

// ── 7. RIESGOS ────────────────────────────────────────────────────────────
A(tituloSeccion("7. Riesgos, y cómo se atienden"));
A(
  tabla(["Riesgo", "Gravedad", "Cómo se atiende"], [
    ["Corte de luz: el servidor local se apaga y no queda nada, ni local ni nube", "Alta", "UPS en el servidor y en los puestos clave. Es condición previa a cualquier plan que ponga el sistema adentro."],
    ["Números de cotización repetidos al emitir sin conexión", "Alta", "Repartir bloques de números por puesto antes de habilitar la emisión sin conexión. No se habilita hasta que esté resuelto."],
    ["Dos personas modifican la misma ficha en lados distintos", "Alta", "Definir una regla escrita de quién gana, y guardar siempre la versión descartada para poder revisarla."],
    ["El servidor deja de responder y no hay quien lo levante", "Alta", "Designar un responsable y un procedimiento antes de depender de él. Hoy no existe."],
    ["Sin respaldo probado, un disco dañado se lleva el CRM", "Alta", "Respaldo diario automático fuera del servidor y una prueba mensual de restauración."],
    ["La red de 100 Mbps se satura con varios informes pesados", "Media", "Pasar a 1 Gbps el tramo servidor-switch, o servir versiones livianas."],
    ["El servidor ya corre archivos, IIS y SQL Server", "Media", "Aislar en una máquina virtual, o comprar un servidor dedicado."],
    ["Queda solo 34 % de disco libre", "Media", "Medir el crecimiento antes de sumarle carga."],
    ["El proyecto se estira y el CRM se congela meses", "Media", "Ir por etapas, con cada una útil por sí sola."],
  ], [36, 12, 52]),
);

// ── 8. RECOMENDACIÓN ──────────────────────────────────────────────────────
A(new Paragraph({ children: [new PageBreak()] }));
A(tituloSeccion("8. Recomendación"));
A(
  parrafo("La recomendación es no ir directo a la alternativa C, y hacerlo en cuatro etapas donde cada una entrega valor sola y ninguna obliga a la siguiente."),
);

A(subtitulo("Etapa 0 · Medir el problema (esta semana, sin costo)"));
A(parrafo("Antes de invertir meses hay que saber cuánto duele. Hoy nadie sabe cuántas veces por mes se corta el internet ni por cuánto tiempo, y toda la decisión depende de eso. Se puede dejar un registro automático que anote cada caída y su duración. En dos o tres semanas hay un número real."));
A(parrafo("Y hay una pregunta que hay que contestar primero, porque cambia todo: cuando se cae el internet, ¿se cae también la luz? Si los cortes son de energía, el servidor local no resuelve nada sin UPS."));

A(subtitulo("Etapa 1 · Internet de respaldo (días)"));
A(parrafo("Es la mejor relación entre lo que cuesta y lo que resuelve. Si los cortes son del proveedor, esto los elimina sin tocar el sistema y sin agregar ningún riesgo nuevo. Debería intentarse antes que cualquier desarrollo."));

A(subtitulo("Etapa 2 · Los informes desde el servidor (2 a 3 semanas)"));
A(parrafo("Resuelve un pedido explícito de gerencia, aprovecha los 5,4 GB que ya están en el servidor, no saca información de la empresa y no depende de las otras etapas. Es la primera pieza de desarrollo que conviene hacer."));

A(subtitulo("Etapa 3 · La aplicación instalable (5 a 8 semanas)"));
A(parrafo("La PWA que usted plantea. Se hace en dos tiempos: primero que se pueda seguir CONSULTANDO sin conexión —la cartera, la agenda del día, las fichas—, que es la mitad del beneficio y casi nada del riesgo; y después registrar sin conexión lo que no lleva número, con envío automático al volver. Emitir cotizaciones e informes sin conexión queda fuera hasta resolver la numeración."));

A(subtitulo("Etapa 4 · El servidor local completo (4 a 7 meses) — condicionada"));
A(parrafo("Solo si la medición de la etapa 0 demuestra que los cortes son frecuentes y largos, y solo después de que existan UPS, respaldos probados y un responsable del servidor. Si los cortes resultan ser de minutos y esporádicos, esta etapa no se justifica: costaría meses de trabajo y agregaría riesgos permanentes para resolver algo que las etapas 1 y 3 ya cubren."));

A(
  espacio(140),
  aviso([
    "En una frase.",
    "La idea es correcta y el camino existe, pero conviene recorrerlo al revés de como se suele plantear: primero lo barato que cubre casi todo el dolor, y la mudanza completa solo si los números demuestran que hace falta. Hoy no hay ningún dato que la justifique, y eso no es un argumento en contra: es que todavía no se midió.",
  ]),
);

// ── 9. QUÉ HACE FALTA ─────────────────────────────────────────────────────
A(tituloSeccion("9. Lo que hace falta para avanzar"));
A(subtitulo("Decisiones de gerencia"));
A(
  vineta("Autorizar el registro de cortes de internet (etapa 0). Sin costo y sin riesgo."),
  vineta("Decidir si se contrata el enlace de respaldo y con qué presupuesto mensual."),
  vineta("Aceptar que los números de cotización dejen de ser una secuencia perfecta y puedan tener huecos, si en algún momento se quiere emitir sin conexión."),
  vineta("Nombrar un responsable del servidor, con nombre y apellido, antes de poner algo crítico adentro."),
);
A(subtitulo("Información que hoy no tengo"));
A(
  vineta("Si el servidor tiene UPS y cuánta autonomía. No es verificable por red: hay que mirarlo."),
  vineta("Qué procesador, memoria y carga tiene SRV-FS. Requiere credencial de administrador del servidor."),
  vineta("Si el tramo entre el servidor y el switch va a 1 Gbps o también a 100 Mbps."),
  vineta("Cada cuánto y por cuánto tiempo se corta el internet, y si coincide con cortes de luz."),
  vineta("Qué usa hoy el SQL Server que corre en ese servidor, y si el ERP depende de él."),
);
A(subtitulo("Lo que puedo empezar sin esperar nada"));
A(
  vineta("Dejar corriendo el registro de cortes de internet."),
  vineta("Preparar la lectura de los informes del servidor (etapa 2)."),
  vineta("Diseñar el reparto de números por puesto, que es la pieza que habilita todo lo demás y hoy es el único bloqueo real."),
);

// ── PIE ────────────────────────────────────────────────────────────────────
A(
  espacio(400),
  new Paragraph({
    children: [texto("Elaborado por Santos Lenin Vilcachagua Ayala", { color: GRIS, size: 19 })],
    spacing: { before: 200, after: 20 },
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D8D2D0", space: 10 } },
  }),
  new Paragraph({ children: [texto("Efameinsa · " + hoy + " · Mediciones tomadas el 31-08-2026", { color: GRIS, size: 19 })] }),
);

const doc = new Document({
  creator: "Santos Lenin Vilcachagua Ayala",
  title: "Salir de la nube y trabajar sin internet — análisis de viabilidad",
  description: "Análisis del servidor local, la PWA y la sincronización para el CRM Efameinsa",
  styles: { default: { document: { run: { font: FUENTE, size: 21, color: "333333" } } } },
  sections: [
    {
      properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } },
      children: cuerpo.filter(Boolean),
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(SALIDA, buffer);
console.log(`Escrito: ${SALIDA} (${(buffer.length / 1024).toFixed(0)} KB)`);
