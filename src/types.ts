// Tipos de datos de la aplicación (Lamia Derouach)

export type Estado = "pendiente" | "validada";

// Una empresa (sirve para proveedores y clientes)
export interface Empresa {
  id?: number;
  nombre: string;
  nif: string;
}

export interface Linea {
  id?: number;
  facturaId?: number;
  concepto: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number; // porcentaje
  importe: number;
  tipoIva: number; // % de IVA de esta línea (21, 10, 4, 0...)
}

// Desglose de impuestos: una fila por cada tipo de IVA de la factura
export interface Impuesto {
  id?: number;
  tipo: number; // porcentaje
  base: number; // base sobre la que se aplica
  cuota: number; // importe del impuesto
}

// Fila de la tabla facturas (solo guarda los ids de proveedor y cliente)
export interface FacturaFila {
  id?: number;
  numero: string;
  proveedorId: number;
  clienteId: number | null;
  fechaEmision: string; // AAAA-MM-DD
  fechaVencimiento: string; // puede ir vacío
  baseImponible: number;
  impuestos: number;
  total: number;
  estado: Estado;
  archivo: string;
  remitente: string;
  fechaRecepcion: string; // AAAA-MM-DD
}

// Factura "completa" que usa la interfaz: con nombres y líneas ya unidos
export interface Factura {
  id?: number;
  numero: string;
  proveedor: string;
  proveedorNif: string;
  cliente: string;
  clienteNif: string;
  fechaEmision: string;
  fechaVencimiento: string;
  baseImponible: number;
  impuestos: number;
  total: number;
  estado: Estado;
  archivo: string;
  remitente: string;
  fechaRecepcion: string;
  lineas: Linea[];
  desglose: Impuesto[]; // impuestos separados por tipo
}
