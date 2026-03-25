import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/** Remove dev-server links / titles that expose 127.0.0.1 (tooltips on hover). */
function stripLocalhostDevArtifacts() {
  document.querySelectorAll('a[href*="127.0.0.1"]').forEach((n) => n.remove());
  document.querySelectorAll('[title*="127.0.0.1"]').forEach((el) => el.removeAttribute("title"));
}

stripLocalhostDevArtifacts();
new MutationObserver(stripLocalhostDevArtifacts).observe(document.body, { childList: true, subtree: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
