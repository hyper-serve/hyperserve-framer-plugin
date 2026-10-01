import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const startConnect = vi.fn();
const waitForApproval = vi.fn();
vi.mock("../connect/connectFlow", () => ({ startConnect, waitForApproval }));

const { ConnectScreen } = await import("./ConnectScreen");

const session = {
	sessionId: "s1",
	pollSecret: "p",
	userCode: "KXQ-47P",
	connectUrl: "https://hyperserve.io/connect/s1",
	expiresAt: new Date(Date.now() + 600_000).toISOString(),
};

describe("ConnectScreen", () => {
	beforeEach(() => {
		startConnect.mockReset().mockResolvedValue(session);
		waitForApproval.mockReset();
		vi.spyOn(window, "open").mockReturnValue(null);
	});

	it("opens the connect page, shows the code, and hands over the key on approval", async () => {
		waitForApproval.mockResolvedValue({ kind: "connected", apiKey: "k" });
		const onConnected = vi.fn();
		render(<ConnectScreen onConnected={onConnected} />);

		await userEvent.click(screen.getByRole("button", { name: "Connect Hyperserve" }));

		expect(window.open).toHaveBeenCalledWith(session.connectUrl, "hyperserve-connect", expect.any(String));
		expect(await screen.findByText("KXQ-47P")).toBeInTheDocument();
		await vi.waitFor(() => expect(onConnected).toHaveBeenCalledWith("k"));
	});

	it("offers to try again when the request is denied or expires", async () => {
		waitForApproval.mockResolvedValue({ kind: "denied_or_expired" });
		render(<ConnectScreen onConnected={vi.fn()} />);

		await userEvent.click(screen.getByRole("button", { name: "Connect Hyperserve" }));

		expect(await screen.findByText("The connection wasn't approved in time. Try again.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Connect Hyperserve" })).toBeInTheDocument();
	});

	it("cancels waiting", async () => {
		waitForApproval.mockImplementation(
			(_s, { signal }: { signal: AbortSignal }) =>
				new Promise((resolve) => signal.addEventListener("abort", () => resolve({ kind: "cancelled" }))),
		);
		render(<ConnectScreen onConnected={vi.fn()} />);

		await userEvent.click(screen.getByRole("button", { name: "Connect Hyperserve" }));
		await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

		expect(await screen.findByRole("button", { name: "Connect Hyperserve" })).toBeInTheDocument();
	});

	it("links to the approval page in case the popup was blocked", async () => {
		waitForApproval.mockImplementation(
			(_s, { signal }: { signal: AbortSignal }) =>
				new Promise((resolve) => signal.addEventListener("abort", () => resolve({ kind: "cancelled" }))),
		);
		render(<ConnectScreen onConnected={vi.fn()} />);

		await userEvent.click(screen.getByRole("button", { name: "Connect Hyperserve" }));

		const link = await screen.findByRole("link", { name: "Open the approval page" });
		expect(link).toHaveAttribute("href", session.connectUrl);
	});

	it("accepts a pasted API key as the fallback", async () => {
		const onConnected = vi.fn();
		render(<ConnectScreen onConnected={onConnected} />);

		await userEvent.click(screen.getByRole("button", { name: "Use an API key instead" }));
		await userEvent.type(screen.getByLabelText("API key"), "  pasted-key  ");
		await userEvent.click(screen.getByRole("button", { name: "Save key" }));

		expect(onConnected).toHaveBeenCalledWith("pasted-key");
	});

	it("shows why the user was sent back here", () => {
		render(<ConnectScreen onConnected={vi.fn()} notice="Your connection was removed. Connect again." />);
		expect(screen.getByText("Your connection was removed. Connect again.")).toBeInTheDocument();
	});

	it("offers a way back when the caller gives one, and uses it", async () => {
		const onCancel = vi.fn();
		render(<ConnectScreen onConnected={vi.fn()} onCancel={onCancel} />);

		await userEvent.click(screen.getByRole("button", { name: "Back" }));
		expect(onCancel).toHaveBeenCalled();
	});

	it("has no way back when the caller gives none", () => {
		render(<ConnectScreen onConnected={vi.fn()} />);
		expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
	});

	it("masks the pasted API key", async () => {
		render(<ConnectScreen onConnected={vi.fn()} />);
		await userEvent.click(screen.getByRole("button", { name: "Use an API key instead" }));
		expect(screen.getByLabelText("API key")).toHaveAttribute("type", "password");
	});

	it("maps a network failure starting the connection to a readable message", async () => {
		startConnect.mockRejectedValue(new TypeError("Failed to fetch"));
		render(<ConnectScreen onConnected={vi.fn()} />);

		await userEvent.click(screen.getByRole("button", { name: "Connect Hyperserve" }));

		expect(await screen.findByText("Can't reach Hyperserve. Check your connection.")).toBeInTheDocument();
	});

	it("aborts the claim poll when the screen unmounts", async () => {
		let capturedSignal: AbortSignal | undefined;
		waitForApproval.mockImplementation((_s, { signal }: { signal: AbortSignal }) => {
			capturedSignal = signal;
			return new Promise(() => {});
		});
		const { unmount } = render(<ConnectScreen onConnected={vi.fn()} />);

		await userEvent.click(screen.getByRole("button", { name: "Connect Hyperserve" }));
		await screen.findByRole("button", { name: "Cancel" });

		unmount();

		expect(capturedSignal?.aborted).toBe(true);
	});
});
