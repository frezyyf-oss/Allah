import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TonConnectUIProvider } from "@tonconnect/ui-react";

import App from "./App";
import "./styles.css";


const publicBaseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
  .toString();
const manifestUrl =
  import.meta.env.VITE_TONCONNECT_MANIFEST_URL ||
  `${publicBaseUrl}tonconnect-manifest.json`;
const twaReturnUrl =
  import.meta.env.VITE_TWA_RETURN_URL || "https://t.me/NftBatttleBot";

const providerProps = twaReturnUrl
  ? { actionsConfiguration: { twaReturnUrl } }
  : {};


createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl} {...providerProps}>
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
);
