import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const QUEUE_ID = process.argv[2] || "03aec903-59a5-499c-8c40-012b7a319701";
await supabase.from("content_youtube_queue").update({ status: "approved" }).eq("id", QUEUE_ID);
const { data } = await supabase.from("content_youtube_queue").select("id, status, title").eq("id", QUEUE_ID).single();
console.log(`✓ [${data.status}] ${data.title}`);
