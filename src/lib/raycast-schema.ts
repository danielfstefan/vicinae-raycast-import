/**
 * Raycast export schema guard — PURE (no SDK, no I/O).
 *
 * Split out of the view command on purpose: the store reviewer flagged this rule
 * class five times (CORRECTNESS-001), and a rule that can only be exercised by
 * clicking through a form is a rule that regresses silently. Everything here is
 * importable from a plain `npx tsx probes/schema-guard.ts` run.
 */

// Recognized Raycast export top-level groups and the field that must hold the
// actual data array. Used by looksLikeRaycastExport() to reject unrelated JSON
// BEFORE any store is modified (CORRECTNESS-001: an invalid .json must never
// erase snippets via "Replace existing"). Presence of a key alone is NOT
// enough — the value must be (or contain) an array of entries, so generic
// objects carrying keys like `settings` or `notes` don't pass.
const RAYCAST_EXPORT_GROUPS: { key: string; container?: string }[] = [
	{ key: "snippets", container: "snippets" },
	{ key: "builtin_package_snippets", container: "snippets" },
	{ key: "clipboardHistory", container: "clipboardEntries" },
	{ key: "builtin_package_clipboardHistory", container: "clipboardEntries" },
	{ key: "emoji", container: "emojis" },
	{ key: "builtin_package_emoji", container: "emojis" },
	{ key: "nodeExtensions", container: "extensions" },
	{ key: "quicklinks", container: "quicklinks" },
];

/** True if `value` is a Raycast data container: either the bare array itself
 *  (`snippets: [...]`) or an object whose `container` field is the array
 *  (`nodeExtensions: { schemaVersion, extensions: [...] }`). */
function isRaycastContainer(value: unknown, container?: string): boolean {
	if (Array.isArray(value)) return true;
	if (value === null || typeof value !== "object") return false;
	const obj = value as Record<string, unknown>;
	return container ? Array.isArray(obj[container]) : Object.values(obj).some(Array.isArray);
}

/** True if `data` looks like a Raycast export (v1 snippet array, or an object
 *  carrying at least one structurally valid Raycast data group). */
export function looksLikeRaycastExport(data: unknown): boolean {
	if (Array.isArray(data)) {
		// v1 "Export Snippets" is a bare array of snippet objects — accept any
		// array that PLAUSIBLY holds snippets (objects with a name/text/keyword)
		if (data.length === 0) return true; // structurally valid empty export
		return data.every(
			(e) => e !== null && typeof e === "object" && ("name" in e || "text" in e || "keyword" in e),
		);
	}
	if (data === null || typeof data !== "object") return false;
	const obj = data as Record<string, unknown>;
	return RAYCAST_EXPORT_GROUPS.some(
		(g) => g.key in obj && isRaycastContainer(obj[g.key], g.container),
	);
}

/** True if `data` carries a SNIPPET data container specifically. For an object
 *  export this means a `snippets`/`builtin_package_snippets` group holding an
 *  array. A bare array is the v1 "Export Snippets" form — even an empty one is
 *  a structurally valid empty snippet export the user intentionally replaced
 *  with. Used to guard the snippet-store write so a valid but snippet-less
 *  export (e.g. only `quicklinks`) can never erase the store in replace mode. */
export function hasSnippetContainer(data: unknown): boolean {
	if (Array.isArray(data)) return true;
	if (data === null || typeof data !== "object") return false;
	const obj = data as Record<string, unknown>;
	return ["snippets", "builtin_package_snippets"].some(
		(k) => k in obj && isRaycastContainer(obj[k], "snippets"),
	);
}
