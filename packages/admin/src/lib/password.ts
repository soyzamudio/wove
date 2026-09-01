export const PASSWORD_MIN_LENGTH = 8;

/**
 * Validate a new password + confirmation pair. Returns an error message, or
 * null when the pair is acceptable. Shared by setup, accept-invite, reset and
 * the profile page so every form fails the same way.
 */
export function validatePassword(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password !== confirm) return "Passwords do not match.";
  return null;
}
