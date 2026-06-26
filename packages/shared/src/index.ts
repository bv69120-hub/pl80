export const appConfig = {
  name: "BV Expédition Pro",
  apiDefaultPort: 3333,
  supportedPlatform: "Windows 10",
} as const;

export type AppConfig = typeof appConfig;
