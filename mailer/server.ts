/**
 * Contact form relay for OCI Email Delivery.
 *
 * Receives POST /api/contact with JSON, validates and rate-limits it,
 * then submits the message over SMTP STARTTLS to OCI's relay. No HTML
 * output, no inbound attachments: a fixed-format plain-text notification.
 */
import nodemailer from "nodemailer";

const PORT = Number(process.env.MAILER_PORT ?? 8080);

const SMTP_HOST = process.env.EMAIL_HOST ?? "";
const SMTP_PORT = Number(process.env.EMAIL_PORT ?? 587);
const SMTP_USER = process.env.EMAIL_HOST_USER ?? "";
const SMTP_PASSWORD = process.env.EMAIL_HOST_PASSWORD ?? "";
const FROM = process.env.EMAIL_DEFAULT_FROM ?? "";       // approved sender, e.g. test@auvolg.ee
const TO = process.env.EMAIL_CONTACT_TO ?? "";                 // recipient mailbox

for (const [name, value] of [
	["EMAIL_HOST", SMTP_HOST],
	["EMAIL_HOST_USER", SMTP_USER],
	["EMAIL_HOST_PASSWORD", SMTP_PASSWORD],
	["EMAIL_DEFAULT_FROM", FROM],
	["EMAIL_CONTACT_TO", TO],
] as const) {
	if (!value) {
		console.error(`Missing required env: ${name}`);
		process.exit(1);
	}
}

const transport = nodemailer.createTransport({
	host: SMTP_HOST,
	port: SMTP_PORT,
	secure: SMTP_PORT === 465, // 587 = STARTTLS
	auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
	requireTLS: true,
});

// Header-safe: strip CR/LF so nothing can inject headers, clamp length.
const clean = (v: unknown, max: number) =>
	String(v ?? "").replace(/[\r\n\u0000]+/g, " ").trim().slice(0, max);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const VALID_INTERESTS = new Set([
	"Probleemse nõude müük",
	"Vara müük",
	"Pärandiosa müük",
	"Kaasomandi osa müük",
	"Muu küsimus",
]);
const AUDIENCE_LABEL: Record<string, string> = {
	business: "Ettevõte või korteriühistu",
	individual: "Eraisik",
};

// Second layer of rate limiting (nginx is the first). Per-IP timestamps.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const seen = new Map<string, number[]>();
let lastSweep = Date.now();

function ipLimited(ip: string): boolean {
	const now = Date.now();
	if (now - lastSweep > 5 * 60 * 1000) {
		lastSweep = now;
		for (const [key, times] of seen) {
			const live = times.filter(t => now - t < WINDOW_MS);
			if (live.length === 0) seen.delete(key); else seen.set(key, live);
		}
	}
	const times = (seen.get(ip) ?? []).filter(t => now - t < WINDOW_MS);
	if (times.length >= MAX_PER_WINDOW) return true;
	times.push(now);
	seen.set(ip, times);
	return false;
}

let draining = false;
let shutdownPromise: Promise<void> | undefined;

const server = Bun.serve({
	port: PORT,
	async fetch(request, requestServer) {
		if (draining) {
			return Response.json({ error: "shutting_down" }, { status: 503 });
		}
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}
		const ip = requestServer.requestIP(request)?.address ?? "unknown";
		if (ipLimited(ip)) {
			return Response.json({ error: "too_many" }, { status: 429 });
		}

		let body: Record<string, unknown>;
		try {
			body = (await request.json()) as Record<string, unknown>;
		} catch {
			return Response.json({ error: "invalid_json" }, { status: 400 });
		}

		const consent = body.consent === true;
		const name = clean(body.name, 100);
		const email = clean(body.email, 254);
		const message = clean(body.message, 1500);
		const audience = String(body.audience ?? "");
		const interest = String(body.interest ?? "");

		if (!consent) return Response.json({ error: "consent_required" }, { status: 400 });
		if (!name || !message) return Response.json({ error: "missing_fields" }, { status: 400 });
		if (!EMAIL_RE.test(email)) return Response.json({ error: "invalid_email" }, { status: 400 });
		if (!AUDIENCE_LABEL[audience]) return Response.json({ error: "invalid_audience" }, { status: 400 });
		if (!VALID_INTERESTS.has(interest)) return Response.json({ error: "invalid_interest" }, { status: 400 });

		const text = [
			`Päringu esitaja: ${AUDIENCE_LABEL[audience]}`,
			`Teema: ${interest}`,
			`Nimi: ${name}`,
			`E-post: ${email}`,
			"",
			"Lühikirjeldus:",
			message || "(kirjeldus puudub)",
			"",
			`IP: ${ip}`,
		].join("\n");

		try {
			await transport.sendMail({
				from: FROM,
				to: TO,
				replyTo: email, // validated above; safe as a header value
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

// Stop accepting work, let accepted sends finish, then release resources.
// A second interrupt is an explicit request to quit without waiting.
const DRAIN_TIMEOUT_MS = 10_000;

async function drain(): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let timedOut = false;
	const deadline = new Promise<void>(resolve => {
		timer = setTimeout(() => {
			timedOut = true;
			resolve();
		}, DRAIN_TIMEOUT_MS);
	});

	// server.stop() waits for in-flight requests; cap that wait so a stuck
	// connection can't keep the container alive past Podman's stop timeout.
	await Promise.race([server.stop(), deadline]);
	clearTimeout(timer);
	if (timedOut) console.warn("Drain timed out; closing remaining connections");

	transport.close();
	console.log("Mailer stopped cleanly");
	process.exit(0);
}

function shutdown(signal: "SIGINT" | "SIGTERM") {
	if (shutdownPromise) {
		console.error(`Received ${signal} again; forcing exit`);
		process.exit(0);
	}

	draining = true;
	console.log(`Received ${signal}; draining in-flight requests...`);

	shutdownPromise = drain().catch(error => {
		console.error("Shutdown failed:", error);
		process.exit(1);
	});
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => shutdown(signal));
}
