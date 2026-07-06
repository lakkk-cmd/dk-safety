import WorkerDashboard from "@/components/worker/worker-dashboard";
import { WORKER_APK_URL } from "@/lib/mobile-apps";

export default function WorkerHomePage() {
  return <WorkerDashboard apkUrl={WORKER_APK_URL} />;
}
