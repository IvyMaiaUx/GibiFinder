import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initObservability, Sentry } from "./lib/observability";

initObservability();

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary
    fallback={
      <div style={{ padding: 24, fontFamily: "system-ui", textAlign: "center" }}>
        <h1>Algo deu errado 😕</h1>
        <p>Recarregue a página. Se continuar, o erro já foi registrado.</p>
      </div>
    }
  >
    <App />
  </Sentry.ErrorBoundary>
);
