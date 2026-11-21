// Componente principal: menú + cambio de página según la dirección (#/...)
import { useEffect, useState } from "react";
import Panel from "./paginas/Panel";
import Subir from "./paginas/Subir";
import Detalle from "./paginas/Detalle";
import Asistente from "./paginas/Asistente";

// Lee la ruta del hash, por ejemplo "#/factura/3?x=1" -> { partes: ["factura","3"], query }
function leerRuta() {
  const [ruta, query = ""] = window.location.hash.replace(/^#\/?/, "").split("?");
  return { partes: ruta.split("/").filter(Boolean), query: new URLSearchParams(query) };
}

export default function App() {
  const [ruta, setRuta] = useState(leerRuta());

  useEffect(() => {
    const cambiar = () => setRuta(leerRuta());
    window.addEventListener("hashchange", cambiar);
    return () => window.removeEventListener("hashchange", cambiar);
  }, []);

  const pagina = ruta.partes[0] ?? "";
  const enlace = (destino: string, texto: string, icono: string) => (
    <a href={`#/${destino}`} className={pagina === destino ? "activo" : ""}>
      <span aria-hidden="true">{icono}</span> {texto}
    </a>
  );

  return (
    <div className="app">
      <header className="cabecera">
        <a href="#/" className="logo">
          <span className="logo-marca">F</span> FacturaLector
        </a>
        <nav aria-label="Menú principal">
          {enlace("", "Facturas", "▤")}
          {enlace("subir", "Subir PDF", "⇪")}
          {enlace("asistente", "Asistente", "✦")}
        </nav>
      </header>

      <main className="contenido">
        {pagina === "" && <Panel />}
        {pagina === "subir" && <Subir />}
        {pagina === "factura" && <Detalle id={Number(ruta.partes[1])} />}
        {pagina === "asistente" && <Asistente preguntaInicial={ruta.query.get("q") ?? ""} />}
      </main>

      <footer className="pie">Proyecto hecho por Lamia Derouach · 2026</footer>
    </div>
  );
}
