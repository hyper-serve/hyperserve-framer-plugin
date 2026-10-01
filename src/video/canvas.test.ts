import type { VideoResult } from "@hyperserve/hyperserve-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFramerMock, makeNode } from "../test/framerMock";

const framer = createFramerMock();
vi.mock("@framer/plugin", () => ({
	framer,
	isComponentInstanceNode: (n: { __type?: string } | null) => n?.__type === "ComponentInstanceNode",
}));

const { dragDataFor, hyperserveVideoIdOf, insertVideo, switchResolution, tagDroppedNode, VIDEO_ID_KEY } =
	await import("./canvas");
const { videoControls } = await import("../config");

const ready: VideoResult = {
	id: "v1",
	status: "ready",
	isPublic: true,
	resolutions: {
		"720p": { id: "r1", status: "ready", videoUrl: "https://cdn.test/720p.mp4", thumbnailImageUrls: [] },
	},
};

describe("canvas helpers", () => {
	beforeEach(() => {
		framer.addComponentInstance.mockClear();
		framer.inserted.length = 0;
	});

	it("inserts Framer's Video component with our URL and tags the layer with the video id", async () => {
		await insertVideo(ready);

		expect(framer.addComponentInstance).toHaveBeenCalledWith({
			url: "https://framer.com/m/framer/Video.js",
			attributes: { controls: videoControls("https://cdn.test/720p.mp4") },
		});
		expect(framer.inserted[0].pluginData[VIDEO_ID_KEY]).toBe("v1");
	});

	it("refuses to insert a video with nothing ready", async () => {
		await expect(insertVideo({ ...ready, resolutions: {} })).rejects.toThrow();
		expect(framer.addComponentInstance).not.toHaveBeenCalled();
	});

	it("builds drag data for a ready video and none for an unready one", () => {
		expect(dragDataFor(ready)).toEqual({
			type: "componentInstance",
			url: "https://framer.com/m/framer/Video.js",
			attributes: { controls: videoControls("https://cdn.test/720p.mp4") },
		});
		expect(dragDataFor({ ...ready, resolutions: {} })).toBeNull();
	});

	it("recognises only layers we tagged", async () => {
		expect(await hyperserveVideoIdOf(makeNode({ pluginData: { [VIDEO_ID_KEY]: "v1" } }))).toBe("v1");
		expect(await hyperserveVideoIdOf(makeNode())).toBeNull();
		expect(await hyperserveVideoIdOf({ __type: "FrameNode" })).toBeNull();
		expect(await hyperserveVideoIdOf(null)).toBeNull();
	});

	it("switches a layer's resolution by setting its video source controls", async () => {
		const node = makeNode({ controls: videoControls("https://cdn.test/720p.mp4") });
		await switchResolution(node as never, "https://cdn.test/1080p.mp4");
		expect(node.setAttributes).toHaveBeenCalledWith({ controls: videoControls("https://cdn.test/1080p.mp4") });
	});

	it("tags a successfully dropped layer so it's recognised afterwards", async () => {
		const node = makeNode({ id: "dropped-1" });
		framer.inserted.push(node);

		await tagDroppedNode({ status: "success", nodeId: "dropped-1" }, "v1");

		expect(await hyperserveVideoIdOf(node)).toBe("v1");
	});

	it("does nothing when the drag errored", async () => {
		const node = makeNode({ id: "dropped-2" });
		framer.inserted.push(node);

		await tagDroppedNode({ status: "error", reason: "cancelled" }, "v1");

		expect(await hyperserveVideoIdOf(node)).toBeNull();
	});

	it("does nothing for a node id it can't find", async () => {
		await expect(tagDroppedNode({ status: "success", nodeId: "missing" }, "v1")).resolves.toBeUndefined();
	});
});
