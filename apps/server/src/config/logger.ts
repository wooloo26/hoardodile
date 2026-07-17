import { join } from "node:path"
import {
	type DestinationStream,
	type Logger,
	type LoggerOptions,
	pino,
	type TransportTargetOptions,
} from "pino"

export const REDACTED = "[Redacted]"

export const redactPaths = [
	"req.headers.cookie",
	"req.headers.authorization",
	'req.headers["x-password"]',
	"res.headers['set-cookie']",
	"headers.cookie",
	"headers.authorization",
	'headers["x-password"]',
	"cookie",
	"authorization",
	"password",
	"body.password",
	"request.body.password",
]

/**
 * Build the pino {@link LoggerOptions} used by the Fastify app and scripts.
 *
 * Redaction paths cover cookie / authorization / password-bearing fields on
 * both requests and responses so sensitive material never lands in logs.
 */
export function loggerOptions(level?: string): LoggerOptions {
	return {
		level: level ?? process.env.LOG_LEVEL ?? "info",
		redact: {
			paths: redactPaths,
			censor: REDACTED,
			remove: false,
		},
		timestamp: pino.stdTimeFunctions.isoTime,
		base: undefined,
	}
}

export type CreateLoggerOptions = {
	level?: string
	destination?: DestinationStream
}

/**
 * Create a standalone pino {@link Logger} for use outside the Fastify app
 * (e.g. scripts or tests). Accepts an optional destination stream so tests
 * can capture output.
 */
export function createLogger(opts: CreateLoggerOptions = {}): Logger {
	return pino(loggerOptions(opts.level), opts.destination)
}

export type BuildLoggerOptionsInput = {
	level?: string
	logsDir?: string
	nodeEnv?: string
}

/**
 * Build pino {@link LoggerOptions} for the Fastify app, optionally wiring
 * pino-pretty (development TTY) and file transports (non-test environments).
 *
 * - Development + TTY → pino-pretty target
 * - Non-test + logsDir → `app.log` (info+) and `app.error.log` (error+)
 *
 * Keeps the existing redaction and timestamp configuration.
 */
export function buildLoggerOptions(
	input: BuildLoggerOptionsInput = {},
): LoggerOptions {
	const level = input.level ?? process.env.LOG_LEVEL ?? "info"
	const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development"
	const targets: TransportTargetOptions[] = []

	if (nodeEnv === "development" && process.stdout.isTTY) {
		targets.push({
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "HH:MM:ss Z",
				ignore: "pid,hostname",
			},
			level,
		})
	}

	if (input.logsDir && nodeEnv !== "test") {
		targets.push(
			{
				target: "pino-roll",
				options: {
					file: join(input.logsDir, "app.log"),
					frequency: "daily",
					dateFormat: "yyyy-MM-dd",
					limit: { count: 7 },
					mkdir: true,
				},
				level: "info",
			},
			{
				target: "pino-roll",
				options: {
					file: join(input.logsDir, "app.error.log"),
					frequency: "daily",
					dateFormat: "yyyy-MM-dd",
					limit: { count: 7 },
					mkdir: true,
				},
				level: "error",
			},
		)
	}

	const base = loggerOptions(level)

	if (targets.length === 0) return base
	if (targets.length === 1) return { ...base, transport: targets[0] }
	return { ...base, transport: { targets } }
}
