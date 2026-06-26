import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("bvDesktop", {
  platform: process.platform,
});
