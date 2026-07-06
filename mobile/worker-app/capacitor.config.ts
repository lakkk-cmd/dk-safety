import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dkansim.worker",
  appName: "전기주치의 기사",
  webDir: "www",
  server: {
    url: "https://dkansim.com/worker",
    androidScheme: "https",
  },
};

export default config;
