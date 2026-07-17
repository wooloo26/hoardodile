import {
	closeSync,
	openSync,
	truncateSync,
	unlinkSync,
	writeSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readFileRange } from "src/domain/res/archive.ts"
import { afterEach, describe, expect, test } from "vitest"

const INT32_MAX = 2_147_483_647

describe("readFileRange", () => {
	const paths: string[] = []

	afterEach(() => {
		for (const path of paths.splice(0)) {
			try {
				unlinkSync(path)
			} catch {
				// already removed
			}
		}
	})

	test("reads bytes beyond the Int32 position limit", async () => {
		const path = join(tmpdir(), `hoard-read-range-${Date.now()}.bin`)
		paths.push(path)
		const fd = openSync(path, "w")
		closeSync(fd)
		truncateSync(path, INT32_MAX + 64)
		const rw = openSync(path, "r+")
		writeSync(rw, Buffer.from("0123456789"), 0, 10, INT32_MAX + 1)
		closeSync(rw)

		const buf = await readFileRange(path, INT32_MAX + 1, INT32_MAX + 10)
		expect(buf.toString("utf8")).toBe("0123456789")
	})
})
