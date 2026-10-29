import { ConfigError } from "./config.js";

/** Turns a startup failure into the text printed to stderr, with every secret replaced. */
export function formatStartupError(error: unknown, secrets: readonly string[]): string {
  const text =
    error instanceof ConfigError
      ? error.message
      : `Neil cannot start: ${error instanceof Error ? error.message : String(error)}`;
  return redact(text, secrets);
}

export function redact(text: string, secrets: readonly string[]): string {
  return secrets.filter((secret) => secret !== "").reduce((out, secret) => out.replaceAll(secret, "[redacted]"), text);
}
