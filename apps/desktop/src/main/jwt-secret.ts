import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const allowedSids = new Set(["S-1-5-18", "S-1-5-32-544"]);
const initializedMarkerValue = "BV_EXPEDITION_PRO_JWT_SECRET_INITIALIZED_V1";

export function isValidPersistedJwtSecret(secret: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return false;
  const decoded = Buffer.from(secret, "base64url");
  return decoded.length === 32 && decoded.toString("base64url") === secret;
}

async function protectWindowsPath(targetPath: string, isDirectory: boolean) {
  if (process.platform !== "win32") {
    await (await import("node:fs/promises")).chmod(targetPath, isDirectory ? 0o700 : 0o600);
    return;
  }

  const username = process.env.USERNAME || os.userInfo().username;
  const domain = process.env.USERDOMAIN;
  if (!username) throw new Error("Could not identify the current Windows user.");
  const currentUser = domain ? `${domain}\\${username}` : username;
  const rights = isDirectory ? "(OI)(CI)(F)" : "(F)";
  await execFileAsync("icacls.exe", [targetPath, "/reset"], {
    windowsHide: true,
    timeout: 5000,
  });
  await execFileAsync(
    "icacls.exe",
    [
      targetPath,
      "/inheritance:r",
      "/grant:r",
      `${currentUser}:${rights}`,
      "*S-1-5-18:(F)",
      "*S-1-5-32-544:(F)",
    ],
    { windowsHide: true, timeout: 5000 },
  );

  const escapedPath = targetPath.replaceAll("'", "''");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$path = '${escapedPath}'`,
    "$acl = Get-Acl -LiteralPath $path",
    "$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
    "$entries = @($acl.Access | ForEach-Object {",
    "  [pscustomobject]@{ Sid = $_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value; Inherited = $_.IsInherited; Type = $_.AccessControlType.ToString(); Rights = $_.FileSystemRights.ToString() }",
    "})",
    "[pscustomobject]@{ Protected = $acl.AreAccessRulesProtected; CurrentSid = $currentSid; Entries = $entries } | ConvertTo-Json -Compress -Depth 4",
  ].join("; ");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 },
  );
  const acl = JSON.parse(stdout.trim()) as {
    Protected: boolean;
    CurrentSid: string;
    Entries: Array<{
      Sid: string;
      Inherited: boolean;
      Type: string;
      Rights: string;
    }>;
  };
  const expectedSids = new Set([...allowedSids, acl.CurrentSid]);
  if (
    !acl.Protected ||
    acl.Entries.length !== expectedSids.size ||
    acl.Entries.some(
      (entry) =>
        entry.Inherited ||
        entry.Type !== "Allow" ||
        entry.Rights !== "FullControl" ||
        !expectedSids.has(entry.Sid),
    ) ||
    [...expectedSids].some((sid) => !acl.Entries.some((entry) => entry.Sid === sid))
  ) {
    throw new Error("JWT secret file permissions could not be verified as private.");
  }
}

export async function loadOrCreateJwtSecret(
  secretFilePath: string,
  options: {
    protectPath?: (targetPath: string, isDirectory: boolean) => Promise<void>;
    generateSecret?: () => string;
  } = {},
) {
  const protectPath = options.protectPath ?? protectWindowsPath;
  const generateSecret = options.generateSecret ?? (() => randomBytes(32).toString("base64url"));
  const directory = path.dirname(secretFilePath);
  const markerPath = `${secretFilePath}.initialized`;
  await mkdir(directory, { recursive: true });
  await protectPath(directory, true);

  let initializedMarker: string | undefined;
  try {
    initializedMarker = await readFile(markerPath, "utf8");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }

  let secret: string;
  try {
    secret = await readFile(secretFilePath, "utf8");
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    if (initializedMarker !== undefined) {
      throw new Error("The persisted JWT secret is missing; refusing to start the API.");
    }
    secret = generateSecret();
    if (!isValidPersistedJwtSecret(secret)) {
      throw new Error("The generated JWT secret is not a valid 256-bit value.");
    }
    try {
      await writeFile(secretFilePath, secret, { encoding: "utf8", flag: "wx", mode: 0o600 });
    } catch (writeError) {
      if (
        !(writeError instanceof Error) ||
        !("code" in writeError) ||
        writeError.code !== "EEXIST"
      ) {
        throw writeError;
      }
      secret = await readFile(secretFilePath, "utf8");
    }
  }

  await protectPath(secretFilePath, false);
  if (!isValidPersistedJwtSecret(secret)) {
    throw new Error("The persisted JWT secret is missing or invalid; refusing to start the API.");
  }

  if (initializedMarker === undefined) {
    try {
      await writeFile(markerPath, initializedMarkerValue, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      initializedMarker = initializedMarkerValue;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
      initializedMarker = await readFile(markerPath, "utf8");
    }
  }
  await protectPath(markerPath, false);
  if (initializedMarker !== initializedMarkerValue) {
    throw new Error("The JWT secret initialization marker is invalid; refusing to start the API.");
  }
  return secret;
}
