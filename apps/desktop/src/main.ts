import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, session, shell, type MenuItemConstructorOptions } from "electron";
import { existsSync, readdirSync, renameSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { showProblem } from "./dialogs";
import { createLibrary, databaseDir, DEFAULT_LIBRARY_NAME, isLibrary, lockLibrary, newLibraryPath, openLibrary, snapshotsDir, type Library } from "./library";
import { backupSaved, describeError, fileManager, folderName, libraryLabels, NOT_A_LIBRARY, quoted, switchQuestion } from "./messages";
import { staysInWindow } from "./navigation";
import { freePort, startLocalServer, type LocalServer } from "./server";
import { loadSettings, rememberLibrary, saveSettings, type Settings } from "./settings";
import { afterSignIn, exchangeUrl, signInPage, startSignIn, type SignInFlow } from "./sign-in";
import { closeGently, isClosing, showGently } from "./motion";
import { checkForUpdates } from "./updates";

// Plotra's desktop app (local-mode-plan.md, phase 4). It works one of two ways,
// chosen on first run and changed from the File menu:
//   Plotra Cloud      a window on app.plotra.ink, as in a browser
//   On this computer  a library folder of the person's own, served by the same
//                     app running on this computer (./server.ts)

const CLOUD_URL = process.env.PLOTRA_CLOUD_URL || "https://app.plotra.ink";
/** Points the app at a `next dev` already running in local mode, instead of the bundled server. */
const DEV_URL = process.env.PLOTRA_DESKTOP_DEV_URL;

/** Where Plotra Cloud starts on first run: the sign-in page, or making an account. */
type CloudStart = "sign-in" | "sign-up";

/** What the first-run window (static/chooser.html, through ./preload.ts) can ask for. */
type Choice = "cloud" | "open" | { cloud: CloudStart } | { create: { parent: string; name: string } } | { library: string };

const isPlace = (value: unknown): value is { parent: string; name: string } =>
  typeof value === "object" && value !== null && typeof (value as { parent?: unknown }).parent === "string" && typeof (value as { name?: unknown }).name === "string" && path.isAbsolute((value as { parent: string }).parent);

type Current =
  | { mode: "cloud"; url: string }
  | { mode: "local"; url: string; library: Library; server: LocalServer | null; unlock: () => void };

let settings: Settings;
let current: Current | null = null;
let chooser: BrowserWindow | null = null;
/** The small "Opening your library…" window shown while a library starts. */
let splash: BrowserWindow | null = null;
let quitting = false;
/** Set while one library or mode is closing and the next opening: no windows then is expected. */
let switching = false;

const settingsDir = () => app.getPath("userData");
const save = () => saveSettings(settingsDir(), settings);

/** Where the bundled server and migrations are: in the app's resources, or in the repo while developing. */
function serverPaths() {
  const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "build");
  return {
    serverDir: path.join(root, "server"),
    migrationsDir: path.join(root, "migrations"),
    logsDir: app.getPath("logs"),
  };
}

const staticFile = (name: string) => path.join(__dirname, "..", "static", name);
const OFFLINE_PAGE = staticFile("offline.html");
const SIGN_IN_PAGE = staticFile("sign-in.html");
const LOADING_PAGE = staticFile("loading.html");
const LOADING_URL = pathToFileURL(LOADING_PAGE).href;

/**
 * Shows the loading page at once, with `status` under Plotra's name, then
 * loads `url` behind it: the window is never blank or frozen on the last
 * page while the next one comes in.
 */
function loadWithStatus(win: BrowserWindow, url: string, status: string, options?: Electron.LoadURLOptions) {
  const online = !url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost");
  void win
    .loadFile(LOADING_PAGE, { query: online ? { status, online: "1" } : { status } })
    .catch(() => {})
    .then(() => {
      // Unless something else was loaded meanwhile (the window closed, or the person went elsewhere).
      if (!win.isDestroyed() && win.webContents.getURL().startsWith(LOADING_URL)) return win.loadURL(url, options);
    })
    .catch(() => {
      // A failed load is shown by did-fail-load (openWindow).
    });
}

/** Paper or ink behind every window, so none flashes white in dark mode. */
const windowBackground = () => (nativeTheme.shouldUseDarkColors ? "#141311" : "#f7f6f3");

/** The app's own windows: not the chooser or the opening window. */
const appWindows = () => BrowserWindow.getAllWindows().filter((win) => win !== chooser && win !== splash && !isClosing(win));

/** What's open, in words: "Plotra Cloud" or "‘My Library’". */
function currentName(): string | null {
  if (!current) return null;
  return current.mode === "cloud" ? "Plotra Cloud" : quoted(current.library.dir);
}

/** Shows "Opening your library…" at once; the window is closed when the library's window is ready. */
function showSplash(dir: string, status?: string) {
  closeSplash();
  const database = databaseDir(dir);
  let isNew = false;
  try {
    isNew = !existsSync(database) || readdirSync(database).length === 0;
  } catch {
    // Unreadable: opening will say why.
  }
  const win = new BrowserWindow({
    width: 420,
    height: 220,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    center: true,
    title: "Opening your library",
    backgroundColor: windowBackground(),
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  splash = win;
  win.once("ready-to-show", () => showGently(win));
  win.on("closed", () => {
    if (splash === win) splash = null;
  });
  const query: Record<string, string> = { name: folderName(dir) };
  if (status) query.status = status;
  else if (isNew) query.status = "Setting up your library for the first time…";
  void win.loadFile(staticFile("opening.html"), { query }).catch(() => {});
}

function closeSplash() {
  const win = splash;
  splash = null;
  if (win) closeGently(win);
}

/** Where "Try again" on the offline page goes, per window. */
const failedUrls = new Map<number, string>();

/** The offline page: shown in place of a page that couldn't load. */
function showOffline(win: BrowserWindow, url: string) {
  const id = win.webContents.id;
  // The swap for a session can't be tried again by its URL alone: start from the top, which signs in again if need be.
  failedUrls.set(id, url.includes("/api/desktop/exchange") ? CLOUD_URL : url);
  win.once("closed", () => failedUrls.delete(id));
  void win.loadFile(OFFLINE_PAGE, { query: { mode: current?.mode ?? "cloud" } }).catch(() => {});
}

/** The offline and sign-in pages' buttons are links back to the page with an `action`; they're handled here. */
function pageAction(target: string, page: string): string | null {
  try {
    const url = new URL(target);
    if (url.protocol !== "file:" || url.pathname !== pathToFileURL(page).pathname) return null;
    return url.searchParams.get("action");
  } catch {
    return null;
  }
}

/**
 * The Plotra Cloud window the app opened by itself at launch, until it's known
 * to be signed in. Signed out, it gives way to the welcome window (the
 * person may never have finished signing in): the browser only opens for a
 * sign-in they asked for.
 */
let launchWindow: BrowserWindow | null = null;

/** Closes the cloud window opened at launch and shows the welcome window in its place. */
function backToWelcome(win: BrowserWindow) {
  launchWindow = null;
  current = null;
  buildMenu();
  // The welcome window first, so closing the last window doesn't quit the app.
  showChooser();
  if (!win.isDestroyed()) win.destroy();
}

/** Signing in to Plotra Cloud through the browser (./sign-in.ts): the one under way, and the window waiting on it. */
let signingIn: { flow: SignInFlow; win: BrowserWindow } | null = null;

/** Windows showing "Sign in in your browser", and the cloud's sign-in page each was sent to. */
const pendingSignIn = new Map<number, string>();

function cancelSignIn() {
  signingIn?.flow.cancel();
  signingIn = null;
}

/**
 * In place of the cloud's sign-in page (`target`): a page in the window saying
 * to sign in in the browser, which opens there. Once the browser hands over
 * the code, the window swaps it for a session and goes where `target` would have.
 */
async function signInThroughBrowser(win: BrowserWindow, target: string) {
  const mode = signInPage(target, CLOUD_URL);
  if (!mode || win.isDestroyed()) return;
  const id = win.webContents.id;
  const expired = new URL(target).searchParams.get("desktop") === "expired";
  cancelSignIn();
  pendingSignIn.set(id, target);
  let flow: SignInFlow;
  try {
    flow = await startSignIn(CLOUD_URL, mode);
    // The browser comes to the front, so it's clear where signing in happens.
    await shell.openExternal(flow.browserUrl, { activate: true });
  } catch {
    if (!win.isDestroyed()) void win.loadFile(SIGN_IN_PAGE, { query: { failed: "1" } }).catch(() => {});
    return;
  }
  if (win.isDestroyed()) return flow.cancel();
  signingIn = { flow, win };
  void win.loadFile(SIGN_IN_PAGE, { query: expired ? { expired: "1" } : mode === "sign-up" ? { mode } : {} }).catch(() => {});
  let code: string;
  try {
    code = await flow.code;
  } catch {
    return; // Cancelled, replaced, or left too long: "Open the browser again" starts over.
  }
  if (signingIn?.flow === flow) signingIn = null;
  if (win.isDestroyed()) return;
  pendingSignIn.delete(id);
  if (win.isMinimized()) win.restore();
  win.show();
  if (process.platform === "darwin") app.focus({ steal: true });
  win.focus();
  // The header is how the cloud knows it's this window asking (apps/app/app/api/desktop/exchange).
  loadWithStatus(win, exchangeUrl(CLOUD_URL, code, flow.verifier, afterSignIn(target)), "Signing you in…", { extraHeaders: "x-plotra-desktop: 1\n" });
  // Other windows that were waiting at the sign-in page come along, signed in by the same cookie.
  for (const other of appWindows()) {
    if (other !== win && pendingSignIn.has(other.webContents.id)) {
      pendingSignIn.delete(other.webContents.id);
      loadWithStatus(other, CLOUD_URL, "Opening Plotra Cloud…");
    }
  }
}

const sameOrigin = (a: string, b: string) => {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
};

/**
 * A window of the app, on `url`, with the loading page showing until it's in.
 * `load: false` leaves the loading to the caller.
 */
function openWindow(url: string, onReady?: () => void, { load = true }: { load?: boolean } = {}): BrowserWindow {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: "Plotra",
    backgroundColor: windowBackground(),
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true },
  });
  win.once("ready-to-show", () => {
    // Waiting on a sign-in in the browser: show the window without pulling it in front of the browser.
    showGently(win, { inactive: pendingSignIn.has(win.webContents.id) });
    onReady?.();
  });
  // The loading, offline and sign-in pages aren't somewhere to go back to: once the app's own page is in, they're forgotten.
  let onAppPage = false;
  win.webContents.on("did-navigate", (_event, target) => {
    const appPage = !target.startsWith("file:");
    if (appPage && !onAppPage) win.webContents.navigationHistory.clear();
    onAppPage = appPage;
  });
  // No connection (or the library's server gone): a page saying so, not a blank window.
  win.webContents.on("did-fail-load", (_event, code, _description, failedUrl, isMainFrame) => {
    // -3 is a navigation that was replaced or stopped, not a failure.
    if (!isMainFrame || code === -3 || failedUrl.startsWith("file:")) return;
    showOffline(win, failedUrl);
  });
  // A page still saving (it holds the close with beforeunload): ask, rather than close silently or never.
  win.webContents.on("will-prevent-unload", (event) => {
    const response = dialog.showMessageBoxSync(win, {
      type: "warning",
      message: "Plotra is still saving your changes",
      detail: "Wait a moment for it to finish, or close now and lose the last few seconds of work.",
      buttons: ["Wait", "Close anyway"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response === 1) event.preventDefault();
    else keptOpen.get(win)?.();
  });
  // Links to anywhere else open in the person's browser; the app's own pages open in a new window.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (current && sameOrigin(target, current.url)) return { action: "allow" };
    if (/^https?:|^mailto:/.test(target)) void shell.openExternal(target);
    return { action: "deny" };
  });
  // Plotra Cloud's sign-in pages never show in the window: the person signs in
  // in their browser instead (./sign-in.ts). The server sending the window
  // there (signed out, or a session run out), a link there, or the app moving
  // there itself (signing out) all end up here.
  const toBrowser = (event: { preventDefault: () => void } | null, target: string) => {
    if (current?.mode !== "cloud" || !signInPage(target, CLOUD_URL)) return false;
    event?.preventDefault();
    // Opened by the app at launch and signed out: the welcome window, not a browser opening by itself.
    if (launchWindow === win) {
      backToWelcome(win);
      return true;
    }
    void signInThroughBrowser(win, target);
    return true;
  };
  win.webContents.on("will-redirect", (event, target, _inPlace, isMainFrame) => {
    if (isMainFrame) toBrowser(event, target);
  });
  win.webContents.on("did-navigate", (_event, target) => {
    if (toBrowser(null, target)) return;
    // Got into the cloud signed in: from here a sign-in page means the person signed out, or their session ran out.
    if (launchWindow === win && sameOrigin(target, CLOUD_URL)) launchWindow = null;
  });
  win.webContents.on("did-navigate-in-page", (_event, target, isMainFrame) => {
    if (isMainFrame) toBrowser(null, target);
  });
  const contentsId = win.webContents.id;
  win.once("closed", () => {
    if (launchWindow === win) launchWindow = null;
    pendingSignIn.delete(contentsId);
    if (signingIn?.win === win) cancelSignIn();
  });
  // The window is the app, never plotra.ink's website (./navigation.ts).
  win.webContents.on("will-navigate", (event, target) => {
    const action = pageAction(target, OFFLINE_PAGE);
    if (action) {
      event.preventDefault();
      if (action === "retry") loadWithStatus(win, failedUrls.get(win.webContents.id) ?? current?.url ?? url, "Trying again…");
      else if (action === "local") showChooser();
      return;
    }
    const signInAction = pageAction(target, SIGN_IN_PAGE);
    if (signInAction) {
      event.preventDefault();
      if (signInAction === "reopen") void signInThroughBrowser(win, pendingSignIn.get(win.webContents.id) ?? new URL("/sign-in", CLOUD_URL).toString());
      else if (signInAction === "local") showChooser();
      return;
    }
    if (toBrowser(event, target)) return;
    if (!current || staysInWindow(target, current.url, current.mode)) return;
    event.preventDefault();
    if (/^https?:/.test(target)) void shell.openExternal(target);
  });
  if (load) loadWithStatus(win, url, current?.mode === "local" ? "Opening your library…" : "Opening Plotra Cloud…");
  return win;
}

/** Every request the app's windows make to the local server carries its token. */
function sendTokenTo(url: string, token: string) {
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${new URL(url).origin}/*`] }, (details, callback) => {
    callback({ requestHeaders: { ...details.requestHeaders, "x-plotra-local": token } });
  });
}

/** Called when a window that was asked to close stays open (the person chose "Wait"). */
const keptOpen = new Map<BrowserWindow, () => void>();

/**
 * Closes a window the gentle way, so its page can finish saving. Resolves to
 * false when the person keeps it open; a page that doesn't answer is closed
 * after a while regardless.
 */
function closeWindow(win: BrowserWindow): Promise<boolean> {
  if (win.isDestroyed()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (closed: boolean) => {
      clearTimeout(timer);
      keptOpen.delete(win);
      resolve(closed);
    };
    const timer = setTimeout(() => {
      if (!win.isDestroyed()) win.destroy();
    }, 15_000);
    win.once("closed", () => finish(true));
    keptOpen.set(win, () => finish(false));
    win.close();
  });
}

/** Closes the windows, then the library. Resolves to false (leaving it open) when the person keeps a window open. */
async function closeCurrent(): Promise<boolean> {
  closeSplash();
  const closed = await Promise.all(appWindows().map(closeWindow));
  if (closed.includes(false)) return false;
  const was = current;
  current = null;
  cancelSignIn();
  if (was?.mode === "local") {
    await was.server?.stop();
    was.unlock();
  }
  buildMenu();
  return true;
}

/**
 * Opens Plotra Cloud. `start` is the first-run window's choice: "sign-up" goes
 * straight to making an account (in the browser, as signing in does).
 */
function openCloud(start: CloudStart = "sign-in"): BrowserWindow {
  current = { mode: "cloud", url: CLOUD_URL };
  settings = { ...settings, mode: "cloud" };
  save();
  if (start === "sign-up") {
    // Straight to making an account in the browser; the window says so meanwhile, without showing the cloud's own page first.
    const signUp = new URL("/sign-up", CLOUD_URL).toString();
    const win = openWindow(signUp, undefined, { load: false });
    void win.loadFile(LOADING_PAGE, { query: { status: "Opening your browser…" } }).catch(() => {});
    void signInThroughBrowser(win, signUp);
    buildMenu();
    return win;
  }
  const win = openWindow(CLOUD_URL);
  buildMenu();
  return win;
}

type OpenOptions = {
  /** Extra settings for the library's server. */
  env?: Record<string, string>;
  /** What the opening window says under the library's name. */
  status?: string;
};

async function openLocal(dir: string, { env = {}, status }: OpenOptions = {}): Promise<boolean> {
  let library: Library;
  let unlock: () => void;
  try {
    library = openLibrary(dir);
    unlock = lockLibrary(library.dir);
  } catch (error) {
    await showProblem(describeError(error, "Couldn't open the library"), chooser);
    return false;
  }
  showSplash(library.dir, status);
  try {
    let server: LocalServer | null = null;
    let url = DEV_URL ?? "";
    if (!DEV_URL) {
      const port = await freePort(settings.ports[library.dir] ?? 17000 + Math.floor(Math.random() * 1000));
      server = await startLocalServer(library, serverPaths(), port, env);
      url = server.url;
      sendTokenTo(url, server.token);
      settings = { ...settings, ports: { ...settings.ports, [library.dir]: port } };
    }
    current = { mode: "local", url, library, server, unlock };
    settings = rememberLibrary(settings, library.dir);
    save();
    openWindow(url, closeSplash);
    buildMenu();
    return true;
  } catch (error) {
    unlock();
    closeSplash();
    await showProblem(describeError(error, "Couldn't open the library"), chooser);
    return false;
  }
}

/**
 * Closes what's open and opens something else, after asking when something is
 * open (`to` names what comes next; without it there's no question). When the
 * opening fails and nothing is open any more, the first-run choice comes back.
 */
async function switchTo(open: () => Promise<boolean> | boolean, to?: string): Promise<boolean> {
  const from = currentName();
  if (from && to) {
    const { response } = await dialog.showMessageBox({
      type: "question",
      message: switchQuestion(from, to),
      detail: "Plotra saves your work before it closes.",
      buttons: ["Switch", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return false;
  }
  switching = true;
  try {
    if (!(await closeCurrent())) return false;
    const opened = await open();
    if (!opened && !current) showChooser();
    return opened;
  } finally {
    switching = false;
  }
}

/** Brings the open window forward; used when the choice is what's already open. */
function focusCurrent(): boolean {
  const win = appWindows()[0];
  // Not when it's showing the offline page: then the choice means "open it again".
  if (!win || win.webContents.getURL().startsWith("file:")) return false;
  if (win.isMinimized()) win.restore();
  win.focus();
  return true;
}

const isOpen = (dir: string) => current?.mode === "local" && path.resolve(current.library.dir) === path.resolve(dir);

function switchToCloud(start?: CloudStart): Promise<boolean> {
  if (current?.mode === "cloud" && focusCurrent()) return Promise.resolve(true);
  return switchTo(() => {
    openCloud(start);
    return true;
  }, "Plotra Cloud");
}

async function switchToLibrary(dir: string): Promise<boolean> {
  if (isOpen(dir) && focusCurrent()) return true;
  return switchTo(() => openLocal(dir), quoted(dir));
}

/** Makes a library called `name` in `parent` (the first-run window's "Set up your library"), or opens the one already there. */
async function newLibrary({ parent, name }: { parent: string; name: string }): Promise<boolean> {
  let library: Library;
  try {
    library = createLibrary(newLibraryPath(parent, name));
  } catch (error) {
    await showProblem(describeError(error, "Couldn't make the library there"), chooser);
    return false;
  }
  return switchToLibrary(library.dir);
}

/** Where "Set up your library" puts a library unless told otherwise. */
const defaultParent = () => app.getPath("documents");

async function chooseLibrary(): Promise<boolean> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Open a Plotra library",
    buttonLabel: "Open library",
    defaultPath: settings.library ?? app.getPath("documents"),
    properties: ["openDirectory"],
  });
  if (canceled || !filePaths[0]) return false;
  if (!isLibrary(filePaths[0])) {
    await showProblem({ title: "Not a Plotra library", message: NOT_A_LIBRARY }, chooser);
    return false;
  }
  return switchToLibrary(filePaths[0]);
}

/**
 * The first-run choice (and where "Switch…" leads): Plotra Cloud, or a library
 * on this computer. `screen: "new"` opens it at "Set up your library", for
 * File → New Library….
 */
function showChooser({ screen }: { screen?: "new" } = {}) {
  if (chooser) {
    if (screen) chooser.webContents.send("plotra:screen", screen);
    return chooser.focus();
  }
  chooser = new BrowserWindow({
    width: 760,
    height: 620,
    resizable: false,
    title: "Welcome to Plotra",
    backgroundColor: windowBackground(),
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.js") },
  });
  const win = chooser;
  win.on("closed", () => {
    if (chooser === win) chooser = null;
    if (!current && !quitting) app.quit();
  });
  win.once("ready-to-show", () => showGently(win));
  void chooser.loadFile(staticFile("chooser.html"), screen ? { query: { screen } } : {});
}

ipcMain.handle("plotra:recent", () => libraryLabels(settings.recent.filter(isLibrary)).map(({ dir, label }) => ({ path: dir, name: label })));
/** The library that was open last time, when it can't be found any more (moved, or its drive unplugged). */
ipcMain.handle("plotra:missing", () => (settings.mode === "local" && settings.library && !isLibrary(settings.library) ? settings.library : null));
/** What "Set up your library" starts with. */
ipcMain.handle("plotra:library-defaults", () => ({ parent: defaultParent(), name: DEFAULT_LIBRARY_NAME }));
/** The folder a library called `name` would get in `parent`, shown under the fields as they're typed in. */
ipcMain.handle("plotra:library-path", (_event, place: unknown) => {
  if (!isPlace(place)) return null;
  try {
    return newLibraryPath(place.parent, place.name);
  } catch {
    return null;
  }
});
/** "Change…": a folder to put the library in, or null when the dialog was closed. */
ipcMain.handle("plotra:pick-parent", async (_event, from: unknown) => {
  const options: Electron.OpenDialogOptions = {
    title: "Where should the library go?",
    buttonLabel: "Choose",
    defaultPath: typeof from === "string" && from ? from : defaultParent(),
    properties: ["openDirectory", "createDirectory"],
  };
  const { canceled, filePaths } = chooser ? await dialog.showOpenDialog(chooser, options) : await dialog.showOpenDialog(options);
  return canceled || !filePaths[0] ? null : filePaths[0];
});
ipcMain.handle("plotra:choose", async (_event, choice: Choice) => {
  let opened = false;
  if (choice === "cloud") opened = await switchToCloud();
  else if (choice === "open") opened = await chooseLibrary();
  else if (typeof choice === "object" && choice && "cloud" in choice) opened = await switchToCloud(choice.cloud === "sign-up" ? "sign-up" : "sign-in");
  else if (typeof choice === "object" && choice && "create" in choice && isPlace(choice.create)) opened = await newLibrary(choice.create);
  else if (typeof choice === "object" && choice && "library" in choice && isLibrary(choice.library)) opened = await switchToLibrary(choice.library);
  if (opened && chooser) {
    // Gone at once as far as the app is concerned, while it fades out.
    const win = chooser;
    chooser = null;
    closeGently(win);
  }
  return opened;
});

async function backUpNow() {
  if (current?.mode !== "local" || !current.server) return;
  const { library, server } = current;
  try {
    const file = await server.snapshot();
    const { response } = await dialog.showMessageBox({
      message: "Backup saved",
      detail: backupSaved(new Date()),
      buttons: ["OK", `Show in ${fileManager()}`],
      defaultId: 0,
      cancelId: 0,
    });
    if (response === 1) shell.showItemInFolder(path.join(snapshotsDir(library.dir), file));
  } catch (error) {
    await showProblem({ ...describeError(error, "Couldn't back up the library"), log: server.log });
  }
}

/**
 * Puts the library back as it was in a snapshot. The database as it is now is
 * kept beside it ("Database before restore …"), never deleted.
 */
async function restoreSnapshot() {
  if (current?.mode !== "local" || !current.server) return;
  const dir = current.library.dir;
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: "Restore a snapshot",
    buttonLabel: "Restore",
    defaultPath: snapshotsDir(dir),
    filters: [{ name: "Plotra snapshots", extensions: ["gz"] }],
    properties: ["openFile"],
  });
  const snapshot = filePaths[0];
  if (canceled || !snapshot) return;
  const { response } = await dialog.showMessageBox({
    type: "warning",
    message: `Restore ${path.basename(snapshot)}?`,
    detail: "The library goes back to how it was then. Its database as it is now is kept in the library folder, as \"Database before restore\", in case you want it back.",
    buttons: ["Restore", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  });
  if (response !== 0) return;
  await switchTo(async () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, (c) => (c === "T" ? " " : "."));
    try {
      renameSync(databaseDir(dir), path.join(dir, `Database before restore ${stamp}`));
    } catch (error) {
      await showProblem(describeError(error, "Couldn't restore the snapshot"));
      return openLocal(dir);
    }
    return openLocal(dir, { env: { PLOTRA_RESTORE_SNAPSHOT: snapshot }, status: "Restoring the snapshot…" });
  });
}

function buildMenu() {
  const local = current?.mode === "local" ? current : null;
  const recent = libraryLabels(settings.recent.filter(isLibrary));
  const file: MenuItemConstructorOptions[] = [
    { label: "New Window", accelerator: "CmdOrCtrl+Shift+N", enabled: Boolean(current), click: () => current && openWindow(current.url) },
    { type: "separator" },
    { label: "New Library…", click: () => showChooser({ screen: "new" }) },
    { label: "Open Library…", accelerator: "CmdOrCtrl+Shift+O", click: () => void chooseLibrary() },
    {
      label: "Open Recent",
      enabled: recent.length > 0,
      submenu: recent.map(({ dir, label }) => ({
        label,
        sublabel: dir,
        toolTip: dir,
        click: () => void switchToLibrary(dir),
      })),
    },
    { type: "separator" },
    { label: "Show Library in Folder", enabled: Boolean(local), click: () => local && shell.openPath(local.library.dir) },
    { label: "Back Up Now", enabled: Boolean(local?.server), click: () => void backUpNow() },
    { label: "Restore a Snapshot…", enabled: Boolean(local?.server), click: () => void restoreSnapshot() },
    { type: "separator" },
    current?.mode === "cloud"
      ? { label: "Use a Library on This Computer…", click: () => showChooser() }
      : { label: "Switch to Plotra Cloud", click: () => void switchToCloud() },
  ];
  if (process.platform !== "darwin") file.push({ type: "separator" }, { role: "quit" });

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    { label: "File", submenu: file },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Plotra Docs", click: () => void shell.openExternal("https://docs.plotra.ink") },
        { label: "plotra.ink", click: () => void shell.openExternal("https://www.plotra.ink") },
        { label: "Check for Updates…", click: () => void checkForUpdates(true) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// One copy of the app at a time: a second launch focuses the first.
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    const win = appWindows()[0] ?? chooser ?? splash;
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  // Lets pages know they're in the app (apps/app/lib/desktop.ts): the sign-in page drops its link to the website.
  app.userAgentFallback = `${app.userAgentFallback} PlotraDesktop/${app.getVersion()}`;

  app.whenReady().then(async () => {
    settings = loadSettings(settingsDir());
    buildMenu();
    // The opening window may be the only one for a while: that's expected.
    switching = true;
    try {
      if (settings.mode === "cloud") launchWindow = openCloud();
      else if (settings.mode === "local" && settings.library && isLibrary(settings.library) && (await openLocal(settings.library))) {
        // Opened where it was left.
      } else showChooser();
    } finally {
      switching = false;
    }
    void checkForUpdates(false);
  });

  // macOS keeps the app open with no windows; clicking the dock icon brings one back.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length) return;
    if (current) openWindow(current.url);
    else showChooser();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && !switching && !quitting && !chooser) app.quit();
  });

  // Saves what's open and closes the database before the app goes.
  app.on("before-quit", (event) => {
    if (quitting) return;
    quitting = true;
    if (current?.mode !== "local") return;
    event.preventDefault();
    void closeCurrent().then(
      (closed) => {
        if (closed) app.quit();
        else quitting = false; // A window was kept open to finish saving.
      },
      () => app.quit(),
    );
  });
}
