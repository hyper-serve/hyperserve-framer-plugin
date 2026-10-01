import { HyperserveValidationError } from "@hyperserve/hyperserve-js";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DASHBOARD_URL, videoControls } from "../config";
import { createFramerMock, makeNode } from "../test/framerMock";

// Matches VIDEO_ID_KEY in ../video/canvas; a plain import would load that
// module before the hoisted @framer/plugin mock's "framer" is initialised.
const VIDEO_ID_KEY = "hyperserveVideoId";

const framer = createFramerMock();
vi.mock("@framer/plugin", () => ({
	framer,
	isComponentInstanceNode: (n: { __type?: string } | null) => n?.__type === "ComponentInstanceNode",
}));

const client = { listVideos: vi.fn(), getVideo: vi.fn(), getVideoStatus: vi.fn(), createVideo: vi.fn(), completeUpload: vi.fn() };
// A fresh object per call (same underlying spies) so a changed apiKey produces a
// new `client` reference, the way the real makeClient(apiKey) would; this lets a
// test exercise the "key changed mid-flight" race (see the stale-response test).
vi.mock("../api/client", () => ({ makeClient: () => ({ ...client }) }));

const { LibraryScreen } = await import("./LibraryScreen");

const listed = (id: string, status: "ready" | "processing" | "fail") => ({
	id,
	fileName: `${id}.mp4`,
	createdAt: "2026-09-27T10:00:00Z",
	status,
	isPublic: true,
	durationSeconds: 10,
	width: 1280,
	height: 720,
	previewThumbnailUrl: `https://cdn.test/${id}.jpg`,
});

describe("LibraryScreen", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		client.listVideos.mockResolvedValue({ data: [listed("a", "ready"), listed("b", "processing")], total: 2, page: 1, limit: 20 });
		client.getVideo.mockResolvedValue({
			id: "a",
			status: "ready",
			isPublic: true,
			resolutions: { "720p": { id: "r", status: "ready", videoUrl: "https://cdn.test/a-720p.mp4", thumbnailImageUrls: [] } },
		});
	});

	it("lists public videos newest first with their status", async () => {
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);

		expect(await screen.findByText("a.mp4")).toBeInTheDocument();
		expect(screen.getByText("Processing")).toBeInTheDocument();
		expect(client.listVideos).toHaveBeenCalledWith({ visibility: "public", page: 1, limit: 20 });
	});

	it("inserts a ready video on click, fetching its playback links first", async () => {
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);

		await userEvent.click(await screen.findByRole("button", { name: "Insert a.mp4" }));

		expect(client.getVideo).toHaveBeenCalledWith("a");
		expect(framer.addComponentInstance).toHaveBeenCalledWith(
			expect.objectContaining({ attributes: { controls: videoControls("https://cdn.test/a-720p.mp4") } }),
		);
	});

	it("doesn't offer to insert a video that is still processing", async () => {
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);
		await screen.findByText("b.mp4");
		expect(screen.queryByRole("button", { name: "Insert b.mp4" })).toBeNull();
	});

	it("shows the empty state", async () => {
		client.listVideos.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);
		expect(await screen.findByText("No public videos yet. Upload one.")).toBeInTheDocument();
	});

	it("hides the empty-library message while a banner is showing", async () => {
		client.listVideos.mockRejectedValue(new TypeError("Failed to fetch"));
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);

		await screen.findByText("Can't reach Hyperserve. Check your connection.");
		expect(screen.queryByText("No public videos yet. Upload one.")).toBeNull();
	});

	it("sends the user back to Connect exactly once when the key has been revoked", async () => {
		client.listVideos.mockRejectedValue(new HyperserveValidationError("Forbidden resource", 403, {}));
		const onDisconnected = vi.fn();
		render(<LibraryScreen apiKey="k" onDisconnected={onDisconnected} overridden={false} onUseDifferentAccount={vi.fn()} />);

		await waitFor(() => expect(onDisconnected).toHaveBeenCalledWith("Your connection was removed. Connect again."));
		expect(onDisconnected).toHaveBeenCalledTimes(1);
	});

	it("disconnects on request and points to where the key can be revoked", async () => {
		const onDisconnected = vi.fn();
		render(<LibraryScreen apiKey="k" onDisconnected={onDisconnected} overridden={false} onUseDifferentAccount={vi.fn()} />);

		const link = await screen.findByRole("link", { name: "Revoke the key on the API keys page" });
		expect(link).toHaveAttribute("href", `${DASHBOARD_URL}/api-keys`);

		await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
		expect(onDisconnected).toHaveBeenCalledWith();
	});

	it("offers to load more while more videos exist on the server, and fetches the next page", async () => {
		client.listVideos.mockResolvedValueOnce({ data: [listed("a", "ready")], total: 2, page: 1, limit: 1 });
		client.listVideos.mockResolvedValueOnce({ data: [listed("b", "processing")], total: 2, page: 2, limit: 1 });
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);

		await screen.findByText("a.mp4");
		expect(screen.queryByText("b.mp4")).toBeNull();

		await userEvent.click(screen.getByRole("button", { name: "Load more" }));

		expect(await screen.findByText("b.mp4")).toBeInTheDocument();
		expect(client.listVideos).toHaveBeenLastCalledWith({ visibility: "public", page: 2, limit: 20 });
		expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
	});

	it("retrying after a load-more failure restarts the list from page 1, not the failed page", async () => {
		client.listVideos.mockResolvedValueOnce({ data: [listed("a", "ready")], total: 3, page: 1, limit: 1 });
		client.listVideos.mockResolvedValueOnce({ data: [listed("b", "processing")], total: 3, page: 2, limit: 1 });
		client.listVideos.mockRejectedValueOnce(new TypeError("Failed to fetch"));
		client.listVideos.mockResolvedValueOnce({ data: [listed("a", "ready")], total: 1, page: 1, limit: 20 });

		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);
		await screen.findByText("a.mp4");

		await userEvent.click(screen.getByRole("button", { name: "Load more" }));
		await screen.findByText("b.mp4");

		await userEvent.click(screen.getByRole("button", { name: "Load more" }));
		await screen.findByRole("button", { name: "Retry" });

		await userEvent.click(screen.getByRole("button", { name: "Retry" }));

		await waitFor(() => expect(client.listVideos).toHaveBeenLastCalledWith({ visibility: "public", page: 1, limit: 20 }));
	});

	it("ignores a stale list response that resolves after a newer one (key changed mid-flight)", async () => {
		let resolveFirst: (value: { data: ReturnType<typeof listed>[]; total: number; page: number; limit: number }) => void =
			() => {};
		client.listVideos.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveFirst = resolve;
				}),
		);
		client.listVideos.mockResolvedValueOnce({ data: [listed("b", "ready")], total: 1, page: 1, limit: 20 });

		const { rerender } = render(<LibraryScreen apiKey="k1" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);
		rerender(<LibraryScreen apiKey="k2" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);

		expect(await screen.findByText("b.mp4")).toBeInTheDocument();

		await act(async () => {
			resolveFirst({ data: [listed("a", "ready")], total: 1, page: 1, limit: 20 });
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(screen.queryByText("a.mp4")).toBeNull();
		expect(screen.getByText("b.mp4")).toBeInTheDocument();
	});

	it("shows no panel and doesn't crash when the selected layer is a video the plugin didn't insert", async () => {
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);
		await screen.findByText("a.mp4");

		await act(async () => {
			framer.select([makeNode({ pluginData: {} })]);
			await Promise.resolve();
		});

		expect(screen.queryByRole("combobox", { name: "Resolution" })).toBeNull();
		expect(client.getVideo).not.toHaveBeenCalled();
	});

	it("renders the selected video panel above the grid for a layer the plugin tagged", async () => {
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);
		await screen.findByText("a.mp4");

		await act(async () => {
			framer.select([makeNode({ pluginData: { [VIDEO_ID_KEY]: "a" } })]);
			await Promise.resolve();
		});

		expect(await screen.findByRole("combobox", { name: "Resolution" })).toBeInTheDocument();
		expect(client.getVideo).toHaveBeenCalledWith("a");
	});

	it("shows a retry banner when the network is unreachable, and retries on click", async () => {
		client.listVideos.mockRejectedValueOnce(new TypeError("Failed to fetch"));
		client.listVideos.mockResolvedValueOnce({ data: [listed("a", "ready")], total: 1, page: 1, limit: 20 });
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);

		expect(await screen.findByText("Can't reach Hyperserve. Check your connection.")).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "Retry" }));

		expect(await screen.findByText("a.mp4")).toBeInTheDocument();
	});

	it("shows the server's own message in the limit banner, with a billing link", async () => {
		client.listVideos.mockRejectedValue(
			new HyperserveValidationError("You have exceeded your free tier limits.", 403, { code: "FREE_TIER_EXCEEDED" }),
		);
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);

		expect(await screen.findByText("You have exceeded your free tier limits.")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Manage billing" })).toHaveAttribute("href", `${DASHBOARD_URL}/billing`);
	});

	it("shows the server's own message for an inactive subscription too", async () => {
		client.listVideos.mockRejectedValue(
			new HyperserveValidationError("Your subscription is inactive.", 403, { code: "INACTIVE_SUBSCRIPTION" }),
		);
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);

		expect(await screen.findByText("Your subscription is inactive.")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Manage billing" })).toHaveAttribute("href", `${DASHBOARD_URL}/billing`);
	});

	it("toggles the upload panel from the header", async () => {
		render(<LibraryScreen apiKey="k" onDisconnected={vi.fn()} overridden={false} onUseDifferentAccount={vi.fn()} />);
		await screen.findByText("a.mp4");

		expect(screen.queryByText("Videos uploaded here are public.")).toBeNull();
		const toggle = screen.getByRole("button", { name: "Upload" });
		await userEvent.click(toggle);
		expect(screen.getByText("Videos uploaded here are public.")).toBeInTheDocument();

		await userEvent.click(toggle);
		expect(screen.queryByText("Videos uploaded here are public.")).toBeNull();
	});

	it("offers a different account for this project", async () => {
		const onUseDifferentAccount = vi.fn();
		render(<LibraryScreen apiKey="k" overridden={false} onDisconnected={vi.fn()} onUseDifferentAccount={onUseDifferentAccount} />);

		await userEvent.click(await screen.findByRole("button", { name: "Use a different account for this project" }));
		expect(onUseDifferentAccount).toHaveBeenCalled();
	});

	it("says when this project uses its own account", async () => {
		render(<LibraryScreen apiKey="k" overridden onDisconnected={vi.fn()} onUseDifferentAccount={vi.fn()} />);
		expect(await screen.findByText("This project uses its own Hyperserve account.")).toBeInTheDocument();
	});
});
