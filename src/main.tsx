import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Tarayıcının sağ tık menüsünü kapat (yazı alanları hariç)
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement;
  if (!t.closest("input, textarea, .selectable")) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
