import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dkansim.customer",
  appName: "우리집 전기주치의",
  webDir: "www",
  server: {
    url: "https://dkansim.com/home",
    androidScheme: "https",
  },
};

export default config;
