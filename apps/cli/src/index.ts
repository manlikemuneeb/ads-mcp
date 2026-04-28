#!/usr/bin/env node
import { runCheckVersions } from "./checkVersions.js";
import { runDoctor } from "./doctor.js";
import { runSetup } from "./setup.js";

const HELP = `
ads-mcp CLI

Commands:
  setup              Interactive wizard to configure platforms and write ~/.ads-mcp/config.json
  doctor             Validate config and ping each enabled platform with the live credentials
  doctor --check-drift  Doctor + drift detection: exercises each platform's canonical
                     fixture and surfaces any response-shape changes vs the pinned schema
  check-versions     Show pinned API versions per platform with doc URLs to verify currency
  help               Print this help

Examples:
  ads-mcp setup
  ads-mcp doctor
  ads-mcp doctor --check-drift
  ads-mcp check-versions

After setup, wire the MCP server into your AI client. Snippets are in
examples/mcp-snippets/ in the repo.
`.trim();

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "help";
  const flags = new Set(process.argv.slice(3));

  switch (cmd) {
    case "setup":
      await runSetup();
      return;
    case "doctor":
      await runDoctor({ checkDrift: flags.has("--check-drift") });
      return;
    case "check-versions":
      process.exit(await runCheckVersions());
      return;
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(`${HELP}\n`);
      return;
    default:
      process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}\n`);
      process.exit(2);
  }
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
