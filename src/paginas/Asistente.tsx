// Asistente de consulta por texto y por voz (Web Speech API del navegador)
import { useEffect, useRef, useState } from "react";
import { responder } from "../assistant";

interface Mensaje {
  de: "yo" | "asistente";
  texto: string;
}

const sugerencias = [
  "¿Cuántas facturas han llegado hoy?",
  "¿Ha llegado alguna factura superior a 100 €?",
  "Hazme un resumen del día",
  "¿Cuál ha sido el importe total facturado hoy?",
  "¿Qué proveedores han enviado facturas esta semana?",
  "¿Hay alguna factura pendiente de revisar?",
  "¿Cuál es la factura de mayor importe recibida hoy?",
];

// El navegador puede llamarlo SpeechRecognition o webkitSpeechRecognition
const Reconocimiento: any = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export default function Asistente({ preguntaInicial }: { preguntaInicial: string }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([
    { de: "asistente", texto: "Hola, soy el asistente de facturas. Pregúntame lo que quieras sobre las facturas guardadas." },
  ]);
  const [texto, setTexto] = useState("");
  const [escuchando, setEscuchando] = useState(false);
  const [errorVoz, setErrorVoz] = useState("");
  const final = useRef<HTMLDivElement>(null);

  const preguntar = async (pregunta: string) => {
    if (!pregunta.trim()) return;
    const respuesta = await responder(pregunta);
    setMensajes((m) => [...m, { de: "yo", texto: pregunta }, { de: "asistente", texto: respuesta }]);
    setTexto("");
  };

  // Si la dirección trae ?q=pregunta, se hace sola al abrir
  useEffect(() => {
    if (preguntaInicial) preguntar(preguntaInicial);
  }, [preguntaInicial]);

  // Bajar al último mensaje
  useEffect(() => {
    final.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  const hablar = () => {
    if (!Reconocimiento) {
      setErrorVoz("Tu navegador no permite dictado por voz. Prueba con Chrome o Edge.");
      return;
    }
    const r = new Reconocimiento();
    r.lang = "es-ES";
    r.onstart = () => {
      setEscuchando(true);
      setErrorVoz("");
    };
    r.onend = () => setEscuchando(false);
    r.onerror = () => setErrorVoz("No he podido usar el micrófono. Revisa los permisos.");
    r.onresult = (e: any) => preguntar(e.results[0][0].transcript);
    r.start();
  };

  return (
    <section>
      <h1>Asistente de facturas</h1>
      <p className="ayuda">Escribe o dicta tu pregunta. Las respuestas salen de la base de datos.</p>

      <div className="chat" aria-live="polite">
        {mensajes.map((m, i) => (
          <div key={i} className={`burbuja ${m.de}`}>
            {m.texto}
          </div>
        ))}
        <div ref={final} />
      </div>

      <div className="sugerencias">
        {sugerencias.map((s) => (
          <button key={s} className="chip" onClick={() => preguntar(s)}>{s}</button>
        ))}
      </div>

      <form
        className="entrada"
        onSubmit={(e) => {
          e.preventDefault();
          preguntar(texto);
        }}
      >
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe tu pregunta…"
          aria-label="Pregunta"
        />
        <button type="button" className={`boton microfono ${escuchando ? "grabando" : ""}`} onClick={hablar} aria-label="Preguntar por voz">
          {escuchando ? "● Escuchando" : "🎤 Voz"}
        </button>
        <button type="submit" className="boton">Enviar</button>
      </form>
      {errorVoz && <p className="error" role="alert">{errorVoz}</p>}
    </section>
  );
}
