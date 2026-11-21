// Lectura e interpretación de facturas en PDF.
// Paso 1: sacar el texto del PDF con pdf.js. Paso 2: buscar los datos con expresiones regulares.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Factura, Impuesto, Linea } from "./types";
import { hoy } from "./db";
import { desgloseDeTotales, redondear } from "./impuestos";

// ---------- 1. Sacar las líneas de texto del PDF ----------
export async function leerLineasPdf(datos: ArrayBuffer): Promise<string[]> {
  // pdf.js se carga solo cuando se necesita, así la app abre aunque el móvil sea antiguo
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: datos }).promise;
  const resultado: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const pagina = await pdf.getPage(p);
    const contenido = await pagina.getTextContent();
    // Agrupamos los trozos de texto que estén a la misma altura (misma línea)
    const filas = new Map<number, { x: number; texto: string }[]>();
    for (const it of contenido.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5] / 3); // tolerancia pequeña
      const x = it.transform[4];
      if (!filas.has(y)) filas.set(y, []);
      filas.get(y)!.push({ x, texto: it.str });
    }
    const ys = [...filas.keys()].sort((a, b) => b - a); // de arriba a abajo
    for (const y of ys) {
      const trozos = filas.get(y)!.sort((a, b) => a.x - b.x);
      resultado.push(trozos.map((t) => t.texto).join(" ").replace(/\s+/g, " ").trim());
    }
  }
  return resultado;
}

// ---------- 2. Utilidades ----------
// Convierte "1.234,56" o "1234.56" en número
export function aNumero(texto: string | undefined): number {
  if (!texto) return 0;
  let t = texto.replace(/[€\sA-Za-z]/g, "");
  if (t.includes(",") && t.includes(".")) {
    // el último símbolo es el decimal
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) t = t.replace(/\./g, "").replace(",", ".");
    else t = t.replace(/,/g, "");
  } else if (t.includes(",")) {
    t = t.replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, ""); // 1.200 -> 1200
  }
  const n = parseFloat(t);
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

// Convierte una fecha 25/03/2026, 25-03-26 o 2026-03-25 a AAAA-MM-DD
export function aFechaIso(texto: string | undefined): string {
  if (!texto) return "";
  let m = texto.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = texto.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const anio = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${anio}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "";
}

const FECHA = String.raw`(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})`;
const NIF = /\b(?:NIF|CIF|VAT)\s*[:.]?\s*([A-Z]?\d{7,8}[A-Z]?)\b/i;

function buscar(lineas: string[], regex: RegExp): string | undefined {
  for (const l of lineas) {
    const m = l.match(regex);
    if (m) return m[1];
  }
  return undefined;
}

// ---------- 3. Interpretar la factura ----------
export function interpretarFactura(lineasTexto: string[], archivo: string, remitente = ""): Factura {
  const todo = lineasTexto.join("\n");

  // Número de factura
  const numero =
    buscar(lineasTexto, /n[ºo°]\s*(?:de\s*)?factura\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-]+)/i) ??
    buscar(lineasTexto, /factura\s*(?:n[ºo°.]|num\.?|número)\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-]+)/i) ??
    buscar(lineasTexto, /invoice\s*(?:no\.?|number|#)\s*[:.]?\s*([A-Z0-9][A-Z0-9\/\-]+)/i) ??
    buscar(lineasTexto, /\b([A-Z]{1,4}[-\/]?\d{4}[-\/]\d{2,6})\b/) ??
    "";

  // Fechas
  const emision = aFechaIso(
    buscar(lineasTexto, new RegExp(String.raw`fecha\s*(?:de\s*)?(?:emisi[oó]n|factura)?\s*[:.]?\s*` + FECHA, "i")),
  );
  const vencimiento = aFechaIso(buscar(lineasTexto, new RegExp(String.raw`vencimiento\s*[:.]?\s*` + FECHA, "i")));

  // Emisor y cliente
  let proveedor = buscar(lineasTexto, /^(?:emisor|proveedor)\s*[:.]\s*(.+)$/i) ?? "";
  let cliente = buscar(lineasTexto, /^(?:cliente|facturar a|receptor)\s*[:.]\s*(.+)$/i) ?? "";
  if (!proveedor) {
    // Si no hay etiqueta, el emisor suele ser la primera línea que no sea el título
    proveedor = lineasTexto.find((l) => !/^factura|^invoice|^\d/i.test(l)) ?? "";
  }
  proveedor = proveedor.replace(NIF, "").replace(/[,\-–]\s*$/, "").trim();
  cliente = cliente.replace(NIF, "").replace(/[,\-–]\s*$/, "").trim();

  // NIF: el primero es del emisor y el segundo del cliente
  const nifs = [...todo.matchAll(new RegExp(NIF.source, "gi"))].map((m) => m[1]);
  const idxCliente = lineasTexto.findIndex((l) => /^(?:cliente|facturar a|receptor)/i.test(l));
  let proveedorNif = nifs[0] ?? "";
  let clienteNif = "";
  if (idxCliente >= 0) {
    const nifCli = lineasTexto.slice(idxCliente, idxCliente + 4).join(" ").match(NIF);
    clienteNif = nifCli?.[1] ?? "";
    const antes = lineasTexto.slice(0, idxCliente).join(" ").match(NIF);
    proveedorNif = antes?.[1] ?? "";
  }

  // Líneas de detalle: entre la cabecera de la tabla y la base imponible
  const lineas: Linea[] = [];
  const inicio = lineasTexto.findIndex((l) => /(concepto|descripci[oó]n)/i.test(l) && /cant/i.test(l));
  if (inicio >= 0) {
    for (let i = inicio + 1; i < lineasTexto.length; i++) {
      const l = lineasTexto[i];
      if (/^(subtotal|base imponible|total|iva)/i.test(l)) break;
      // concepto  cantidad  precio  [descuento%]  importe  [IVA%]
      const m = l.match(
        /^(.+?)\s+(\d+(?:[.,]\d+)?)\s+([\d.,]+)\s*€?\s+(?:(\d+(?:[.,]\d+)?)\s*%\s+)?([\d.,]+)\s*€?(?:\s+(\d+(?:[.,]\d+)?)\s*%)?$/,
      );
      if (m) {
        lineas.push({
          concepto: m[1].trim(),
          cantidad: aNumero(m[2]),
          precioUnitario: aNumero(m[3]),
          descuento: aNumero(m[4]),
          importe: aNumero(m[5]),
          // si la fila trae su IVA lo guardamos; si no, se rellena más abajo
          tipoIva: m[6] !== undefined ? aNumero(m[6]) : -1,
        });
      }
    }
  }

  // Importes
  let baseImponible = aNumero(buscar(lineasTexto, /^base\s*imponible\s*:?\s*([\d.,]+)\s*€?$/i));

  // Impuestos: una factura puede tener varios tipos de IVA, así que se leen todos por separado
  const desglose = leerDesglose(lineasTexto);
  const impuestos = desglose.length
    ? redondear(desglose.reduce((s, i) => s + i.cuota, 0))
    : aNumero(buscar(lineasTexto, /(?:iva|igic|impuestos?)\s*(?:\(?\s*\d+(?:[.,]\d+)?\s*%\s*\)?)?\s*:?\s*([\d.,]+)/i));
  const lineasTotal = lineasTexto.filter((l) => /^total\b/i.test(l));
  let total = aNumero(lineasTotal.length ? lineasTotal[lineasTotal.length - 1].match(/([\d.,]+)\s*€?$/)?.[1] : "");

  // Si falta algo lo calculamos con lo que sí tenemos
  if (!baseImponible && desglose.length) baseImponible = redondear(desglose.reduce((s, i) => s + i.base, 0));
  if (!baseImponible && lineas.length) baseImponible = redondear(lineas.reduce((s, l) => s + l.importe, 0));
  if (!total && baseImponible) total = redondear(baseImponible + impuestos);
  // Con un solo tipo de IVA, la base de ese tipo es la base imponible de la factura
  if (desglose.length === 1 && baseImponible > 0) desglose[0].base = baseImponible;
  // Si no había desglose pero sí base e impuestos, lo deducimos
  if (!desglose.length) desglose.push(...desgloseDeTotales(baseImponible, impuestos));

  // Las líneas sin IVA propio usan el tipo de la factura (si hay varios, el del tipo con más base)
  const tipoPorDefecto = [...desglose].sort((a, b) => b.base - a.base)[0]?.tipo ?? 21;
  for (const l of lineas) if (l.tipoIva < 0) l.tipoIva = tipoPorDefecto;
  return {
    numero,
    proveedor,
    proveedorNif,
    cliente,
    clienteNif,
    fechaEmision: emision,
    fechaVencimiento: vencimiento,
    baseImponible,
    impuestos,
    total,
    estado: "pendiente",
    archivo,
    remitente,
    fechaRecepcion: hoy(),
    lineas,
    desglose,
  };
}

// Lee el IVA separado por tipos. Entiende líneas como:
//   "IVA (21%): 12,34 €"   "IVA 10% sobre 100,00 €: 10,00 €"   "Base imponible 21%: 58,80 €"
function leerDesglose(lineasTexto: string[]): Impuesto[] {
  const basesPorTipo = new Map<number, number>();
  for (const l of lineasTexto) {
    const m = l.match(/^base\s*imponible\s*\(?\s*(\d+(?:[.,]\d+)?)\s*%\s*\)?\s*:?\s*([\d.,]+)/i);
    if (m) basesPorTipo.set(aNumero(m[1]), aNumero(m[2]));
  }
  const resultado: Impuesto[] = [];
  for (const l of lineasTexto) {
    const m = l.match(
      /^(?:iva|igic|impuestos?)\s*\(?\s*(\d+(?:[.,]\d+)?)\s*%\s*\)?\s*(?:sobre\s*([\d.,]+)\s*€?)?\s*:?\s*([\d.,]+)\s*€?$/i,
    );
    if (!m) continue;
    const tipo = aNumero(m[1]);
    const cuota = aNumero(m[3]);
    // La base sale de la línea "Base imponible X%", de "sobre N" o se calcula con la cuota
    const base = basesPorTipo.get(tipo) ?? (m[2] ? aNumero(m[2]) : tipo > 0 ? redondear((cuota * 100) / tipo) : 0);
    // Si el mismo tipo sale dos veces, se suman
    const existente = resultado.find((r) => r.tipo === tipo);
    if (existente) {
      existente.base = redondear(existente.base + base);
      existente.cuota = redondear(existente.cuota + cuota);
    } else resultado.push({ tipo, base, cuota });
  }
  return resultado.sort((a, b) => b.tipo - a.tipo);
}

// Función que usa la interfaz: recibe el archivo y devuelve la factura interpretada
export async function procesarPdf(archivo: File, remitente = "subida manual"): Promise<Factura> {
  const lineas = await leerLineasPdf(await archivo.arrayBuffer());
  return interpretarFactura(lineas, archivo.name, remitente);
}
