import nodemailer from "nodemailer";

const env = (name: string) => {
	const value = process.env[name]?.trim();
	if (!value) {
		console.error(`Missing required env: ${name}`);
		process.exit(1);
	}
	return value;
};

const PORT = Number(process.env.MAILER_PORT ?? 8080);
const SMTP_PORT = Number(process.env.EMAIL_PORT ?? 587);
const FROM = env("EMAIL_DEFAULT_FROM");
const TO = env("EMAIL_CONTACT_TO");

const transport = nodemailer.createTransport({
	host: env("EMAIL_HOST"),
	port: SMTP_PORT,
	secure: SMTP_PORT === 465,
	auth: { user: env("EMAIL_HOST_USER"), pass: env("EMAIL_HOST_PASSWORD") },
	requireTLS: true,
});

// Header-safe: strip CR/LF so nothing can inject headers, clamp length.
const clean = (value: string, max: number) => (value ?? "").replace(/[\r\n\u0000]+/g, " ").trim().slice(0, max);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const WINDOW_MS = 5 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const seen = new Map<string, number[]>();
let sweeping = false;

function sweepSeen(now: number) {
	if (sweeping) return;
	sweeping = true;
	void Promise.resolve()
		.then(() => {
			for (const [ip, times] of seen) {
				const live = times.filter((time) => now - time < WINDOW_MS);
				if (live.length === 0) seen.delete(ip);
				else if (live.length !== times.length) seen.set(ip, live);
			}
		})
		.finally(() => {
			sweeping = false;
		});
}

function ipLimited(ip: string): boolean {
	const now = Date.now();
	sweepSeen(now);
	const times = (seen.get(ip) ?? []).filter((time) => now - time < WINDOW_MS);
	if (times.length >= MAX_PER_WINDOW) {
		seen.set(ip, times);
		return true;
	}
	seen.set(ip, [...times, now]);
	return false;
}

let shuttingDown = false;

const server = Bun.serve({
	port: PORT,
	async fetch(request, server) {
		if (shuttingDown)
			return Response.json({ error: "shutting_down" }, { status: 503 });
		if (request.method !== "POST")
			return new Response("Method not allowed", { status: 405 });

		const ip = server.requestIP(request)?.address ?? "unknown";
		if (ipLimited(ip))
			return Response.json({ error: "too_many" }, { status: 429 });

		let body: Record<string, string>;
		try {
			body = (await request.json()) as Record<string, string>;
		} catch {
			return Response.json({ error: "invalid_json" }, { status: 400 });
		}

		if (body.consent !== "true")
			return Response.json({ error: "consent_required" }, { status: 400 });

		const name = clean(body.name, 100);
		const email = clean(body.email, 254);
		const message = clean(body.message, 1500);
		const audience = clean(body.audience, 100);
		const interest = clean(body.interest, 100);

		if (!name || !message)
			return Response.json({ error: "missing_fields" }, { status: 400 });
		if (!EMAIL_RE.test(email))
			return Response.json({ error: "invalid_email" }, { status: 400 });

		const text = [
			`Päringu esitaja: ${audience}`,
			`Teema: ${interest}`,
			`Nimi: ${name}`,
			`E-post: ${email}`,
			"",
			"Lühikirjeldus:",
			message,
		].join("\n");

		try {
			await transport.sendMail({
				from: FROM,
				to: TO,
				replyTo: email,
				subject: `Auvõlg OÜ päring — ${interest}`,
				text,
			});
			console.log(`[${new Date().toISOString()}] sent from ${ip}`);
			return Response.json({ ok: true });
		} catch (error) {
			console.error("SMTP send failed:", error);
			return Response.json({ error: "send_failed" }, { status: 502 });
		}
	},
});

console.log(`Mailer listening on :${PORT}`);

async function shutdown(signal: string) {
	if (shuttingDown) {
		console.error(`Received ${signal} again; forcing exit`);
		process.exit(0);
	}

	shuttingDown = true;
	console.log(`Received ${signal}; draining in-flight requests...`);

	const timeout = setTimeout(() => {
		console.warn("Drain timed out; closing remaining connections");
		transport.close();
		process.exit(0);
	}, 10_000);

	try {
		await server.stop();
		clearTimeout(timeout);
		transport.close();
		console.log("Mailer stopped cleanly");
		process.exit(0);
	} catch (error) {
		clearTimeout(timeout);
		console.error("Shutdown failed:", error);
		process.exit(1);
	}
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => void shutdown(signal));
}
