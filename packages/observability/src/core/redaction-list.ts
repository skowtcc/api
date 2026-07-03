/*
 * key-name redaction list
 *
 * applied once at the Pipeline level before events reach any drain.
 * defense-in-depth for cases where someone forgets to wrap a secret in Redacted
 *
 * regex is case-insensitive. matches any context field name that looks like a credential
 */

export const REDACTION_PATTERN =
  /password|pwd|passwd|token|tok|bearer|authorization|auth|cred|credential|cookie|secret|api[_-]?key|apikey|access[_-]?key|private[_-]?key|refresh[_-]?(?:token|tok)/i;

export function redactKeyMatch(key: string): boolean {
  return REDACTION_PATTERN.test(key);
}
