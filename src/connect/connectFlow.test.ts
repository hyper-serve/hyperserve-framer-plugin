import { describe, expect, it, vi } from "vitest";
import { startConnect, waitForApproval, type ConnectSession } from "./connectFlow";

const session: ConnectSession = {
	sessionId: "s1",
	pollSecret: "p".repeat(43),
	userCode: "KXQ-47P",
	connectUrl: "https://hyperserve.io/connect/s1",
	expiresAt: new Date(10_000).toISOString(),
};

const reply = (status: number, body: unknown) =>
	({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const noSleep = async () => {};

describe("startConnect", () => {
	it("creates a Framer session", async () => {
		const fetchFn = vi.fn(async () => reply(201, session));
		await expect(startConnect({ fetch: fetchFn, baseUrl: "https://api.test/api" })).resolves.toEqual(session);

		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://api.test/api/connect/sessions");
		expect(JSON.parse(init.body as string)).toEqual({ integration: "framer" });
	});

	it("throws a readable error when the server refuses", async () => {
		const fetchFn = vi.fn(async () => reply(429, { message: "Too many requests" }));
		await expect(startConnect({ fetch: fetchFn })).rejects.toThrow("Too many requests");
	});
});

describe("waitForApproval", () => {
	it("polls while pending and returns the key once approved", async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(reply(202, { status: "pending" }))
			.mockResolvedValueOnce(reply(202, { status: "pending" }))
			.mockResolvedValueOnce(reply(200, { status: "approved", apiKey: "k" }));

		const result = await waitForApproval(session, {
			signal: new AbortController().signal,
			fetch: fetchFn,
			sleep: noSleep,
			now: () => 0,
		});

		expect(result).toEqual({ kind: "connected", apiKey: "k" });
		expect(fetchFn).toHaveBeenCalledTimes(3);
		const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(init.body as string)).toEqual({ pollSecret: session.pollSecret });
	});

	it("reports denied or expired on 410", async () => {
		const fetchFn = vi.fn(async () => reply(410, { message: "gone" }));
		await expect(
			waitForApproval(session, { signal: new AbortController().signal, fetch: fetchFn, sleep: noSleep, now: () => 0 }),
		).resolves.toEqual({ kind: "denied_or_expired" });
	});

	it("stops at the session's expiry even if the server still says pending", async () => {
		let clock = 0;
		const fetchFn = vi.fn(async () => {
			clock += 4_000;
			return reply(202, { status: "pending" });
		});

		const result = await waitForApproval(session, {
			signal: new AbortController().signal,
			fetch: fetchFn,
			sleep: noSleep,
			now: () => clock,
		});

		expect(result).toEqual({ kind: "denied_or_expired" });
		expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(3);
	});

	it("stops polling immediately when cancelled", async () => {
		const controller = new AbortController();
		const fetchFn = vi.fn(async () => {
			controller.abort();
			return reply(202, { status: "pending" });
		});

		const result = await waitForApproval(session, { signal: controller.signal, fetch: fetchFn, sleep: noSleep, now: () => 0 });

		expect(result).toEqual({ kind: "cancelled" });
		expect(fetchFn).toHaveBeenCalledTimes(1);
	});

	it("keeps polling through a network blip", async () => {
		const fetchFn = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("Failed to fetch"))
			.mockResolvedValueOnce(reply(200, { status: "approved", apiKey: "k" }));

		await expect(
			waitForApproval(session, { signal: new AbortController().signal, fetch: fetchFn, sleep: noSleep, now: () => 0 }),
		).resolves.toEqual({ kind: "connected", apiKey: "k" });
	});

	it("resolves promptly when the real default sleep is aborted mid-wait", async () => {
		vi.useFakeTimers();
		try {
			const controller = new AbortController();
			const fetchFn = vi.fn(async () => reply(202, { status: "pending" }));

			const resultPromise = waitForApproval(session, {
				signal: controller.signal,
				fetch: fetchFn,
				now: () => 0,
			});

			// Let the first poll resolve and the loop reach the real sleep's
			// setTimeout before cancelling. No fake timer is ever advanced:
			// if abort didn't resolve the sleep promptly, this would hang.
			for (let i = 0; i < 5; i++) {
				await Promise.resolve();
			}

			controller.abort();

			await expect(resultPromise).resolves.toEqual({ kind: "cancelled" });
			expect(fetchFn).toHaveBeenCalledTimes(1);
		} finally {
			vi.useRealTimers();
		}
	});
});
