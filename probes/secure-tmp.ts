/**
 * SECURITY-003, proven by round-trip rather than by reading the code.
 *
 * The reviewer's finding: the decrypted clipboard history (and passphrase-derived
 * material) was written to a PREDICTABLE shared temp path in plaintext. The fix is a
 * secure payload: unpredictable dir, 0700, AES-256-GCM under an ephemeral key, 0600
 * file, deleted on every exit path. All four properties are checkable here.
 *
 * Run: npx tsx probes/secure-tmp.ts
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
	SECRET_PREFIX,
	cleanupStaleSecrets,
	deleteSecretPayload,
	readSecretPayload,
	writeSecretPayload,
} from "../src/lib/secure-tmp";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
	console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
	if (!ok) failures += 1;
};

const secret = { clipboard: [{ text: "sensitive #1" }, { text: "sensitive #2" }], note: "x".repeat(500) };
const a = writeSecretPayload(secret);
const b = writeSecretPayload(secret);

check("the payload dir is unpredictable (two writes differ)", a.dir !== b.dir, `${a.dir.split("/").pop()} vs ${b.dir.split("/").pop()}`);
check("the dir name is prefixed and random-suffixed", a.dir.includes(SECRET_PREFIX));

const dirMode = statSync(a.dir).mode & 0o777;
check("the dir is 0700 (owner only)", dirMode === 0o700, `0o${dirMode.toString(8)}`);

const payloadPath = join(a.dir, "payload.bin");
check("the payload file exists", existsSync(payloadPath));
const fileMode = statSync(payloadPath).mode & 0o777;
check("the payload file is 0600", fileMode === 0o600, `0o${fileMode.toString(8)}`);

const onDisk = readdirSync(a.dir);
const clearText = readdirSync(a.dir).some((f) => {
	const full = join(a.dir, f);
	try {
		return statSync(full).isFile() && readFileSync(full, "utf8").includes("sensitive #1");
	} catch {
		return false; // binary ciphertext is not valid utf8 — that is the point
	}
});
check("the plaintext is NOT on disk in the clear", !clearText, `files: ${onDisk.join(", ")}`);

check("the round-trip returns the original", JSON.stringify(readSecretPayload(a)) === JSON.stringify(secret));

// a wrong key must be rejected, not silently returned
const tampered = { ...a, key: Buffer.alloc(32, 7).toString("base64") };
let rejected = false;
try {
	readSecretPayload(tampered);
} catch {
	rejected = true;
}
check("a wrong key is rejected", rejected);

deleteSecretPayload(a);
check("delete removes the dir entirely", !existsSync(a.dir));

// the stale sweep must not throw and must leave the fresh one alone
cleanupStaleSecrets(6 * 60 * 60 * 1000);
check("the stale sweep keeps a fresh payload", existsSync(b.dir));

deleteSecretPayload(b);
check("cleanup after the probe", !existsSync(b.dir));

console.log(failures === 0 ? "\nALL SECURE-TMP CHECKS PASSED" : `\n${failures} SECURE-TMP CHECK(S) FAILED`);
assert.equal(failures, 0);
