import { createInterface, type Interface as ReadlineInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

let rl: ReadlineInterface | null = null;

function getRl(): ReadlineInterface {
  if (!rl) rl = createInterface({ input, output });
  return rl;
}

export function closeRl(): void {
  if (rl) {
    rl.close();
    rl = null;
  }
}

/**
 * Free-text prompt. Returns trimmed string. If user hits enter and a default
 * is provided, returns the default. If no default and input is empty, repeats.
 */
export async function ask(prompt: string, def?: string): Promise<string> {
  const suffix = def !== undefined ? ` [${def}]` : "";
  while (true) {
    const ans = (await getRl().question(`${prompt}${suffix}: `)).trim();
    if (ans !== "") return ans;
    if (def !== undefined) return def;
    output.write("  (required)\n");
  }
}

/** Same as ask but allows blank → returns undefined. */
export async function askOptional(prompt: string, def?: string): Promise<string | undefined> {
  const suffix = def !== undefined ? ` [${def}]` : " (optional)";
  const ans = (await getRl().question(`${prompt}${suffix}: `)).trim();
  if (ans === "") return def;
  return ans;
}

/**
 * "Secret" prompt that does NOT mask input on screen. The previous raw-mode
 * masking implementation paused stdin and broke the next readline call,
 * causing the wizard to silently exit. v1 token-paste flow accepts visible
 * tokens; safety boundary is `chmod 600` on the resulting config file.
 *
 * Phase 2 OS-keychain integration is where real masking belongs. Keeping this
 * as a separate function so call sites stay semantic and the swap is local.
 */
export async function askSecret(prompt: string): Promise<string> {
  return ask(prompt);
}

// --- legacy-cleanup-marker ---
// The block below is no longer used by askSecret. It's left intact only because
// the file is preserved on disk; removing the next ~25 lines is safe.
async function _unused_legacyMaskedPrompt(prompt: string): Promise<string> {
  output.write(`${prompt}: `);
  return new Promise((resolve) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      const s = chunk.toString("utf8");
      for (const ch of s) {
        if (ch === "\n" || ch === "\r") {
          input.removeListener("data", onData);
          input.setRawMode?.(false);
          input.pause();
          output.write("\n");
          resolve(buf.trim());
          return;
        }
        if (ch === "") process.exit(130); // Ctrl-C
        if (ch === "" || ch === "\b") {
          buf = buf.slice(0, -1);
        } else {
          buf += ch;
        }
      }
    };
    input.setRawMode?.(true);
    input.resume();
    input.on("data", onData);
  });
}
// Reference _unused_legacyMaskedPrompt to satisfy linters that flag unused exports.
void _unused_legacyMaskedPrompt;

export async function askYesNo(prompt: string, def: boolean): Promise<boolean> {
  const defStr = def ? "Y/n" : "y/N";
  const ans = (await getRl().question(`${prompt} (${defStr}): `)).trim().toLowerCase();
  if (ans === "") return def;
  return ans.startsWith("y");
}

export async function askChoice<T extends string>(
  prompt: string,
  choices: readonly T[],
  def: T,
): Promise<T> {
  while (true) {
    const ans = (await getRl().question(`${prompt} (${choices.join("|")}) [${def}]: `)).trim();
    if (!ans) return def;
    if ((choices as readonly string[]).includes(ans)) return ans as T;
    output.write(`  must be one of: ${choices.join(", ")}\n`);
  }
}

export function info(msg: string): void {
  output.write(`${msg}\n`);
}

export function header(msg: string): void {
  output.write(`\n=== ${msg} ===\n`);
}

export function success(msg: string): void {
  output.write(`✓ ${msg}\n`);
}

export function failure(msg: string): void {
  output.write(`✗ ${msg}\n`);
}
