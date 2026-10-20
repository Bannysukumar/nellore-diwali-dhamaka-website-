import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import { CONFIG_PROBLEM } from "@/lib/firebase/config";
import { renderConfigError } from "@/app/ConfigErrorScreen";
import "@/styles/index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container #root is missing from index.html");

if (CONFIG_PROBLEM) {
  renderConfigError(container, CONFIG_PROBLEM);
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
