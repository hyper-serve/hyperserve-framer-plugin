import type { VideoResult } from "@hyperserve/hyperserve-js";
import { describe, expect, it } from "vitest";
import { pickPlaybackResolution, readyResolutions } from "./playback";

const res = (status: "ready" | "processing" | "fail", name: string) => ({
	id: name,
	status,
	videoUrl: `https://cdn.test/${name}.mp4`,
	thumbnailImageUrls: [],
});

const video = (resolutions: VideoResult["resolutions"]): VideoResult => ({
	id: "v1",
	status: "ready",
	isPublic: true,
	resolutions,
});

describe("pickPlaybackResolution", () => {
	it("picks the highest ready resolution at or below 1080p", () => {
		const v = video({ "480p": res("ready", "480p"), "1080p": res("ready", "1080p"), "4k": res("ready", "4k") });
		expect(pickPlaybackResolution(v)?.resolution).toBe("1080p");
	});

	it("skips resolutions that aren't ready", () => {
		const v = video({ "720p": res("ready", "720p"), "1080p": res("processing", "1080p") });
		expect(pickPlaybackResolution(v)?.resolution).toBe("720p");
	});

	it("falls back to the lowest ready resolution above 1080p when that's all there is", () => {
		const v = video({ "4k": res("ready", "4k"), "1440p": res("ready", "1440p") });
		expect(pickPlaybackResolution(v)?.resolution).toBe("1440p");
	});

	it("returns null when nothing is ready", () => {
		expect(pickPlaybackResolution(video({ "720p": res("fail", "720p") }))).toBeNull();
	});
});

describe("readyResolutions", () => {
	it("lists ready resolutions low to high", () => {
		const v = video({ "1080p": res("ready", "1080p"), "360p": res("ready", "360p"), "720p": res("fail", "720p") });
		expect(readyResolutions(v).map((r) => r.resolution)).toEqual(["360p", "1080p"]);
	});
});
