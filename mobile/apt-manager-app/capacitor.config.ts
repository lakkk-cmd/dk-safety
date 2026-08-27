import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dkansim.aptmanager",
  appName: "우리집 안심전기",
  webDir: "www",
  server: {
    url: "https://inspect.dkansim.com",
    androidScheme: "https",
  },
};

export default config;
