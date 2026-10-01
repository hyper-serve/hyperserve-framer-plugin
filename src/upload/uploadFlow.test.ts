import { HyperserveValidationError } from "@hyperserve/hyperserve-js";
import { describe, expect, it, vi } from "vitest";
import { runUpload, type UploadEvent } from "./uploadFlow";

const file = new File(["x"], "promo.mp4", { type: "video/mp4" });
const readyVideo = {
	id: "v1",
	status: "ready" as const,
	isPublic: true,
	resolutions: {
		"720p": {
			id: "r",
			status: "ready" as const,
			videoUrl: "https://cdn/720p.mp4",
			thumbnailImageUrls: [],
		},
	},
};

const makeClient = (statuses: string[]) => ({
	createVideo: vi.fn(async () => ({
		id: "v1",
		uploadUrl: "https://b2/put",
		contentType: "video/mp4",
		isPublic: true,
		resolutions: {},
	})),
	completeUpload: vi.fn(async () => ({ id: "v1", isPublic: true, resolutions: {} })),
	getVideoStatus: vi.fn(async () => ({
		id: "v1",
		fileName: "promo.mp4",
		status: statuses.shift() ?? "ready",
		isPublic: true,
		resolutions: {},
	})),
	getVideo: vi.fn(async () => readyVideo),
});

describe("runUpload", () => {
	it("creates a public video, uploads with progress, completes, polls, then reports ready", async () => {
		const client = makeClient(["processing", "ready"]);
		const events: UploadEvent[] = [];
		const put = vi.fn(async ({ onProgress }: { onProgress?: (p: number) => void }) => {
			onProgress?.(50);
			onProgress?.(100);
		});

		await runUpload({
			client: client as never,
			file,
			resolutions: ["720p", "1080p"],
			onEvent: (e) => events.push(e),
			signal: new AbortController().signal,
			put: put as never,
			sleep: async () => {},
		});

		expect(client.createVideo).toHaveBeenCalledWith({
			filename: "promo.mp4",
			resolutions: ["720p", "1080p"],
			isPublic: true,
		});
		expect(put).toHaveBeenCalledWith(
			expect.objectContaining({ uploadUrl: "https://b2/put", contentType: "video/mp4", file }),
		);
		expect(client.completeUpload).toHaveBeenCalledWith("v1");
		expect(events).toEqual([
			{ phase: "uploading", percent: 0 },
			{ phase: "uploading", percent: 50 },
			{ phase: "uploading", percent: 100 },
			{ phase: "processing" },
			{ phase: "ready", video: readyVideo },
		]);
	});

	it("reports failed, and never fetches playback URLs, when transcoding fails", async () => {
		const client = makeClient(["processing", "fail"]);
		const events: UploadEvent[] = [];

		await runUpload({
			client: client as never,
			file,
			resolutions: ["720p"],
			onEvent: (e) => events.push(e),
			signal: new AbortController().signal,
			put: vi.fn(async () => {}) as never,
			sleep: async () => {},
		});

		expect(events.at(-1)).toEqual({ phase: "failed", videoId: "v1" });
		expect(client.getVideo).not.toHaveBeenCalled();
	});

	it("refuses an empty resolution list before calling the server", async () => {
		const client = makeClient([]);
		await expect(
			runUpload({
				client: client as never,
				file,
				resolutions: [],
				onEvent: () => {},
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("Pick at least one resolution");
		expect(client.createVideo).not.toHaveBeenCalled();
	});

	it("stops polling when cancelled", async () => {
		const client = makeClient(["processing", "processing", "processing"]);
		const controller = new AbortController();
		const events: UploadEvent[] = [];

		await runUpload({
			client: client as never,
			file,
			resolutions: ["720p"],
			onEvent: (e) => {
				events.push(e);
				if (e.phase === "processing") controller.abort();
			},
			signal: controller.signal,
			put: vi.fn(async () => {}) as never,
			sleep: async () => {},
		});

		expect(client.getVideoStatus).toHaveBeenCalledTimes(0);
	});

	it("keeps polling past a dropped status request and ends in ready", async () => {
		const client = {
			createVideo: vi.fn(async () => ({
				id: "v1",
				uploadUrl: "https://b2/put",
				contentType: "video/mp4",
				isPublic: true,
				resolutions: {},
			})),
			completeUpload: vi.fn(async () => ({ id: "v1", isPublic: true, resolutions: {} })),
			getVideoStatus: vi
				.fn()
				.mockRejectedValueOnce(new TypeError("Failed to fetch"))
				.mockResolvedValueOnce({
					id: "v1",
					fileName: "promo.mp4",
					status: "ready",
					isPublic: true,
					resolutions: {},
				}),
			getVideo: vi.fn(async () => readyVideo),
		};
		const events: UploadEvent[] = [];

		await runUpload({
			client: client as never,
			file,
			resolutions: ["720p"],
			onEvent: (e) => events.push(e),
			signal: new AbortController().signal,
			put: vi.fn(async () => {}) as never,
			sleep: async () => {},
		});

		expect(client.getVideoStatus).toHaveBeenCalledTimes(2);
		expect(events.at(-1)).toEqual({ phase: "ready", video: readyVideo });
	});

	it("rejects when a status poll fails for a reason other than a dropped request", async () => {
		const forbidden = new HyperserveValidationError("Forbidden resource", 403, {});
		const client = {
			createVideo: vi.fn(async () => ({
				id: "v1",
				uploadUrl: "https://b2/put",
				contentType: "video/mp4",
				isPublic: true,
				resolutions: {},
			})),
			completeUpload: vi.fn(async () => ({ id: "v1", isPublic: true, resolutions: {} })),
			getVideoStatus: vi.fn().mockRejectedValueOnce(forbidden),
			getVideo: vi.fn(async () => readyVideo),
		};

		await expect(
			runUpload({
				client: client as never,
				file,
				resolutions: ["720p"],
				onEvent: () => {},
				signal: new AbortController().signal,
				put: vi.fn(async () => {}) as never,
				sleep: async () => {},
			}),
		).rejects.toBe(forbidden);
		expect(client.getVideo).not.toHaveBeenCalled();
	});
});
