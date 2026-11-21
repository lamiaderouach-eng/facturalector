// Asistente de consulta: entiende preguntas en lenguaje natural (texto o voz)
// y responde SIEMPRE con los datos guardados en la base de datos.
// No usa IA generativa: detecta la intención con palabras clave (y sus sinónimos),
// calcula los importes con las facturas reales y, si no entiende, propone ejemplos.
import { listarFacturas, hoy } from "./db";
import { redondear } from "./impuestos";
import type { Factura } from "./types";

// Quita tildes y signos y pasa a minúsculas para comparar más fácil
const limpiar = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[¿?¡!]/g, " ").replace(/\s+/g, " ").trim();

export const euros = (n: number) =>
  n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });

// ¿La pregunta contiene alguna de estas palabras o expresiones?
const tiene = (p: string, ...palabras: RegExp[]) => palabras.some((r) => r.test(p));

// Fecha de hace n días en formato AAAA-MM-DD
function haceDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Lunes de la semana actual en formato AAAA-MM-DD
function inicioSemana(): string {
  return haceDias((new Date().getDay() + 6) % 7); // lunes = 0
}

type Periodo = { nombre: string; filtro: (f: Factura) => boolean };

function detectarPeriodo(p: string): Periodo {
  if (tiene(p, /\bayer\b/)) return { nombre: "ayer", filtro: (f) => f.fechaRecepcion === haceDias(1) };
  if (tiene(p, /\bhoy\b/, /\bdel dia\b/, /\bdia\b/)) return { nombre: "hoy", filtro: (f) => f.fechaRecepcion === hoy() };
  if (tiene(p, /\bsemana\b/, /\bsemanal/)) {
    const lunes = inicioSemana();
    return { nombre: "esta semana", filtro: (f) => f.fechaRecepcion >= lunes };
  }
  if (tiene(p, /\bmes\b/, /\bmensual/)) {
    const mes = hoy().slice(0, 7);
    return { nombre: "este mes", filtro: (f) => f.fechaRecepcion.startsWith(mes) };
  }
  return { nombre: "en total", filtro: () => true };
}

const lista = (fs: Factura[]) => fs.map((f) => `• ${f.numero} · ${f.proveedor} · ${euros(f.total)}`).join("\n");

// Importe que aparece en la pregunta ("100", "1.500", "100,50 euros")
function leerImporte(p: string): number | null {
  const m = p.match(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(?:€|euros?|eur)?/);
  if (!m) return null;
  const t = m[1].includes(",") ? m[1].replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(m[1]) ? m[1].replace(/\./g, "") : m[1];
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

export async function responder(pregunta: string): Promise<string> {
  const p = limpiar(pregunta);
  const todas = await listarFacturas();
  if (todas.length === 0) return "Todavía no hay facturas guardadas. Sube un PDF para empezar.";
  const per = detectarPeriodo(p);
  const delPeriodo = todas.filter(per.filtro);

  // Resumen (del día por defecto; si piden semana o mes, de ese periodo)
  if (tiene(p, /resum/, /balance/, /que ha (llegado|pasado)/, /que hay de nuevo/)) {
    const r = per.nombre === "en total" ? todas.filter((f) => f.fechaRecepcion === hoy()) : delPeriodo;
    const nombre = per.nombre === "en total" ? "hoy" : per.nombre;
    if (r.length === 0) return `${nombre === "hoy" ? "Hoy" : nombre[0].toUpperCase() + nombre.slice(1)} no ha llegado ninguna factura.`;
    const total = r.reduce((s, f) => s + f.total, 0);
    const pend = r.filter((f) => f.estado === "pendiente").length;
    const mayor = [...r].sort((a, b) => b.total - a.total)[0];
    return (
      `Resumen (${nombre}):\n• Facturas recibidas: ${r.length}\n• Importe total: ${euros(total)}\n` +
      `• Pendientes de revisar: ${pend}\n• La mayor: ${mayor.numero} de ${mayor.proveedor} (${euros(mayor.total)})\n` +
      `• Proveedores: ${[...new Set(r.map((f) => f.proveedor))].join(", ")}`
    );
  }

  // Impuestos: cuánto IVA, separado por tipo
  if (tiene(p, /\biva\b/, /impuesto/, /\bigic\b/)) {
    if (!delPeriodo.length) return `No hay facturas ${per.nombre}.`;
    const porTipo = new Map<number, { base: number; cuota: number }>();
    for (const f of delPeriodo)
      for (const d of f.desglose) {
        const x = porTipo.get(d.tipo) ?? { base: 0, cuota: 0 };
        porTipo.set(d.tipo, { base: x.base + d.base, cuota: x.cuota + d.cuota });
      }
    const filas = [...porTipo.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([t, x]) => `• IVA ${t} %: ${euros(redondear(x.cuota))} sobre una base de ${euros(redondear(x.base))}`);
    const total = delPeriodo.reduce((s, f) => s + f.impuestos, 0);
    return `Impuestos (${per.nombre}), ${delPeriodo.length} factura(s):\n${filas.join("\n")}\nTotal de impuestos: ${euros(redondear(total))}`;
  }

  // Facturas ya validadas
  if (tiene(p, /validad/, /revisad/, /confirmad/)) {
    const v = todas.filter((f) => f.estado === "validada");
    return v.length ? `Hay ${v.length} factura(s) validada(s):\n${lista(v)}` : "Todavía no hay ninguna factura validada.";
  }

  // Facturas pendientes de revisar
  if (tiene(p, /pendient/, /\brevisar/, /sin validar/, /por validar/, /sin revisar/, /por revisar/)) {
    const pend = todas.filter((f) => f.estado === "pendiente");
    return pend.length
      ? `Hay ${pend.length} factura(s) pendiente(s) de revisar:\n${lista(pend)}`
      : "No hay facturas pendientes, todas están validadas.";
  }

  // Facturas mayores o menores que un importe
  const importe = leerImporte(p);
  const mayorQue = tiene(p, /superior/, /\bmayor(es)? (de|que|a)\b/, /\bmas (de|que)\b/, /por encima/, /supera/, /excede/, /pasa de/);
  const menorQue = tiene(p, /inferior/, /\bmenor(es)? (de|que|a)\b/, /\bmenos (de|que)\b/, /por debajo/);
  if (importe !== null && (mayorQue || menorQue)) {
    const r = delPeriodo.filter((f) => (mayorQue ? f.total > importe : f.total < importe));
    const palabra = mayorQue ? "superior(es)" : "inferior(es)";
    return r.length
      ? `Sí, hay ${r.length} factura(s) ${palabra} a ${euros(importe)} (${per.nombre}):\n${lista(r)}`
      : `No hay ninguna factura ${mayorQue ? "superior" : "inferior"} a ${euros(importe)} (${per.nombre}).`;
  }

  // Factura de mayor o menor importe
  if (tiene(p, /mayor importe/, /mas cara/, /mas alta/, /mas grande/, /maxim/, /la mayor/, /mas costosa/)) {
    if (!delPeriodo.length) return `No hay facturas ${per.nombre}.`;
    const m = [...delPeriodo].sort((a, b) => b.total - a.total)[0];
    return `La factura de mayor importe (${per.nombre}) es la ${m.numero} de ${m.proveedor}: ${euros(m.total)}.`;
  }
  if (tiene(p, /menor importe/, /mas barata/, /mas baja/, /mas pequena/, /minim/, /la menor/)) {
    if (!delPeriodo.length) return `No hay facturas ${per.nombre}.`;
    const m = [...delPeriodo].sort((a, b) => a.total - b.total)[0];
    return `La factura de menor importe (${per.nombre}) es la ${m.numero} de ${m.proveedor}: ${euros(m.total)}.`;
  }

  // Qué proveedores han enviado facturas
  if (tiene(p, /que proveedores/, /cuantos proveedores/, /quien (ha )?(enviado|mandado)/, /lista de proveedores/, /quienes han/)) {
    const nombres = [...new Set(delPeriodo.map((f) => f.proveedor))];
    return nombres.length ? `Proveedores (${per.nombre}): ${nombres.join(", ")}.` : `Nadie ha enviado facturas ${per.nombre}.`;
  }

  // Importe total facturado
  if (tiene(p, /importe total/, /total facturado/, /cuanto (se ha |hemos |han )?factur/, /cuanto (suma|importa|es el total|dinero)/, /suma de las facturas/, /\bgasto/)) {
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
  if (tiene(p, /cuantas/, /numero de facturas/, /cantidad de facturas/, /han llegado/, /ha llegado/, /llegaron/)) {
    return `Han llegado ${delPeriodo.length} factura(s) ${per.nombre}.`;
  }

  return (
    "No he entendido bien la pregunta. Prueba con:\n• ¿Cuántas facturas han llegado hoy?\n• ¿Hay alguna factura superior a 100 €?\n" +
    "• Hazme un resumen del día\n• ¿Cuánto IVA hay esta semana?\n• ¿Qué proveedores han enviado facturas esta semana?\n" +
    "• ¿Hay alguna factura pendiente de revisar?"
  );
}
