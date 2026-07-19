import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

void boot();

async function boot() {
  const isV4Benchmark = import.meta.env.DEV
    && import.meta.env.VITE_APP_VERSION === "v4"
    && new URLSearchParams(window.location.search).get("benchmark") === "1";
  const RootApp = isV4Benchmark
    ? (await import("./AppV4Benchmark")).default
    : import.meta.env.VITE_APP_VERSION === "v4" || import.meta.env.VITE_APP_VERSION === "v5"
    ? (await import("./AppV4")).default
    : import.meta.env.VITE_APP_VERSION === "v3"
    ? (await import("./AppV3")).default
    : import.meta.env.VITE_APP_VERSION === "v3-old"
      ? (await import("./AppV3")).default
      : (await import("./App")).default;

  if (import.meta.env.VITE_APP_VERSION === "v4" || import.meta.env.VITE_APP_VERSION === "v5") {
    await import("./styles-v3.css");
    await import("./styles-v4.css");
    if (import.meta.env.VITE_APP_VERSION === "v5") {
      await import("./styles-v5.css");
    }
  } else if (import.meta.env.VITE_APP_VERSION === "v3" || import.meta.env.VITE_APP_VERSION === "v3-old") {
    await import("./styles-v3.css");
  } else {
    await import("./styles.css");
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <RootApp />
    </StrictMode>,
  );
}
