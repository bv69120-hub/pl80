import { contextBridge } from "electron";

const packagedArgument = process.argv.find((argument) => argument.startsWith("--bv-packaged="));

contextBridge.exposeInMainWorld("bvDesktop", {
  isElectron: true,
  isPackaged: packagedArgument === "--bv-packaged=true",
  platform: process.platform,
});
