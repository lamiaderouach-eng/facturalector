// Base de datos local del navegador (IndexedDB con Dexie).
// Tablas normalizadas: proveedores, clientes, facturas y lineas.
import Dexie, { Table } from "dexie";
import type { Empresa, Factura, FacturaFila, Linea } from "./types";

class BaseFacturas extends Dexie {
  proveedores!: Table<Empresa, number>;
  clientes!: Table<Empresa, number>;
  facturas!: Table<FacturaFila, number>;
  lineas!: Table<Linea, number>;

  constructor() {
    super("facturas-lamia");
    this.version(1).stores({
      proveedores: "++id, nombre",
      clientes: "++id, nombre",
      facturas: "++id, numero, proveedorId, fechaEmision, fechaRecepcion, estado",
      lineas: "++id, facturaId",
    });
  }
}

export const db = new BaseFacturas();

// Hoy en formato AAAA-MM-DD (hora local)
export function hoy(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Busca una empresa por nombre en la tabla; si no existe, la crea
async function buscarOCrear(tabla: Table<Empresa, number>, nombre: string, nif: string): Promise<number> {
  const limpio = nombre.trim();
  const existente = await tabla.where("nombre").equalsIgnoreCase(limpio).first();
  if (existente?.id !== undefined) {
    if (nif && existente.nif !== nif) await tabla.update(existente.id, { nif });
    return existente.id;
  }
  return (await tabla.add({ nombre: limpio, nif })) as number;
}

// Guarda una factura nueva (o actualiza si trae id)
export async function guardarFactura(f: Factura): Promise<number> {
  return db.transaction("rw", db.proveedores, db.clientes, db.facturas, db.lineas, async () => {
    const proveedorId = await buscarOCrear(db.proveedores, f.proveedor || "Proveedor desconocido", f.proveedorNif);
    const clienteId = f.cliente.trim() ? await buscarOCrear(db.clientes, f.cliente, f.clienteNif) : null;
    const fila: FacturaFila = {
      numero: f.numero,
      proveedorId,
      clienteId,
      fechaEmision: f.fechaEmision,
      fechaVencimiento: f.fechaVencimiento,
      baseImponible: f.baseImponible,
      impuestos: f.impuestos,
      total: f.total,
      estado: f.estado,
      archivo: f.archivo,
      remitente: f.remitente,
      fechaRecepcion: f.fechaRecepcion,
    };
    let id: number;
    if (f.id !== undefined) {
      id = f.id;
      await db.facturas.update(id, { ...fila });
      await db.lineas.where("facturaId").equals(id).delete();
    } else {
      id = (await db.facturas.add(fila)) as number;
    }
    await db.lineas.bulkAdd(f.lineas.map(({ id: _quitar, ...l }) => ({ ...l, facturaId: id })));
    return id;
  });
}

// Une una fila de factura con su proveedor, cliente y líneas
async function unir(fila: FacturaFila): Promise<Factura> {
  const prov = await db.proveedores.get(fila.proveedorId);
  const cli = fila.clienteId ? await db.clientes.get(fila.clienteId) : undefined;
  const lineas = await db.lineas.where("facturaId").equals(fila.id!).toArray();
  return {
    id: fila.id,
    numero: fila.numero,
    proveedor: prov?.nombre ?? "",
    proveedorNif: prov?.nif ?? "",
    cliente: cli?.nombre ?? "",
    clienteNif: cli?.nif ?? "",
    fechaEmision: fila.fechaEmision,
    fechaVencimiento: fila.fechaVencimiento,
    baseImponible: fila.baseImponible,
    impuestos: fila.impuestos,
    total: fila.total,
    estado: fila.estado,
    archivo: fila.archivo,
    remitente: fila.remitente,
    fechaRecepcion: fila.fechaRecepcion,
    lineas,
  };
}

export async function listarFacturas(): Promise<Factura[]> {
  const filas = await db.facturas.orderBy("fechaRecepcion").reverse().toArray();
  return Promise.all(filas.map(unir));
}

export async function obtenerFactura(id: number): Promise<Factura | undefined> {
  const fila = await db.facturas.get(id);
  return fila ? unir(fila) : undefined;
}

export async function borrarFactura(id: number): Promise<void> {
  await db.transaction("rw", db.facturas, db.lineas, async () => {
    await db.lineas.where("facturaId").equals(id).delete();
    await db.facturas.delete(id);
  });
}
