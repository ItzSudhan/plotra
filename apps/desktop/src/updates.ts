import { app, dialog } from "electron";
// A named import: electron-updater has no default export once compiled to CommonJS.
import { autoUpdater } from "electron-updater";
import { showProblem } from "./dialogs";

// Automatic updates (local-mode-plan.md, phase 7), from the GitHub releases the
// release workflow publishes (electron-builder.yml `publish`). A new version is
// downloaded in the background and installed when the app next quits; the
// library's database is brought up to date by the server the first time the
// new version opens it (packages/db/src/local.ts runs the migrations).

let configured = false;

export async function checkForUpdates(byHand: boolean) {
  // A development build has nothing to update from.
  if (!app.isPackaged) {
    if (byHand) void dialog.showMessageBox({ message: "Updates are only checked in an installed copy of Plotra." });
    return;
  }
  if (!configured) {
    configured = true;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // Failures are reported by the check that met them (below); this keeps a
    // failed background download from throwing.
    autoUpdater.on("error", () => {});
    autoUpdater.on("update-downloaded", (info) => {
      void dialog
        .showMessageBox({
          message: `Plotra ${info.version} is ready`,
          detail: "It will be installed when you quit Plotra. Restart now to use it straight away?",
          buttons: ["Restart now", "Later"],
          defaultId: 0,
        })
        .then(({ response }) => response === 0 && autoUpdater.quitAndInstall());
    });
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!byHand) return;
    const latest = result?.updateInfo.version;
    const available = result ? (result.isUpdateAvailable ?? latest !== app.getVersion()) : false;
    if (available && latest) {
      void dialog.showMessageBox({ message: `Plotra ${latest} is downloading`, detail: "We'll let you know when it's ready." });
    } else {
      void dialog.showMessageBox({ message: "Plotra is up to date", detail: `You have version ${app.getVersion()}.` });
    }
  } catch (error) {
    if (byHand) {
      void showProblem({
        title: "Couldn't check for updates",
        message: "Check your connection and try again.",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
