// Catálogo de ejemplo para el piloto: los 4 equipos LG que aparecen en las
// cotizaciones reales de `Descargas/PROYECTO CRM EFAMEINSA/modelos de
// cotizacion`, con sus características, dimensiones y fotos transcritas de
// esos documentos. Sustituir/ampliar cuando gerencia entregue el catálogo
// completo con la lista de precios oficial.
//
// Idempotente: upsert por (marca, modelo). Uso:
//   node --env-file=.env.local scripts/seed-productos-modelos.mjs

import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CARACTERISTICAS_LAVADORA = [
  "Tambor fabricado íntegramente en acero inoxidable: ayuda a evitar que la ropa se manche durante el ciclo de lavado, a diferencia de los tambores pintados normales.",
  "Tambor conectado directamente al sistema de transmisión (motor), proporcionando mayor durabilidad y menor mantenimiento.",
  "Agujeros especiales patentados para un eficiente proceso de lavado y centrifugado.",
  "Sistema de suspensión con 4 amortiguadores para la absorción de vibración y reducción del ruido.",
  "Sistema de dispensador de detergentes en la parte superior para una fácil limpieza.",
  "Tambor con sistema de inclinación de 10°: permite un mayor nivel de baño de agua en el tambor, por lo que se utiliza menos agua sin sacrificar el rendimiento de lavado.",
  "Suministro automático de detergentes con inyección de 5 señales de activación para el ingreso de detergentes líquidos.",
  "Panel frontal de acero tratado con pintura especial anticorrosiva para una larga vida útil.",
  "Alta velocidad de centrifugado.",
  'Sistema de ahorro de energía "EnergyStar".',
  "Gydro Balancing system: sensor de equilibrio para mayor velocidad de centrifugado, menor vibración y reducción de ruidos.",
  "Sistema Wifi-LG Smart Solution: monitoreo en línea de procesos de lavado.",
  "Hygiene Care Laundry system: sistema de limpieza para esterilizar el tambor, incluye resistencias eléctricas para uso de acuerdo a necesidad.",
  "Sistema de atomización de agua: boquilla de spray de atomización de agua en las prendas y en la puerta, ayuda a la máquina a llenar rápidamente y proporciona un mejor rendimiento de lavado.",
  "Panel de control computarizado de acero, no de plástico, para una mejor fiabilidad; permite una fácil programación y guardar hasta 20 programas personalizados.",
  "Puerta frontal con vidrio templado.",
  "Fácil mantenimiento debido a que el acceso es por la parte frontal, por lo que se gana tiempo para el acceso directo a los componentes.",
];

const CARACTERISTICAS_SECADORA = [
  "Tambor conectado directamente al sistema de transmisión (motor), proporcionando mayor durabilidad y menor mantenimiento.",
  "Agujeros especiales patentados para un eficiente proceso de secado.",
  "Fácil acceso al filtro de limpieza sin aperturar la puerta frontal.",
  "Sistema de extracción de aire de excelente performance por medio de un ventilador de grandes dimensiones para una mejor eficiencia de energía.",
  "Panel frontal de acero tratado con pintura especial anticorrosiva para una larga vida útil.",
  'Sistema de ahorro de energía "Energy Star".',
  "Panel de control computarizado de acero, no de plástico, para una mejor fiabilidad; permite una fácil programación y guardar hasta 20 programas personalizados.",
  "Fácil mantenimiento debido a que el acceso es por la parte frontal, por lo que se gana tiempo para el acceso directo a los componentes.",
  "Sistema Wifi-LG Smart Solution: monitoreo en línea de procesos de secado.",
];

const PRODUCTOS = [
  {
    marca: "LG",
    modelo: "GIANT C MAX (CDG27MSCPS)",
    nombre: "Secadora semi industrial a gas OPL",
    categoria: "Secadora",
    segmento: "semi_industrial",
    capacidad: "10.2 kg",
    foto_path: "/productos/lg-secadora-giant-c-max.png",
    ficha: {
      calentamiento: "Gas GLP/Natural",
      panel: "Digital-Multifunción",
      controles: "220V/60Hz/1Ph",
      caracteristicas: CARACTERISTICAS_SECADORA,
      dimensiones: ["Volumen del tambor: 207 litros", "Diámetro del tambor: 663.0 mm", "Profundidad del tambor: 570.60 mm"],
      medidas: ["Ancho: 686 mm", "Profundidad: 764 mm", "Altura: 983 mm"],
    },
    precios: { optimo: 2490, medio: 2100, deseado: 1700 },
  },
  {
    marca: "LG",
    modelo: "TITAN MAX",
    nombre: "Lavadora centrífuga semi industrial",
    categoria: "Lavadora",
    segmento: "semi_industrial",
    capacidad: "17 kg",
    foto_path: "/productos/lg-lavadora-frontal.png",
    ficha: {
      panel: "Digital-Multifunción",
      controles: "220V/60Hz/1Ph",
      caracteristicas: CARACTERISTICAS_LAVADORA,
      dimensiones: [
        "Volumen del tambor: 147 litros",
        "Diámetro del tambor: 610.8 mm",
        "Profundidad del tambor: 518.10 mm",
        "Velocidad de centrifugado: 1,000 rpm",
        "Factor G: 342",
      ],
      medidas: ["Ancho: 737 mm", "Profundidad: 814 mm", "Altura: 1036 mm"],
    },
    precios: { optimo: 4390, medio: 4050, deseado: 3750 },
  },
  {
    marca: "LG",
    modelo: "GIANT C MAX (CWG27MDCRS)",
    nombre: "Lavadora centrífuga semi industrial OPL",
    categoria: "Lavadora",
    segmento: "semi_industrial",
    capacidad: "13 kg",
    foto_path: "/productos/lg-lavadora-frontal.png",
    ficha: {
      panel: "Digital-Multifunción",
      controles: "220V/60Hz/1Ph",
      caracteristicas: CARACTERISTICAS_LAVADORA,
      dimensiones: [
        "Volumen del tambor: 102.7 litros",
        "Diámetro del tambor: 560.0 mm",
        "Profundidad del tambor: 419.30 mm",
        "Velocidad de centrifugado: 1,200 rpm",
        "Factor G: 451",
      ],
      medidas: ["Ancho: 686 mm", "Profundidad: 767 mm", "Altura: 983 mm"],
    },
    // Solo el precio de oferta aparece en el modelo (US$ 2,199 sin IGV);
    // óptimo/medio son estimados de ejemplo hasta tener la lista oficial.
    precios: { optimo: 2590, medio: 2390, deseado: 2199 },
  },
  {
    marca: "LG",
    modelo: "TITAN LIGHT",
    nombre: "Secadora semi industrial a gas / apilable",
    categoria: "Secadora",
    segmento: "semi_industrial",
    capacidad: "15 kg",
    foto_path: "/productos/lg-secadora-titan-light.png",
    ficha: {
      calentamiento: "Gas GLP",
      panel: "Digital-Multifunción",
      controles: "220V/60Hz/1Ph",
      caracteristicas: CARACTERISTICAS_SECADORA,
      dimensiones: ["Volumen del tambor: 254 litros", "Diámetro del tambor: 716.0 mm", "Profundidad del tambor: 614.0 mm"],
      medidas: ["Ancho: 737 mm", "Profundidad: 1090 mm", "Altura: 1022 mm"],
    },
    precios: { optimo: 3590, medio: 3150, deseado: 2750 },
  },
];

async function main() {
  for (const p of PRODUCTOS) {
    const { data: existente } = await admin
      .from("productos")
      .select("id")
      .eq("marca", p.marca)
      .eq("modelo", p.modelo)
      .maybeSingle();

    const campos = {
      marca: p.marca,
      modelo: p.modelo,
      nombre: p.nombre,
      categoria: p.categoria,
      segmento: p.segmento,
      capacidad: p.capacidad,
      foto_path: p.foto_path,
      ficha: p.ficha,
      activo: true,
    };

    let productoId;
    if (existente) {
      const { error } = await admin.from("productos").update(campos).eq("id", existente.id);
      if (error) throw error;
      productoId = existente.id;
      console.log(`= Actualizado: ${p.marca} ${p.modelo}`);
    } else {
      const { data, error } = await admin.from("productos").insert(campos).select("id").single();
      if (error) throw error;
      productoId = data.id;
      console.log(`+ Creado: ${p.marca} ${p.modelo}`);
    }

    for (const [tier, precio] of Object.entries(p.precios)) {
      const { data: precioExistente } = await admin
        .from("precios_producto")
        .select("id")
        .eq("producto_id", productoId)
        .eq("tier", tier)
        .is("vigente_hasta", null)
        .maybeSingle();
      if (precioExistente) {
        const { error } = await admin.from("precios_producto").update({ precio }).eq("id", precioExistente.id);
        if (error) throw error;
      } else {
        const { error } = await admin.from("precios_producto").insert({ producto_id: productoId, tier, precio });
        if (error) throw error;
      }
    }
    console.log(`  precios: óptimo ${p.precios.optimo} · medio ${p.precios.medio} · deseado ${p.precios.deseado}`);
  }
  console.log("\n✓ Catálogo de ejemplo cargado.");
}

main().catch((err) => {
  console.error("✗ Falló:", err.message);
  process.exit(1);
});
