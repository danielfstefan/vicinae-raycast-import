/**
 * The probe that validates against REAL data, not fixtures.
 *
 * Fixtures encode what I believe a Raycast export looks like; these three files are
 * what it actually is. This is the probe the skill says bites — it catches shape
 * changes in the export and proves the schema guard accepts real exports instead of
 * only the ones I invented.
 *
 * The passphrase is read from the login keychain (service `Raycast`, account
 * `export_passphrase`) and is NEVER printed, logged, or written to disk.
 *
 * Run: npx tsx probes/real-export.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { decryptRaycastFile, findNodeExtensions } from "../src/lib/raycast";
import { hasSnippetContainer, looksLikeRaycastExport } from "../src/lib/raycast-schema";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
	console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
	if (!ok) failures += 1;
};

function countArray(root: unknown, ...path: string[]): number {
	let cur: unknown = root;
	for (const key of path) {
		if (cur === null || typeof cur !== "object") return 0;
		cur = (cur as Record<string, unknown>)[key];
	}
	return Array.isArray(cur) ? cur.length : 0;
}

// ADVERSE CASE: this probe needs a machine that HAS a real export and the login
// keychain. Asserting on those would make it a red herring everywhere else (CI,
// another developer, a fresh clone) — a harness that cries wolf gets ignored. So it
// proves the properties when the data is there and SKIPS cleanly (exit 0) when not.
const dir = process.env.RAYCONFIG_DIR ?? join(homedir(), "Documents");
let files: string[] = [];
try {
	files = readdirSync(dir)
		.filter((f) => f.toLowerCase().endsWith(".rayconfig"))
		.map((f) => join(dir, f));
} catch {
	/* no such dir on this machine */
}

let passphrase = "";
try {
	passphrase = execFileSync("security", ["find-generic-password", "-s", "Raycast", "-a", "export_passphrase", "-w"], {
		encoding: "utf8",
	}).trim(); // the trailing newline is part of the tool's output, not the passphrase
} catch {
	/* not on macOS, or the item is absent */
}

if (files.length === 0 || passphrase.length < 8) {
	console.log(`SKIP — no real export (${files.length} found in ${dir}) or no keychain passphrase here.`);
	console.log("     Nothing to prove on this machine; the fixture probes still cover the guard.");
	process.exit(0);
}
console.log(`ok   probing ${files.length} real export(s) from ${dir} — passphrase read, never printed`);

for (const file of files) {
	const label = file.split("/").pop() ?? file;
	try {
		const root = decryptRaycastFile(file, passphrase);
		check(`decrypts: ${label}`, root !== null && typeof root === "object");

		// the schema guard must accept EVERY real export — this is the assertion that
		// proves it is not merely fitted to my fixtures
		check(`  accepted as a Raycast export: ${label}`, looksLikeRaycastExport(root) === true);

		const extensions = findNodeExtensions(root);
		const snippets = countArray(root, "snippets", "snippets") || countArray(root, "builtin_package_snippets", "snippets");
		const clipboard = countArray(root, "clipboardHistory", "clipboardEntries");
		const emoji = countArray(root, "emoji", "emojis");
		console.log(
			`     ${label}: ${extensions.length} extensions, ${snippets} snippets, ${clipboard} clipboard entries, ${emoji} emoji`,
		);

		// if the export carries snippets at all, the guard must authorise the store write
		if (snippets > 0) {
			check(`  snippet container detected: ${label}`, hasSnippetContainer(root) === true);
		}
	} catch (err) {
		check(`decrypts: ${label}`, false, err instanceof Error ? err.message : String(err));
	}
}

console.log(failures === 0 ? "\nALL REAL-EXPORT CHECKS PASSED" : `\n${failures} REAL-EXPORT CHECK(S) FAILED`);
assert.equal(failures, 0);
