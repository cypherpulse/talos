// Compile all Talos circuits to R1CS + WASM + SYM under circuits/build/<name>/.
//
// Requires `circom` on PATH (see circuits/README.md). Reproducible: re-running
// regenerates identical artifacts from the frozen sources.

import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { ROOT } from "./lib.mjs";

const CIRCUITS = ["deposit", "transfer", "split", "merge", "withdraw"];
const INCLUDE = path.join(ROOT, "packages", "zk", "node_modules");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed (status ${r.status})`);
  }
}

function main() {
  for (const name of CIRCUITS) {
    const src = path.join(ROOT, "circuits", name, `${name}.circom`);
    const out = path.join(ROOT, "circuits", "build", name);
    fs.mkdirSync(out, { recursive: true });
    console.log(`\n=== compiling ${name} ===`);
    run("circom", [src, "--r1cs", "--wasm", "--sym", "-l", INCLUDE, "-o", out]);
  }
  console.log("\nAll circuits compiled.");
}

main();
