/**
 * SECURITY-001, proven with a hostile archive rather than asserted in prose.
 *
 * The reviewer's finding: entry names were joined straight to the destination, so a
 * downloaded entry named `root/../../target` wrote OUTSIDE the staging directory.
 * Cheap to test — a stored-method zip is ~40 lines with node's Buffer.
 *
 * Run: npx tsx probes/hostile-zip.ts
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { extractZip } from "../src/lib/unzip";

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
	console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
	if (!ok) failures += 1;
};

function crc32(buf: Buffer): number {
	let c = ~0;
	for (const b of buf) {
		c ^= b;
		for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
	}
	return ~c >>> 0;
}

/** Minimal stored-method zip (no compression), with a real central directory. */
function makeZip(entries: { name: string; data: Buffer }[]): Buffer {
	const locals: Buffer[] = [];
	const central: Buffer[] = [];
	let offset = 0;
	for (const e of entries) {
		const name = Buffer.from(e.name, "utf8");
		const crc = crc32(e.data);
		const size = e.data.length;
		const lh = Buffer.alloc(30);
		lh.writeUInt32LE(0x04034b50, 0);
		lh.writeUInt16LE(20, 4);
		lh.writeUInt32LE(crc, 14);
		lh.writeUInt32LE(size, 18);
		lh.writeUInt32LE(size, 22);
		lh.writeUInt16LE(name.length, 26);
		locals.push(lh, name, e.data);

		const ch = Buffer.alloc(46);
		ch.writeUInt32LE(0x02014b50, 0);
		ch.writeUInt16LE(20, 4);
		ch.writeUInt16LE(20, 6);
		ch.writeUInt32LE(crc, 16);
		ch.writeUInt32LE(size, 20);
		ch.writeUInt32LE(size, 24);
		ch.writeUInt16LE(name.length, 28);
		ch.writeUInt32LE(offset, 42);
		central.push(ch, name);
		offset += 30 + name.length + size;
	}
	const body = Buffer.concat(locals);
	const cd = Buffer.concat(central);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(entries.length, 8);
	eocd.writeUInt16LE(entries.length, 10);
	eocd.writeUInt32LE(cd.length, 12);
	eocd.writeUInt32LE(body.length, 16);
	return Buffer.concat([body, cd, eocd]);
}

const sandbox = mkdtempSync(join(tmpdir(), "zip-probe-"));
const staging = join(sandbox, "staging");
const outside = join(sandbox, "OUTSIDE.txt");
mkdirSync(staging, { recursive: true });
writeFileSync(outside, "sentinel");

const zip = makeZip([
	{ name: "top/package.json", data: Buffer.from('{"name":"legit"}') },
	{ name: "top/../../OUTSIDE.txt", data: Buffer.from("PWNED") }, // traversal
	{ name: "/abs/PWNED.txt", data: Buffer.from("PWNED") }, // absolute
	{ name: "top/sub/../ok.txt", data: Buffer.from("fine") }, // benign normalisation
]);

extractZip(zip, staging, { stripComponents: 1 });

check("the traversal entry did not escape", readFileSync(outside, "utf8") === "sentinel",
	readFileSync(outside, "utf8"));
check("no absolute-path write happened", !existsSync(join(sandbox, "abs")) && !existsSync("/abs/PWNED.txt"));
check("the legitimate file extracted", existsSync(join(staging, "package.json")));
check("nothing was written above the staging dir",
	!existsSync(resolve(staging, "..", "OUTSIDE.txt")) || readFileSync(resolve(staging, "..", "OUTSIDE.txt"), "utf8") === "sentinel");

rmSync(sandbox, { recursive: true, force: true });
console.log(failures === 0 ? "\nALL HOSTILE-ZIP CHECKS PASSED" : `\n${failures} HOSTILE-ZIP CHECK(S) FAILED`);
assert.equal(failures, 0);
