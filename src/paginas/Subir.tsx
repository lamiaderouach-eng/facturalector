// Página para subir facturas. Solo se aceptan PDF (igual que pide el enunciado).
import { useState } from "react";
import { procesarPdf } from "../parser";
import { guardarFactura } from "../db";
import type { Factura } from "../types";

export default function Subir() {
  const [mensajes, setMensajes] = useState<string[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  const procesar = async (archivos: FileList | File[]) => {
    setTrabajando(true);
    const msgs: string[] = [];
    let ultimo: number | undefined;
    for (const a of Array.from(archivos)) {
      // Solo PDF: cualquier otro adjunto se ignora
      if (a.type !== "application/pdf" && !a.name.toLowerCase().endsWith(".pdf")) {
        msgs.push(`✗ ${a.name}: se ignora porque no es un PDF.`);
        continue;
      }
      try {
        const f = await procesarPdf(a);
        ultimo = await guardarFactura(f);
        msgs.push(`✓ ${a.name}: leída (${f.lineas.length} líneas, total ${f.total} €).`);
      } catch {
        msgs.push(`✗ ${a.name}: no se ha podido leer.`);
      }
    }
    setMensajes(msgs);
    setTrabajando(false);
    // Si solo se subió una, vamos directos a revisarla
    if (ultimo !== undefined && archivos.length === 1) window.location.hash = `#/factura/${ultimo}`;
  };

  // Importar el JSON que genera el flujo de n8n
  const importarJson = async (archivo: File) => {
    try {
      const datos = JSON.parse(await archivo.text());
      const lista: Factura[] = Array.isArray(datos) ? datos : [datos];
      for (const f of lista) await guardarFactura({ ...f, id: undefined, estado: "pendiente" });
      setMensajes([`✓ Se han importado ${lista.length} factura(s) desde n8n.`]);
    } catch {
      setMensajes(["✗ El archivo JSON no tiene el formato esperado."]);
    }
  };

  return (
    <section>
      <h1>Subir facturas</h1>
      <p className="ayuda">
        Normalmente las facturas llegan solas desde el correo con n8n. Aquí también puedes subirlas a mano.
      </p>

      <label
        className={`zona ${arrastrando ? "encima" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          procesar(e.dataTransfer.files);
        }}
      >
        <span className="zona-icono" aria-hidden="true">⇪</span>
        <strong>Arrastra aquí tus PDF</strong>
        <span>o pulsa para elegirlos</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={(e) => e.target.files && procesar(e.target.files)}
        />
      </label>

      {trabajando && <p role="status">Leyendo facturas…</p>}
      {mensajes.length > 0 && (
        <ul className="mensajes" role="status">
          {mensajes.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}

      <div className="caja">
        <h2>Importar desde n8n</h2>
        <p className="ayuda">Si tu flujo de n8n genera un archivo JSON con facturas, súbelo aquí.</p>
        <input
          type="file"
          accept="application/json,.json"
          aria-label="Archivo JSON de n8n"
          onChange={(e) => e.target.files?.[0] && importarJson(e.target.files[0])}
        />
      </div>
    </section>
  );
}
