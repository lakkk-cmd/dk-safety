import WorkerTaskDetail from "@/components/worker/worker-task-detail";

export default async function WorkerTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkerTaskDetail taskId={id} />;
}
