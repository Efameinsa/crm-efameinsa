// Reportado por Santos 26-08 (pidió revisar CO401/CO402/CO408 contra sus
// Word): a las tres les faltaba "Capacidad de Carga: 500 kg" en MEDIDAS
// GENERALES -- está en los tres Word, entre la altura con ruedas y el peso
// neto, y nunca se cargó. Colores revisados contra el maestro de Lesly:
// coinciden exacto, no se tocan.

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const SKUS = ['CO401', 'CO402', 'CO408'];

for (const sku of SKUS) {
  const { data: producto, error: errBuscar } = await supabase
    .from('productos')
    .select('id, ficha')
    .eq('sku', sku)
    .single();
  if (errBuscar) { console.error(sku, 'no encontrado:', errBuscar.message); continue; }

  const medidas = producto.ficha.medidas;
  const idxPeso = medidas.findIndex((m) => /^Peso Neto/i.test(m));
  if (idxPeso === -1) { console.error(sku, 'no se encontró "Peso Neto" en medidas, se omite'); continue; }
  if (medidas.some((m) => /^Capacidad de Carga/i.test(m))) { console.log(sku, 'ya tiene Capacidad de Carga, se omite'); continue; }

  const nuevasMedidas = [...medidas.slice(0, idxPeso), 'Capacidad de Carga: 500 kg', ...medidas.slice(idxPeso)];
  const ficha = { ...producto.ficha, medidas: nuevasMedidas };

  const { error: errUpd } = await supabase.from('productos').update({ ficha }).eq('id', producto.id);
  if (errUpd) { console.error(sku, 'error actualizando ficha:', errUpd.message); continue; }
  console.log(sku, '-> Capacidad de Carga: 500 kg agregada antes de Peso Neto');
}
process.exit(0);
