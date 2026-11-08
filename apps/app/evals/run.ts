// `bun run eval -- --provider ollama --model gemma4:e2b` (see evals/README.md).
//
// The environment has to be set up before any of the app's server code loads,
// so this file only does that and hands over.
import "./harness/env";

await import("./cli");
