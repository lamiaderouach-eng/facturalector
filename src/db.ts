// Base de datos compartida en la nube (Supabase, PostgreSQL).
// Tablas normalizadas: proveedores, clientes, facturas y lineas.
// Se usa la API REST de Supabase con fetch, sin librerías extra.
import { SUPABASE_URL, SUPABASE_CLAVE } from "./config";
import type { Factura, Impuesto, Linea } from "./types";
import { desgloseDeTotales } from "./impuestos";

const BASE = `${SUPABASE_URL}/rest/v1`;

// Cabeceras que pide Supabase en cada petición
const cabeceras = {
  apikey: SUPABASE_CLAVE,
  Authorization: `Bearer ${SUPABASE_CLAVE}`,
  "Content-Type": "application/json",
};

// Hace una petición y devuelve el JSON (o null si no hay respuesta)
async function pedir<T = unknown>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${BASE}/${ruta}`, {
    ...opciones,
    headers: { ...cabeceras, ...(opciones.headers as Record<string, string> | undefined) },
  });
  if (!resp.ok) throw new Error(`Error de la base de datos (${resp.status}): ${await resp.text()}`);
  const texto = await resp.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

// Hoy en formato AAAA-MM-DD (hora local)
export function hoy(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Busca una empresa por nombre en la tabla; si no existe, la crea
async function buscarOCrear(tabla: "proveedores" | "clientes", nombre: string, nif: string): Promise<number> {
  const limpio = nombre.trim();
  // Se escapan % y _ para que ilike compare el texto tal cual
  const patron = limpio.replace(/[\\%_]/g, (c) => `\\${c}`);
  const encontrados = await pedir<{ id: number; nif: string | null }[]>(
    `${tabla}?select=id,nif&nombre=ilike.${encodeURIComponent(patron)}&limit=1`,
  );
  if (encontrados.length > 0) {
    const ex = encontrados[0];
    if (nif && ex.nif !== nif) {
      await pedir(`${tabla}?id=eq.${ex.id}`, { method: "PATCH", body: JSON.stringify({ nif }) });
    }
    return ex.id;
  }
  const nuevo = await pedir<{ id: number }[]>(tabla, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ nombre: limpio, nif }),
  });
  return nuevo[0].id;
}

// Guarda una factura nueva (o actualiza si trae id)
export async function guardarFactura(f: Factura): Promise<number> {
  const proveedorId = await buscarOCrear("proveedores", f.proveedor || "Proveedor desconocido", f.proveedorNif);
  const clienteId = f.cliente.trim() ? await buscarOCrear("clientes", f.cliente, f.clienteNif) : null;
  // Las fechas vacías se guardan como null
  const fila = {
    numero: f.numero,
    proveedor_id: proveedorId,
    cliente_id: clienteId,
    fecha_emision: f.fechaEmision || null,
    fecha_vencimiento: f.fechaVencimiento || null,
    base_imponible: f.baseImponible,
    impuestos: f.impuestos,
    total: f.total,
    estado: f.estado,
    archivo: f.archivo,
    remitente: f.remitente,
    fecha_recepcion: f.fechaRecepcion || hoy(),
  };
  let id: number;
  if (f.id !== undefined) {
    id = f.id;
    await pedir(`facturas?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(fila) });
    await pedir(`lineas?factura_id=eq.${id}`, { method: "DELETE" });
    await pedir(`desglose_iva?factura_id=eq.${id}`, { method: "DELETE" });
  } else {
    const nueva = await pedir<{ id: number }[]>("facturas", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(fila),
    });
    id = nueva[0].id;
  }
  if (f.lineas.length > 0) {
    await pedir("lineas", {
      method: "POST",
      body: JSON.stringify(
        f.lineas.map((l) => ({
          factura_id: id,
          concepto: l.concepto,
          cantidad: l.cantidad,
          precio_unitario: l.precioUnitario,
          descuento: l.descuento,
          importe: l.importe,
          tipo_iva: l.tipoIva,
        })),
      ),
    });
  }
  // Desglose de impuestos: una fila por cada tipo de IVA
  if (f.desglose.length > 0) {
    await pedir("desglose_iva", {
      method: "POST",
      body: JSON.stringify(f.desglose.map((d) => ({ factura_id: id, tipo: d.tipo, base: d.base, cuota: d.cuota }))),
    });
  }
  return id;
}

// Forma de una factura tal como la devuelve Supabase (con proveedor, cliente y líneas unidos)
interface FilaNube {
  id: number;
  numero: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  base_imponible: number;
  impuestos: number;
  total: number;
  estado: "pendiente" | "validada";
  archivo: string | null;
  remitente: string | null;
  fecha_recepcion: string;
  proveedores: { nombre: string; nif: string | null } | null;
  clientes: { nombre: string; nif: string | null } | null;
  lineas: {
    id: number;
    factura_id: number;
    concepto: string;
    cantidad: number;
    precio_unitario: number;
    descuento: number;
    importe: number;
    tipo_iva: number;
  }[];
  desglose_iva: { id: number; tipo: number; base: number; cuota: number }[];
}

// Pasa una fila de la nube al formato que usa la interfaz
function aFactura(r: FilaNube): Factura {
  const lineas: Linea[] = [...r.lineas]
    .sort((a, b) => a.id - b.id)
    .map((l) => ({
      id: l.id,
      facturaId: l.factura_id,
      concepto: l.concepto,
      cantidad: Number(l.cantidad),
      precioUnitario: Number(l.precio_unitario),
      descuento: Number(l.descuento),
      importe: Number(l.importe),
      tipoIva: Number(l.tipo_iva ?? 21),
    }));
  let desglose: Impuesto[] = [...(r.desglose_iva ?? [])]
    .sort((a, b) => Number(b.tipo) - Number(a.tipo))
    .map((d) => ({ id: d.id, tipo: Number(d.tipo), base: Number(d.base), cuota: Number(d.cuota) }));
  // Facturas antiguas sin desglose: lo deducimos de la base y los impuestos
  if (desglose.length === 0) desglose = desgloseDeTotales(Number(r.base_imponible), Number(r.impuestos));
  return {
    id: r.id,
    numero: r.numero,
    proveedor: r.proveedores?.nombre ?? "",
    proveedorNif: r.proveedores?.nif ?? "",
    cliente: r.clientes?.nombre ?? "",
    clienteNif: r.clientes?.nif ?? "",
    fechaEmision: r.fecha_emision ?? "",
    fechaVencimiento: r.fecha_vencimiento ?? "",
    baseImponible: Number(r.base_imponible),
    impuestos: Number(r.impuestos),
    total: Number(r.total),
    estado: r.estado,
    archivo: r.archivo ?? "",
    remitente: r.remitente ?? "",
    fechaRecepcion: r.fecha_recepcion,
    lineas,
    desglose,
  };
}

// Una sola petición trae la factura con su proveedor, cliente, líneas y desglose de IVA
const UNIR = "select=*,proveedores(nombre,nif),clientes(nombre,nif),lineas(*),desglose_iva(*)";

export async function listarFacturas(): Promise<Factura[]> {
  const filas = await pedir<FilaNube[]>(`facturas?${UNIR}&order=fecha_recepcion.desc,id.desc`);
  return filas.map(aFactura);
}

export async function obtenerFactura(id: number): Promise<Factura | undefined> {
  const filas = await pedir<FilaNube[]>(`facturas?${UNIR}&id=eq.${id}`);
  return filas.length > 0 ? aFactura(filas[0]) : undefined;
}

export async function borrarFactura(id: number): Promise<void> {
  // Las líneas se borran solas (ON DELETE CASCADE)
  await pedir(`facturas?id=eq.${id}`, { method: "DELETE" });
}

// Borra todas las facturas con sus líneas y su desglose de IVA.
// Los proveedores y clientes se conservan (así no se pierden sus NIF).
export async function vaciarBase(): Promise<void> {
  await pedir("desglose_iva?id=gt.0", { method: "DELETE" });
  await pedir("lineas?id=gt.0", { method: "DELETE" });
  await pedir("facturas?id=gt.0", { method: "DELETE" });
}