// Cálculo de impuestos por tipo de IVA (Lamia Derouach).
// Una factura puede tener varios tipos de IVA (21 %, 10 %, 4 %...), así que
// cada línea guarda su propio tipo y el desglose se calcula por separado.
import type { Factura, Impuesto, Linea } from "./types";

// Redondea a 2 decimales (céntimos)
export const redondear = (n: number) => Math.round(n * 100) / 100;

// Agrupa las líneas por tipo de IVA y calcula la base y la cuota de cada tipo
export function calcularDesglose(lineas: Linea[]): Impuesto[] {
  const grupos = new Map<number, number>();
  for (const l of lineas) grupos.set(l.tipoIva, (grupos.get(l.tipoIva) ?? 0) + l.importe);
  return [...grupos.entries()]
    .sort((a, b) => b[0] - a[0]) // de mayor a menor tipo
    .map(([tipo, base]) => ({ tipo, base: redondear(base), cuota: redondear((base * tipo) / 100) }));
}

// Suma de todas las cuotas = importe total de impuestos de la factura
export const totalCuotas = (desglose: Impuesto[]) => redondear(desglose.reduce((s, i) => s + i.cuota, 0));

// Suma de las bases de todos los tipos
export const totalBases = (desglose: Impuesto[]) => redondear(desglose.reduce((s, i) => s + i.base, 0));

// Si solo conocemos base e impuestos (facturas antiguas o con poca información),
// deducimos el tipo de IVA con la proporción. Se ajusta al medio punto más cercano (21, 10, 7.5, 4...).
export function desgloseDeTotales(base: number, impuestos: number): Impuesto[] {
  if (base <= 0 && impuestos <= 0) return [];
  const tipo = base > 0 ? Math.round(((impuestos / base) * 100) * 2) / 2 : 0;
  return [{ tipo, base: redondear(base), cuota: redondear(impuestos) }];
}

// Compara dos desgloses (mismos tipos, bases y cuotas con 1 céntimo de margen)
export function mismoDesglose(a: Impuesto[], b: Impuesto[]): boolean {
  if (a.length !== b.length) return false;
  const orden = (x: Impuesto[]) => [...x].sort((p, q) => q.tipo - p.tipo);
  const A = orden(a);
  const B = orden(b);
  return A.every(
    (x, i) => x.tipo === B[i].tipo && Math.abs(x.base - B[i].base) < 0.02 && Math.abs(x.cuota - B[i].cuota) < 0.02,
  );
}

// Completa una factura que venga sin desglose o sin tipo de IVA en las líneas
// (por ejemplo, un JSON antiguo de n8n o una factura de ejemplo).
export function completarImpuestos(f: Omit<Factura, "desglose" | "lineas"> & { desglose?: Impuesto[]; lineas: (Omit<Linea, "tipoIva"> & { tipoIva?: number })[] }): Factura {
  const desglose = f.desglose?.length ? f.desglose : desgloseDeTotales(f.baseImponible, f.impuestos);
  // Tipo por defecto: el del impuesto con más base
  const tipoPorDefecto = [...desglose].sort((a, b) => b.base - a.base)[0]?.tipo ?? 21;
  return { ...f, desglose, lineas: f.lineas.map((l) => ({ ...l, tipoIva: l.tipoIva ?? tipoPorDefecto })) };
}
