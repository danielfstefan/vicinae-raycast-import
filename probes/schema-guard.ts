/**
 * The probe that bites: the schema guard, tested against the REAL code.
 *
 * The reviewer flagged this rule class FIVE times (CORRECTNESS-001) — twice for a
 * key-presence guard, once for accepting any recognized group, and the failure mode
 * both times was identical: a valid .json that is not a snippet export, imported with
 * "Replace existing", zeroes the snippet store.
 *
 * Run: npx tsx probes/schema-guard.ts
 */
import assert from "node:assert/strict";

import { hasSnippetContainer, looksLikeRaycastExport } from "../src/lib/raycast-schema";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
	console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
	if (!ok) failures += 1;
};

// --- fixtures that MUST be accepted as a Raycast export -----------------------
const realExport = {
	snippets: { snippets: [{ name: "greet", text: "hello" }], schemaVersion: 1 },
	nodeExtensions: { schemaVersion: 1, extensions: [{ uuid: "u", name: "n", author: "a", version: "1" }] },
	clipboardHistory: { clipboardEntries: [{ text: "x" }] },
	emoji: { emojis: [{ symbol: "🙂", customKeywords: [], frecencyDate: 1 }] },
	quicklinks: { quicklinks: [{ name: "q", link: "https://x" }] },
};
const valid: [string, unknown][] = [
	["real export (all groups)", realExport],
	["legacy builtin_package_snippets", { builtin_package_snippets: { snippets: [{ name: "a", text: "b" }] } }],
	["bare v1 snippet array", [{ name: "a", text: "b" }]],
	["empty v1 array (valid empty export)", []],
	["bare snippets array field", { snippets: [{ name: "a", text: "b" }] }],
	["empty snippet container (user emptied it)", { snippets: { snippets: [] } }],
];
for (const [label, fixture] of valid) {
	check(`accepts: ${label}`, looksLikeRaycastExport(fixture) === true);
}

// --- the reviewer's EXACT false positives (#15) -------------------------------
const hostile: [string, unknown][] = [
	["{settings:{}}", { settings: {} }],
	["{notes:[...]}", { notes: [{ a: 1 }] }],
	["{settings:{},notes:{},ai:{}}", { settings: {}, notes: {}, ai: {} }],
	["{snippets:{}} — key present, no array", { snippets: {} }],
	["{snippets:{schemaVersion:1}} — no array", { snippets: { schemaVersion: 1 } }],
	["plain string", "not an export"],
	["number", 42],
	["null", null],
];
for (const [label, fixture] of hostile) {
	check(`rejects: ${label}`, looksLikeRaycastExport(fixture) === false);
}

// --- the WIPE case (#17): a valid export that carries no snippets -------------
// It must be accepted as an export (it IS one) but must NOT authorise the
// snippet-store write, or "Replace existing" erases the store.
for (const [label, fixture] of [
	["quicklinks only", { quicklinks: { quicklinks: [{ name: "q", link: "https://x" }] } }],
	["emoji only", { emoji: { emojis: [{ symbol: "🙂" }] } }],
	["extensions only", { nodeExtensions: { schemaVersion: 1, extensions: [{ name: "n" }] } }],
	["clipboard only", { clipboardHistory: { clipboardEntries: [{ text: "x" }] } }],
] as [string, unknown][]) {
	check(`accepts as export but NOT as snippet source: ${label}`,
		looksLikeRaycastExport(fixture) === true && hasSnippetContainer(fixture) === false);
}

// --- and the converse: a snippet export MUST authorise the write --------------
for (const [label, fixture] of valid) {
	check(`snippet container detected: ${label}`, hasSnippetContainer(fixture) === true);
}

console.log(failures === 0 ? "\nALL SCHEMA-GUARD CHECKS PASSED" : `\n${failures} SCHEMA-GUARD CHECK(S) FAILED`);
assert.equal(failures, 0);
