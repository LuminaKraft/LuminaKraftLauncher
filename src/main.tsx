import ReactDOM from "react-dom/client";
import App from "./App";
import "./i18n";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);

// Show the Tauri window after the first paint to avoid the white flash on startup.
// The window is created with `visible: false` in tauri.conf.json.
if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
  // Defer until the browser has rendered at least one frame
  requestAnimationFrame(() => {
    requestAnimationFrame(async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().show();
        await getCurrentWindow().setFocus();
      } catch (err) {
        console.error("Failed to show Tauri window:", err);
      }
    });
  });
}
