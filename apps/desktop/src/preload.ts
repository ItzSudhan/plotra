import { contextBridge, ipcRenderer } from "electron";

type Choice = "cloud" | "open" | { cloud: "sign-in" | "sign-up" } | { create: { parent: string; name: string } } | { library: string };

// What the first-run page (static/chooser.html) may ask of the app. Nothing
// else reaches Electron from a page: the app's own windows get no preload.
contextBridge.exposeInMainWorld("plotra", {
  choose: (choice: Choice) => ipcRenderer.invoke("plotra:choose", choice) as Promise<boolean>,
  /** Recent libraries: `name` is the folder's name, `path` the full path. */
  recent: () => ipcRenderer.invoke("plotra:recent") as Promise<{ path: string; name: string }[]>,
  /** The library that was open last time, when it can't be found any more. */
  missing: () => ipcRenderer.invoke("plotra:missing") as Promise<string | null>,
  /** "Set up your library": where a new library goes and what it's called, unless changed. */
  libraryDefaults: () => ipcRenderer.invoke("plotra:library-defaults") as Promise<{ parent: string; name: string }>,
  /** The folder a library called `name` in `parent` would be. */
  libraryPath: (parent: string, name: string) => ipcRenderer.invoke("plotra:library-path", { parent, name }) as Promise<string | null>,
  /** "Change…": asks for a folder; null when the dialog was closed. */
  pickParent: (from: string) => ipcRenderer.invoke("plotra:pick-parent", from) as Promise<string | null>,
  /** The app asking for a screen of the page (File → New Library… while the window is open). */
  onScreen: (listener: (screen: string) => void) => {
    ipcRenderer.on("plotra:screen", (_event, screen: string) => listener(screen));
  },
});
