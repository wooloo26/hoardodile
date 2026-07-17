import { expect, test } from "vitest"
import { createLogger, REDACTED } from "./logger.ts"

function capture() {
	const chunks: string[] = []
	const stream = {
		write(chunk: string) {
			chunks.push(chunk)
		},
	}
	return { stream, chunks }
}

test("logger redacts cookie and authorization on req.headers", () => {
	const { stream, chunks } = capture()
	const log = createLogger({ level: "info", destination: stream })
	log.info(
		{
			req: {
				method: "POST",
				url: "/auth/login",
				headers: {
					cookie: "app_session=SECRET-COOKIE-VALUE",
					authorization: "Bearer SECRET-TOKEN",
					"x-password": "hunter2",
				},
			},
		},
		"request",
	)
	const out = chunks.join("")
	expect(out).not.toContain("SECRET-COOKIE-VALUE")
	expect(out).not.toContain("SECRET-TOKEN")
	expect(out).not.toContain("hunter2")
	expect(out).toContain(REDACTED)
})

test("logger redacts Set-Cookie on responses", () => {
	const { stream, chunks } = capture()
	const log = createLogger({ level: "info", destination: stream })
	log.info(
		{ res: { headers: { "set-cookie": "app_session=RAW-SESSION-ID" } } },
		"response",
	)
	const out = chunks.join("")
	expect(out).not.toContain("RAW-SESSION-ID")
	expect(out).toContain(REDACTED)
})

test("logger redacts password fields in payloads", () => {
	const { stream, chunks } = capture()
	const log = createLogger({ level: "info", destination: stream })
	log.info({ body: { password: "plaintext-password" } }, "login body")
	const out = chunks.join("")
	expect(out).not.toContain("plaintext-password")
	expect(out).toContain(REDACTED)
})
