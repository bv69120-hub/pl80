import { contextBridge, ipcRenderer } from "electron";

const packagedArgument = process.argv.find((argument) => argument.startsWith("--bv-packaged="));

contextBridge.exposeInMainWorld("bvDesktop", {
  isElectron: true,
  isPackaged: packagedArgument === "--bv-packaged=true",
  platform: process.platform,
  getBootstrapToken: () => ipcRenderer.invoke("bv:get-bootstrap-token"),
  getDesktopStatus: () => ipcRenderer.invoke("bv:get-desktop-status"),
  getLaunchAtLogin: () => ipcRenderer.invoke("bv:get-launch-at-login"),
  setLaunchAtLogin: (enabled: boolean) => ipcRenderer.invoke("bv:set-launch-at-login", enabled),
});
