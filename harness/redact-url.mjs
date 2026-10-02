#!/usr/bin/env node
/**
 * `redact-url.mjs <url>` — print the redacted form, for shell callers.
 *
 * The shell cannot import `redact.mjs`, and a second implementation in bash would be a rule with two copies —
 * exactly the drift this module exists to prevent. So the shells call this three-line CLI instead.
 */
import { redactEndpoint } from "./redact.mjs";

process.stdout.write(`${redactEndpoint(process.argv[2] ?? "")}\n`);
