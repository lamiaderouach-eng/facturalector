// Crea facturas PDF de ejemplo para probar la aplicación (Lamia Derouach)
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";

const facturas = [
  {
    archivo: "factura-papeleria-central.pdf",
    numero: "FA-2026-0412", emision: "10/11/2026", venc: "10/12/2026",
    emisor: "Papelería Central S.L.", nifE: "B12345678",
    cliente: "Estudio Derouach", nifC: "12345678Z",
    lineas: [["Cuaderno A4 cuadros", 10, 2.5, 0, 25], ["Bolígrafos azules (caja)", 4, 6.9, 10, 24.84], ["Archivador palanca", 6, 3.2, 0, 19.2]],
  },
  {
    archivo: "factura-tecnosur.pdf",
    numero: "TS-2026-077", emision: "18/11/2026", venc: "18/12/2026",
    emisor: "TecnoSur Informática S.L.", nifE: "B87654321",
    cliente: "Estudio Derouach", nifC: "12345678Z",
    lineas: [["Teclado inalámbrico", 2, 39.9, 0, 79.8], ["Ratón ergonómico", 2, 24.5, 5, 46.55], ["Cable HDMI 2m", 5, 7.9, 0, 39.5]],
  },
  {
    archivo: "factura-limpiezas-aurora.pdf",
    numero: "LA-2026-1105", emision: "20/11/2026", venc: "",
    emisor: "Limpiezas Aurora", nifE: "A11223344",
    cliente: "Estudio Derouach", nifC: "12345678Z",
    lineas: [["Servicio de limpieza mensual", 1, 180, 0, 180], ["Productos de limpieza", 3, 12.5, 0, 37.5]],
  },
  {
    // Factura con dos tipos de IVA: cada fila indica su tipo en la última columna
    archivo: "factura-libreria-mixta.pdf",
    numero: "LM-2026-0031", emision: "21/11/2026", venc: "21/12/2026",
    emisor: "Librería y Tecnología Mediterráneo", nifE: "B44556677",
    cliente: "Estudio Derouach", nifC: "12345678Z", mixta: true,
    lineas: [["Libro de programación", 3, 20, 0, 60, 4], ["Auriculares USB", 2, 15, 0, 30, 21], ["Cuaderno de apuntes", 5, 4, 0, 20, 4]],
  },
];

const fmt = (n) => n.toFixed(2).replace(".", ",");
mkdirSync("muestras", { recursive: true });

for (const f of facturas) {
  const pdf = await PDFDocument.create();
  const pag = pdf.addPage([595, 842]);
  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  const texto = (t, x = 50, usarNegrita = false, size = 11) => {
    pag.drawText(t, { x, y, size, font: usarNegrita ? negrita : fuente, color: rgb(0.1, 0.1, 0.1) });
  };
  const salto = (n = 18) => (y -= n);

  texto("FACTURA", 50, true, 22); salto(30);
  texto(`Emisor: ${f.emisor}`); salto();
  texto(`NIF: ${f.nifE}`); salto();
  texto(`Nº Factura: ${f.numero}`); salto();
  texto(`Fecha de emisión: ${f.emision}`); salto();
  if (f.venc) { texto(`Fecha de vencimiento: ${f.venc}`); salto(); }
  salto(10);
  texto(`Cliente: ${f.cliente}`); salto();
  texto(`NIF: ${f.nifC}`); salto(30);

  // Cabecera de la tabla
  texto("Concepto", 50, true); texto("Cantidad", 260, true); texto("Precio", 330, true);
  texto("Dto.", 400, true); texto("Importe", 470, true);
  if (f.mixta) texto("IVA", 535, true);
  salto();
  let base = 0;
  const porTipo = {};
  for (const [c, q, p, d, imp, tipoLinea] of f.lineas) {
    texto(c, 50); texto(String(q), 275); texto(`${fmt(p)} €`, 330);
    texto(d ? `${d} %` : "0 %", 400); texto(`${fmt(imp)} €`, 470);
    if (f.mixta) texto(`${tipoLinea}%`, 535);
    porTipo[tipoLinea ?? 21] = (porTipo[tipoLinea ?? 21] ?? 0) + imp;
    base += imp; salto();
  }
  salto(15);
  let iva = 0;
  texto(`Base imponible: ${fmt(base)} €`, 330); salto();
  if (f.mixta) {
    // Un renglón de IVA por cada tipo
    for (const [tipo, b] of Object.entries(porTipo).sort((x, y) => y[0] - x[0])) {
      const cuota = Math.round(b * tipo) / 100;
      iva += cuota;
      texto(`Base imponible ${tipo}%: ${fmt(b)} €`, 330); salto();
      texto(`IVA ${tipo}%: ${fmt(cuota)} €`, 330); salto();
    }
  } else {
    iva = Math.round(base * 21) / 100;
    texto(`IVA (21%): ${fmt(iva)} €`, 330); salto();
  }
  texto(`Total: ${fmt(base + iva)} €`, 330, true, 13);
  writeFileSync(`muestras/${f.archivo}`, await pdf.save());
}
console.log("PDFs creados en /muestras");
