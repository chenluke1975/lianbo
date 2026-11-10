import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/fraunces/500.css";
import "@fontsource/fraunces/600.css";
import "@fontsource/fraunces/700.css";
import "./styles.css";
import { Lianbo } from "@/components/lianbo";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Lianbo />
  </StrictMode>,
);
