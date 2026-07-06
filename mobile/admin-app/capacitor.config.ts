import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dkansim.admin",
  appName: "전기주치의 관리자",
  webDir: "www",
  server: {
    url: "https://dkansim.com/admin",
    androidScheme: "https",
  },
};

export default config;
