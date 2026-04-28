#!/usr/bin/env node
import { runCheckVersions } from "./checkVersions.js";
import { runDoctor } from "./doctor.js";
import { runOAuthSetup } from "./oauthSetup.js";
import { runSetup } from "./setup.js";

const HELP = `
ads-mcp CLI

Commands:
  setup                   Interactive wizard to configure platforms (token-paste mode)
  setup --oauth <plat>    OAuth wizard: opens browser, captures redirect, stores
                          refresh token in OS keychain, patches ~/.ads-mcp/config.json.
                          <plat> must be one of: meta, linkedin, google
  doctor                  Validate config and ping each enabled platform
  doctor --check-drift    Doctor + drift detection
  check-versions          Show pinned API versions and run doc-page drift check
  check-versions --no-doc-diff
                          Same as above but skips the network-dependent
                          doc-page check
  help                    Print this help

Examples:
  ads-mcp setup
  ads-mcp setup --oauth linkedin
  ads-mcp setup --oauth google
  ads-mcp doctor

After setup, wire the MCP server into your AI client. Snippets are in
examples/mcp-snippets/ in the repo.
`.trim();

const OAUTH_PLATFORMS = ["meta", "linkedin", "google"] as const;
type OAuthPlatform = (typeof OAUTH_PLATFORMS)[number];

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "help";
  const argv = process.argv.slice(3);
  const flags = new Set(argv);

  switch (cmd) {
    case "setup": {
      const oauthIdx = argv.indexOf("--oauth");
      if (oauthIdx !== -1) {
        const plat = argv[oauthIdx + 1];
        if (!plat || !(OAUTH_PLATFORMS as readonly string[]).includes(plat)) {
          process.stderr.write(
            `setup --oauth requires a platform: ${OAUTH_PLATFORMS.join(", ")}\n`,
          );
          process.exit(2);
        }
        await runOAuthSetup({ platform: plat as OAuthPlatform });
        return;
      }
      await runSetup();
      return;
    }
    case "doctor":
      await runDoctor({ checkDrift: flags.has("--check-drift") });
      return;
    case "check-versions":
      process.exit(
        await runCheckVersions({ skipDocDiff: flags.has("--no-doc-diff") }),
      );
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
