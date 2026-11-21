// Asistente de consulta: entiende preguntas en lenguaje natural (texto o voz)
// y responde SIEMPRE con los datos guardados en la base de datos.
import { listarFacturas, hoy } from "./db";
import type { Factura } from "./types";

// Quita tildes y pasa a minúsculas para comparar más fácil
const limpiar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const euros = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

// Lunes de la semana actual en formato AAAA-MM-DD
function inicioSemana(): string {
  const d = new Date();
  const dia = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dia);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Periodo = { nombre: string; filtro: (f: Factura) => boolean };

function detectarPeriodo(p: string): Periodo {
  if (p.includes("hoy") || p.includes("dia")) return { nombre: "hoy", filtro: (f) => f.fechaRecepcion === hoy() };
  if (p.includes("semana")) {
    const lunes = inicioSemana();
    return { nombre: "esta semana", filtro: (f) => f.fechaRecepcion >= lunes };
  }
  if (p.includes("mes")) {
    const mes = hoy().slice(0, 7);
    return { nombre: "este mes", filtro: (f) => f.fechaRecepcion.startsWith(mes) };
  }
  return { nombre: "en total", filtro: () => true };
}

const lista = (fs: Factura[]) =>
  fs.map((f) => `• ${f.numero} · ${f.proveedor} · ${euros(f.total)}`).join("\n");

export async function responder(pregunta: string): Promise<string> {
  const p = limpiar(pregunta);
  const todas = await listarFacturas();
  if (todas.length === 0) return "Todavía no hay facturas guardadas. Sube un PDF o carga las de ejemplo.";
  const per = detectarPeriodo(p);
  const delPeriodo = todas.filter(per.filtro);

  // Resumen del día
  if (p.includes("resumen")) {
    const dia = todas.filter((f) => f.fechaRecepcion === hoy());
    if (dia.length === 0) return "Hoy no ha llegado ninguna factura.";
    const total = dia.reduce((s, f) => s + f.total, 0);
    const pend = dia.filter((f) => f.estado === "pendiente").length;
    const mayor = [...dia].sort((a, b) => b.total - a.total)[0];
    return (
      `Resumen de hoy:\n• Facturas recibidas: ${dia.length}\n• Importe total: ${euros(total)}\n` +
      `• Pendientes de revisar: ${pend}\n• La mayor: ${mayor.numero} de ${mayor.proveedor} (${euros(mayor.total)})\n` +
      `• Proveedores: ${[...new Set(dia.map((f) => f.proveedor))].join(", ")}`
    );
  }

  // Facturas pendientes de revisar
  if (p.includes("pendiente") || p.includes("revisar") || p.includes("sin validar")) {
    const pend = todas.filter((f) => f.estado === "pendiente");
    return pend.length ? `Hay ${pend.length} factura(s) pendiente(s) de revisar:\n${lista(pend)}` : "No hay facturas pendientes, todas están validadas.";
  }

  // Facturas superiores / inferiores a un importe
  const num = p.match(/(?:superior|mayor|mas|por encima)\s*(?:de|a|que)?\s*(\d+(?:[.,]\d+)?)/);
  if (num) {
    const limite = parseFloat(num[1].replace(",", "."));
    const r = delPeriodo.filter((f) => f.total > limite);
    return r.length
      ? `Sí, hay ${r.length} factura(s) superior(es) a ${euros(limite)} (${per.nombre}):\n${lista(r)}`
      : `No hay ninguna factura superior a ${euros(limite)} (${per.nombre}).`;
  }

  // Factura de mayor importe
  if (p.includes("mayor importe") || p.includes("mas cara") || p.includes("mas alta")) {
    if (!delPeriodo.length) return `No hay facturas ${per.nombre}.`;
    const m = [...delPeriodo].sort((a, b) => b.total - a.total)[0];
    return `La factura de mayor importe (${per.nombre}) es la ${m.numero} de ${m.proveedor}: ${euros(m.total)}.`;
  }

  // Qué proveedores han enviado facturas
  if (p.includes("que proveedores") || p.includes("cuantos proveedores") || p.includes("quien ha enviado")) {
    const nombres = [...new Set(delPeriodo.map((f) => f.proveedor))];
    return nombres.length ? `Proveedores (${per.nombre}): ${nombres.join(", ")}.` : `Nadie ha enviado facturas ${per.nombre}.`;
  }

  // Importe total facturado
  if (p.includes("importe total") || p.includes("total facturado") || p.includes("cuanto se ha facturado") || p.includes("cuanto hemos")) {
    const total = delPeriodo.reduce((s, f) => s + f.total, 0);
    return `El importe total facturado (${per.nombre}) es ${euros(total)} en ${delPeriodo.length} factura(s).`;
  }

  // Facturas de un proveedor concreto (buscamos su nombre dentro de la pregunta)
  const nombres = [...new Set(todas.map((f) => f.proveedor))];
  const prov = nombres.find((n) => {
    const palabras = limpiar(n).split(/\s+/).filter((w) => w.length > 3 && !["s.l.", "s.a."].includes(w));
    return palabras.some((w) => p.includes(w));
  });
  if (prov) {
    const r = todas.filter((f) => f.proveedor === prov);
    return `Sí, hay ${r.length} factura(s) de ${prov}:\n${lista(r)}\nTotal: ${euros(r.reduce((s, f) => s + f.total, 0))}`;
  }

  // Cuántas facturas
  if (p.includes("cuantas") || p.includes("numero de facturas")) {
    return `Han llegado ${delPeriodo.length} factura(s) ${per.nombre}.`;
  }

  return (
    "No he entendido bien la pregunta. Prueba con:\n• ¿Cuántas facturas han llegado hoy?\n• ¿Hay alguna factura superior a 100 €?\n" +
    "• Hazme un resumen del día\n• ¿Qué proveedores han enviado facturas esta semana?\n• ¿Hay alguna factura pendiente de revisar?"
  );
}
