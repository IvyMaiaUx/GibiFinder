// Round-robin rotation for Google Drive API keys. Set GOOGLE_DRIVE_API_KEY to a
// comma-separated list of keys to spread quota across them; a single key still
// works unchanged.
let index = -1;

export function driveKeyList(): string[] {
  return (process.env["GOOGLE_DRIVE_API_KEY"] || "")
    .split(",")
    .map(k => k.trim())
    .filter(Boolean);
}

export function hasDriveKey(): boolean {
  return driveKeyList().length > 0;
}

/** Next key in round-robin order, or undefined if none configured. */
export function nextDriveKey(): string | undefined {
  const keys = driveKeyList();
  if (keys.length === 0) return undefined;
  index = (index + 1) % keys.length;
  return keys[index];
}
