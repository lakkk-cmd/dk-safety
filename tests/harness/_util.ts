import assert from "node:assert/strict";

let failures = 0;

export function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL: ${name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function finish() {
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

export { assert };
