/**
 * One way to hand credentials to the harness scripts: `--env-file <path>` (or nothing, and read the
 * environment directly).
 *
 * The file is KEY=VALUE, one per line: `#` comments, blank lines, a leading `export `, and surrounding
 * quotes are all tolerated. A variable already present in the environment wins, so an explicit export
 * beats the file. Credentials stay out of command lines and shell history this way.
 *
 *   import { loadEnvFileArg } from "./env-file.mjs";
 *   loadEnvFileArg();
 */
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);

const flagValue = (name) => {
  const index = argv.indexOf(`--${name}`);
  if (index !== -1) {
    return argv[index + 1];
  }
  const inline = argv.find((value) => value.startsWith(`--${name}=`));
  return inline === undefined ? undefined : inline.slice(name.length + 3);
};

export const loadEnvFileArg = (name = "env-file") => {
  const path = flagValue(name);
  if (!path) {
    return null;
  }
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    console.error(`cannot read --${name} '${path}': ${error.message}`);
    process.exit(2);
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const bare = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
    const split = bare.indexOf("=");
    if (split === -1) {
      continue;
    }
    const key = bare.slice(0, split).trim();
    let value = bare.slice(split + 1).trim();
    for (const quote of ['"', "'"]) {
      if (value.startsWith(quote) && value.endsWith(quote)) {
        value = value.slice(1, -1);
      }
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return path;
};
