import { API_BASE_URL } from "../config";

export type ConnectSession = {
	sessionId: string;
	pollSecret: string;
	userCode: string;
	connectUrl: string;
	expiresAt: string;
};

export type ConnectResult =
	| { kind: "connected"; apiKey: string }
	| { kind: "denied_or_expired" }
	| { kind: "cancelled" };

const sleepFor = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		const timer = setTimeout(resolve, ms);
		signal.addEventListener("abort", () => {
			clearTimeout(timer);
			resolve();
		});
	});

export async function startConnect(deps: { fetch?: typeof fetch; baseUrl?: string } = {}) {
	const fetchFn = deps.fetch ?? fetch;
	const res = await fetchFn(`${deps.baseUrl ?? API_BASE_URL}/connect/sessions`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ integration: "framer" }),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.message ?? "Couldn't start connecting. Try again.");
	return body as ConnectSession;
}

export async function waitForApproval(
	session: ConnectSession,
	deps: {
		signal: AbortSignal;
		fetch?: typeof fetch;
		baseUrl?: string;
		intervalMs?: number;
		now?: () => number;
		sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
	},
): Promise<ConnectResult> {
	const fetchFn = deps.fetch ?? fetch;
	const now = deps.now ?? Date.now;
	const sleep = deps.sleep ?? sleepFor;
	const expiresAt = Date.parse(session.expiresAt);
	const url = `${deps.baseUrl ?? API_BASE_URL}/connect/sessions/${session.sessionId}/claim`;

	while (!deps.signal.aborted) {
		if (now() >= expiresAt) return { kind: "denied_or_expired" };

		try {
			const res = await fetchFn(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pollSecret: session.pollSecret }),
			});
			if (deps.signal.aborted) break;
			if (res.status === 200) {
				const body = await res.json();
				return { kind: "connected", apiKey: body.apiKey };
			}
			if (res.status === 410 || res.status === 404) return { kind: "denied_or_expired" };
		} catch {
			// A dropped request while polling: try again next tick.
		}

		await sleep(deps.intervalMs ?? 2_000, deps.signal);
	}
	return { kind: "cancelled" };
}
