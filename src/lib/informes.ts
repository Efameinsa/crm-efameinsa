// Datos del informe de cierre que NO son acciones de servidor.
//
// Viven aparte de src/lib/acciones/informes.ts porque un módulo marcado con
// "use server" solo puede exportar funciones asíncronas: exportar de ahí una
// constante rompe la compilación ("Failed to collect page data").

// Los beneficios que el modelo real lista bajo "Incluye:". Van como texto
// editable y no como una constante impresa en el PDF porque el ing. Carlos
// pidió justamente poder cambiarlos por cotización ("bonos adicionales" /
// "beneficios generales"), sobre todo con empresa mediana-grande.
export const INCLUYE_POR_DEFECTO = [
  // La garantía SALIÓ de esta lista el 28-08: ahora es un campo propio del
  // cierre (`informes_cierre.garantia`, migración 0104) con su casilla a la
  // vista y su línea rotulada en el PDF. Acá dentro era un renglón de texto
  // que nadie veía —la lista vive plegada— y que había que editar a mano.
  "Juego de manuales de operación, mantenimiento e instalación.",
  "Planos y asesoría para instalación (punto de agua, energía eléctrica, descarga y/o lo requerido para su operación).",
  "Asesoría y capacitación VIRTUAL con nuestros técnicos especializados para la conexión y puesta en marcha, las veces que sean necesarias.",
];


/**
 * Los avisos de "a quién se le está facturando" que la pantalla del cierre
 * pone delante del comercial.
 *
 * Es la otra mitad del «cierre más robusto» que pidió el ing. Carlos el 27-08
 * (migración 0087). La ficha RUC en papel la sacó de la lista de adjuntos —«ya
 * no sería necesaria»— y en su lugar pidió el control que sí importa: «que la
 * razón social del cierre sea la que se vendió, a veces son muy similares pero
 * tienen otro rumbo».
 *
 * No es hipotético: INVERSIONES NACIONALES DE TURISMO S.A. vive en tres fichas
 * casi idénticas —la matriz, "HOTEL PARACAS" y "LIBERTADOR HOTELS"— repartidas
 * en tres carteras. Facturar contra la equivocada es un documento que hay que
 * anular.
 *
 * Devuelve frases, no códigos: se leen tal cual en pantalla y en el confirm de
 * emisión. Lista vacía = la identidad del cierre calza con la de la ficha.
 */
export function avisosDeIdentidad(
  cierre: { nombre: string; doc: string | null },
  ficha: { razonSocial: string; numDoc: string | null },
): string[] {
  const normalizar = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  const doc = (cierre.doc ?? "").trim();
  const avisos: string[] = [];

  if (!doc) {
    avisos.push("El cierre va sin RUC ni DNI, y sin eso Central no puede emitir la factura.");
  } else if (!ficha.numDoc) {
    avisos.push("La ficha del cliente no tiene documento cargado, así que no hay contra qué contrastarlo.");
  } else if (normalizar(doc) !== normalizar(ficha.numDoc)) {
    avisos.push(`El documento del cierre (${doc}) no es el de la ficha (${ficha.numDoc}).`);
  }

  if (normalizar(cierre.nombre) !== normalizar(ficha.razonSocial)) {
    // Con el MISMO RUC, el nombre distinto suele ser un pedido del cliente
    // (FANCAVEL, 02-09: la ficha traía dos razones sociales pegadas y el
    // cliente quería solo la suya). Se avisa, no se asusta.
    const mismoDoc = !!doc && !!ficha.numDoc && normalizar(doc) === normalizar(ficha.numDoc);
    avisos.push(
      mismoDoc
        ? `La razón social del cierre no es la de la ficha («${ficha.razonSocial}»). Con el mismo RUC está bien si el cliente pidió que salga así.`
        : `La razón social del cierre no es la de la ficha: «${ficha.razonSocial}».`,
    );
  }

  return avisos;
}

/**
 * Qué es cada renglón del cierre: un equipo, un repuesto o un servicio.
 *
 * Hasta el 02-09 todo renglón era «equipo», porque el documento nació para la
 * venta de máquinas. Ariana (C4), vendiendo mantenimiento con el permiso de
 * operaciones, cerró con FANCAVEL trece repuestos y un servicio de
 * mantenimiento correctivo, y la pantalla solo le ofrecía «Agregar equipo» y
 * el PDF rotulaba la tabla como EQUIPOS. El tipo vive en cada renglón
 * (`items[].tipo`, opcional: sin él es equipo, como todo lo emitido antes) y
 * de ahí salen el ejemplo que se muestra al escribir y el rótulo de la tabla.
 */
export type TipoItemInforme = "equipo" | "repuesto" | "servicio";

export const ORDEN_TIPOS_ITEM: TipoItemInforme[] = ["equipo", "repuesto", "servicio"];

export const TIPOS_ITEM: Record<TipoItemInforme, { singular: string; plural: string; ejemplo: string }> = {
  equipo: {
    singular: "Equipo",
    plural: "EQUIPOS",
    ejemplo: "LAVADORA INDUSTRIAL RIGIDA\nMARCA: PRIMUS\nMODELO: RX350",
  },
  repuesto: {
    singular: "Repuesto",
    plural: "REPUESTOS",
    ejemplo: "VALVULA DE DRENAJE\nMODELO: 4280FR4048N\nPARA LAVADORA LG TITAN C",
  },
  servicio: {
    singular: "Servicio",
    plural: "SERVICIOS",
    ejemplo: "SERVICIO DE MANTENIMIENTO CORRECTIVO PARA LAVADORA\nMARCA: LG\nMODELO: TITAN C\nCAPACIDAD: 15KG\nSERIE: 707KWXD21746",
  },
};

export function tipoDeItem(item: { tipo?: string | null }): TipoItemInforme {
  return item.tipo === "repuesto" || item.tipo === "servicio" ? item.tipo : "equipo";
}

/** El rótulo de la columna de la tabla: «EQUIPOS», «REPUESTOS Y SERVICIOS», «EQUIPOS, REPUESTOS Y SERVICIOS»… */
export function rotuloDeItems(items: { tipo?: string | null }[]): string {
  const presentes = ORDEN_TIPOS_ITEM.filter((t) => items.some((i) => tipoDeItem(i) === t));
  if (presentes.length === 0) return TIPOS_ITEM.equipo.plural;
  const nombres = presentes.map((t) => TIPOS_ITEM[t].plural);
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} Y ${nombres[nombres.length - 1]}`;
}

/** El mismo rótulo, para pantalla: «Equipos», «Repuestos y servicios»… */
export function tituloDeItems(items: { tipo?: string | null }[]): string {
  const r = rotuloDeItems(items).toLowerCase();
  return r.charAt(0).toUpperCase() + r.slice(1);
}

/**
 * «Pegar una lista»: cada línea es un renglón. Sirve para el cierre de
 * repuestos, que trae diez o quince líneas y tipearlas una por una es donde
 * se cuelan los errores. Formato por línea: `descripción | cantidad | precio`
 * (o con tabulador, como sale al copiar de Excel); cantidad y precio son
 * opcionales. Las líneas vacías se ignoran.
 */
export function renglonesDesdeTexto(
  texto: string,
  tipo: TipoItemInforme,
): { tipo: TipoItemInforme; descripcion: string; cantidad: number; precio_unitario: number }[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linea) => {
      const partes = linea.split(/\t|\s\|\s|\|/).map((p) => p.trim());
      const descripcion = partes[0] ?? "";
      const numero = (s: string | undefined) => {
        if (!s) return NaN;
        return Number(s.replace(/[^\d.,-]/g, "").replace(/,(?=\d{3}(\D|$))/g, "").replace(",", "."));
      };
      const cantidad = numero(partes[1]);
      const precio = numero(partes[2]);
      return {
        tipo,
        descripcion,
        cantidad: Number.isFinite(cantidad) && cantidad > 0 ? Math.floor(cantidad) : 1,
        precio_unitario: Number.isFinite(precio) && precio >= 0 ? precio : 0,
      };
    })
    .filter((r) => r.descripcion);
}
