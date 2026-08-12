import { randomInt } from "crypto";

// Excludes visually ambiguous characters (0/O, 1/l/I) since this is read
// off-screen and typed in by whoever it's shared with.
const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generatePassword(length = 12): string {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += CHARS[randomInt(CHARS.length)];
  }
  return password;
}
