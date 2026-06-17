import type { SupabaseClient } from "@supabase/supabase-js";
import { assert, check, finish } from "./_util";
import {
  AGENT_ROLE,
  AgentAccessError,
  scopeAgentClient,
} from "../../src/lib/supabase/agents";

type MockBuilder = {
  select: () => string;
  insert: () => string;
  update: () => string;
  upsert: () => string;
  delete: () => string;
};

function createBuilder(table: string): MockBuilder {
  return {
    select: () => `select:${table}`,
    insert: () => `insert:${table}`,
    update: () => `update:${table}`,
    upsert: () => `upsert:${table}`,
    delete: () => `delete:${table}`,
  };
}

function createPostgrestSurface(schema = "public") {
  return {
    from: (table: string) => createBuilder(`${schema}.${table}`),
    rpc: (fn: string) => `rpc:${schema}.${fn}`,
    schema: (nextSchema: string) => createPostgrestSurface(nextSchema),
  };
}

function createMockClient(): SupabaseClient {
  const surface = createPostgrestSurface();
  return {
    ...surface,
    rest: surface,
    auth: {},
    storage: {},
    functions: {},
    realtime: {},
    channel: () => "channel",
    getChannels: () => [],
    removeChannel: () => "ok",
    removeAllChannels: () => "ok",
  } as unknown as SupabaseClient;
}

check("read-only agent blocks table writes", () => {
  const client = scopeAgentClient(createMockClient(), AGENT_ROLE.READ_ONLY) as unknown as {
    from: (table: string) => MockBuilder;
  };

  assert.equal(client.from("reservations").select(), "select:public.reservations");
  assert.throws(() => client.from("reservations").insert(), AgentAccessError);
  assert.throws(() => client.from("reservations").update(), AgentAccessError);
  assert.throws(() => client.from("reservations").upsert(), AgentAccessError);
  assert.throws(() => client.from("reservations").delete(), AgentAccessError);
});

check("rest and schema access cannot bypass table guards", () => {
  const client = scopeAgentClient(createMockClient(), AGENT_ROLE.READ_ONLY) as unknown as {
    rest: { from: (table: string) => MockBuilder };
    schema: (schema: string) => { from: (table: string) => MockBuilder };
  };

  assert.equal(client.rest.from("agent_reports").select(), "select:public.agent_reports");
  assert.equal(client.schema("public").from("agent_reports").select(), "select:public.agent_reports");
  assert.throws(() => client.rest.from("reservations").delete(), AgentAccessError);
  assert.throws(() => client.schema("public").from("reservations").delete(), AgentAccessError);
});

check("scoped agents cannot switch to non-public schemas", () => {
  const client = scopeAgentClient(createMockClient(), AGENT_ROLE.CONTENT_WRITER) as unknown as {
    schema: (schema: string) => { from: (table: string) => MockBuilder };
  };

  assert.equal(client.schema("public").from("content_youtube_queue").insert(), "insert:public.content_youtube_queue");
  assert.throws(() => client.schema("storage").from("objects").select(), AgentAccessError);
});

check("read-only agent blocks rpc calls", () => {
  const client = scopeAgentClient(createMockClient(), AGENT_ROLE.READ_ONLY) as unknown as {
    rpc: (fn: string) => string;
    rest: { rpc: (fn: string) => string };
    schema: (schema: string) => { rpc: (fn: string) => string };
  };

  assert.throws(() => client.rpc("increment_blog_view"), AgentAccessError);
  assert.throws(() => client.rest.rpc("increment_blog_view"), AgentAccessError);
  assert.throws(() => client.schema("public").rpc("increment_blog_view"), AgentAccessError);
});

check("content writer allows scoped writes and allowed rpc only", () => {
  const client = scopeAgentClient(createMockClient(), AGENT_ROLE.CONTENT_WRITER) as unknown as {
    from: (table: string) => MockBuilder;
    rpc: (fn: string) => string;
  };

  assert.equal(client.from("content_youtube_queue").insert(), "insert:public.content_youtube_queue");
  assert.equal(client.rpc("increment_blog_view"), "rpc:public.increment_blog_view");
  assert.throws(() => client.from("reservations").insert(), AgentAccessError);
  assert.throws(() => client.rpc("match_knowledge_base"), AgentAccessError);
});

check("non-database service surfaces are blocked for scoped agents", () => {
  const client = scopeAgentClient(createMockClient(), AGENT_ROLE.READ_ONLY) as unknown as {
    auth: unknown;
    storage: unknown;
    functions: unknown;
    realtime: unknown;
    channel: () => unknown;
    getChannels: () => unknown;
    removeChannel: () => unknown;
    removeAllChannels: () => unknown;
  };

  assert.throws(() => client.auth, AgentAccessError);
  assert.throws(() => client.storage, AgentAccessError);
  assert.throws(() => client.functions, AgentAccessError);
  assert.throws(() => client.realtime, AgentAccessError);
  assert.throws(() => client.channel(), AgentAccessError);
  assert.throws(() => client.getChannels(), AgentAccessError);
  assert.throws(() => client.removeChannel(), AgentAccessError);
  assert.throws(() => client.removeAllChannels(), AgentAccessError);
});

finish();
