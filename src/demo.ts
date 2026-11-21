// Facturas de ejemplo para enseñar la aplicación sin conectar el correo.
// Usa los PDF de /public/muestras y los pasa por el mismo lector real.
import { guardarFactura, hoy, vaciarBase } from "./db";
import { procesarPdf } from "./parser";
import { completarImpuestos } from "./impuestos";

const archivos = ["factura-papeleria-central.pdf", "factura-tecnosur.pdf", "factura-limpiezas-aurora.pdf"];

function haceDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function cargarEjemplos(): Promise<number> {
  const remitentes = ["compras@papeleriacentral.es", "facturas@tecnosur.es", "admin@limpiezasaurora.es"];
  let n = 0;
  for (let i = 0; i < archivos.length; i++) {
    const resp = await fetch(`${import.meta.env.BASE_URL}muestras/${archivos[i]}`);
    const blob = await resp.blob();
    const f = await procesarPdf(new File([blob], archivos[i], { type: "application/pdf" }), remitentes[i]);
    await guardarFactura(f);
    n++;
  }
  // Dos facturas más antiguas, ya validadas, para que las consultas por semana/mes tengan datos
  const antiguas: Parameters<typeof completarImpuestos>[0][] = [
    {
      numero: "EL-2026-0099", proveedor: "Electricidad Levante S.A.", proveedorNif: "A55667788",
      cliente: "Estudio Derouach", clienteNif: "12345678Z", fechaEmision: haceDias(3), fechaVencimiento: haceDias(-27),
      baseImponible: 210, impuestos: 44.1, total: 254.1, estado: "validada", archivo: "luz-octubre.pdf",
      remitente: "facturacion@electricidadlevante.es", fechaRecepcion: haceDias(3),
      lineas: [{ concepto: "Consumo eléctrico", cantidad: 1, precioUnitario: 210, descuento: 0, importe: 210 }],
    },
    {
      numero: "MG-2026-310", proveedor: "Mobiliario García", proveedorNif: "B99887766",
      cliente: "Estudio Derouach", clienteNif: "12345678Z", fechaEmision: haceDias(12), fechaVencimiento: haceDias(-18),
      baseImponible: 520, impuestos: 109.2, total: 629.2, estado: "validada", archivo: "sillas.pdf",
      remitente: "ventas@mobiliariogarcia.es", fechaRecepcion: haceDias(12),
      lineas: [{ concepto: "Silla de oficina", cantidad: 4, precioUnitario: 130, descuento: 0, importe: 520 }],
    },
  ];
  for (const f of antiguas) { await guardarFactura(completarImpuestos(f)); n++; }
  return n;
}

export async function vaciarTodo() {
  await vaciarBase();
}

export { hoy };
