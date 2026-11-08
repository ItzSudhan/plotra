import { contextBridge, ipcRenderer } from "electron";

// What the first-run page (static/chooser.html) may ask of the app. Nothing
// else reaches Electron from a page: the app's own windows get no preload.
contextBridge.exposeInMainWorld("plotra", {
  choose: (choice: "cloud" | "new" | "open" | { library: string }) => ipcRenderer.invoke("plotra:choose", choice) as Promise<boolean>,
  /** Recent libraries: `name` is the folder's name, `path` the full path. */
  recent: () => ipcRenderer.invoke("plotra:recent") as Promise<{ path: string; name: string }[]>,
  /** The library that was open last time, when it can't be found any more. */
  missing: () => ipcRenderer.invoke("plotra:missing") as Promise<string | null>,
});
