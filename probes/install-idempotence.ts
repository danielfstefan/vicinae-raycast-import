/**
 * The skill's probe #4: install REAL store extensions into a SANDBOX and prove the
 * re-run is a no-op.
 *
 * Two properties matter and neither is provable by reading:
 *   1. the bundle layout the live app auto-registers (`store.raycast.<name>/` with a
 *      root package.json carrying the commands);
 *   2. IDEMPOTENCE — a second run must skip what is already there and re-download
 *      nothing. Re-running an import is the documented recovery path after a worker is
 *      torn down mid-run, so a second run that re-downloads 233 extensions is a bug.
 *
 * Nothing here touches the user's real extension directory: `destDir` points at a
 * temp sandbox (which is why the install API takes one). Skips cleanly when the
 * machine has no real export to pick from.
 *
 * Run: npx tsx probes/install-idempotence.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { installExtensions } from "../src/lib/extensions-install";
import { decryptRaycastFile, findNodeExtensions } from "../src/lib/raycast";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
	console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
	if (!ok) failures += 1;
};

// ---- source: the REAL export (skip cleanly if this machine has none) ----------
const dir = process.env.RAYCONFIG_DIR ?? join(homedir(), "Documents");
let picks: { name: string; author: string }[] = [];
try {
	const file = readdirSync(dir)
		.filter((f) => f.toLowerCase().endsWith(".rayconfig"))
		.sort()
		.reverse()
		.map((f) => join(dir, f))[0];
	const passphrase = execFileSync(
		"security",
		["find-generic-password", "-s", "Raycast", "-a", "export_passphrase", "-w"],
		{ encoding: "utf8" },
	).trim();
	const root = decryptRaycastFile(file, passphrase);
	picks = findNodeExtensions(root)
		.filter((e) => e.name && e.author)
		.slice(0, 2)
		.map((e) => ({ name: String(e.name), author: String(e.author) }));
} catch {
	/* handled below */
}

if (picks.length < 2) {
	console.log(`SKIP — need 2 real extensions from an export in ${dir}; found ${picks.length}.`);
	console.log("     Nothing to install, and installing nothing proves nothing.");
	process.exit(0);
}
console.log(`ok   picked from the real export: ${picks.map((p) => `${p.author}/${p.name}`).join(", ")}`);

// ---- count every network call so "skipped" can be proven, not trusted --------
async function main(): Promise<void> {
let fetches = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
	fetches += 1;
	return realFetch(...args);
}) as typeof fetch;

const sandbox = mkdtempSync(join(tmpdir(), "ri-install-"));

try {
	const first = await installExtensions(picks, undefined, { destDir: sandbox });
	check("first run installs both extensions", first.installed === 2 && first.failures.length === 0,
		`installed=${first.installed} skipped=${first.skipped} failed=${first.failures.length}${first.failures[0] ? ` (${first.failures[0].error})` : ""}`);

	const dirs = readdirSync(sandbox).sort();
	check("bundles land in the store.raycast.<name> lane", dirs.every((d) => d.startsWith("store.raycast.")), dirs.join(", "));
	check("each bundle has a root package.json", dirs.every((d) => existsSync(join(sandbox, d, "package.json"))));

	for (const d of dirs) {
		const pkg = JSON.parse(readFileSync(join(sandbox, d, "package.json"), "utf8")) as { commands?: unknown[] };
		check(`  ${d} declares its commands`, Array.isArray(pkg.commands) && pkg.commands.length > 0,
			`${Array.isArray(pkg.commands) ? pkg.commands.length : 0} command(s)`);
	}

	const afterFirst = fetches;
	check("the first run actually downloaded something", afterFirst > 0, `${afterFirst} requests`);

	// ---- the property that matters: the second run is a NO-OP ----------------
	const second = await installExtensions(picks, undefined, { destDir: sandbox });
	check("second run installs nothing", second.installed === 0, `installed=${second.installed}`);
	check("second run skips both", second.skipped === 2, `skipped=${second.skipped}`);
	check("second run re-downloads NOTHING", fetches === afterFirst, `${fetches - afterFirst} new request(s)`);
	check("no duplicate bundle dirs appeared", readdirSync(sandbox).length === dirs.length,
		`${dirs.length} -> ${readdirSync(sandbox).length}`);
} finally {
	globalThis.fetch = realFetch;
	rmSync(sandbox, { recursive: true, force: true });
	check("the sandbox is cleaned up", !existsSync(sandbox));
}

}

void main().then(() => {
	console.log(
		failures === 0
			? "\nALL INSTALL-IDEMPOTENCE CHECKS PASSED"
			: `\n${failures} INSTALL-IDEMPOTENCE CHECK(S) FAILED`,
	);
	assert.equal(failures, 0);
});
