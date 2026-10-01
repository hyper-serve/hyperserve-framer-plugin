import type { VideoResolution, VideoResult } from "@hyperserve/hyperserve-js";

const ORDER: VideoResolution[] = ["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "4k", "8k"];
const CAP = ORDER.indexOf("1080p");

export const readyResolutions = (video: VideoResult) =>
	ORDER.flatMap((resolution) => {
		const r = video.resolutions[resolution];
		return r?.status === "ready" ? [{ resolution, url: r.videoUrl }] : [];
	});

// Sites rarely need more than 1080p and the bandwidth counts against the plan.
export const pickPlaybackResolution = (video: VideoResult) => {
	const ready = readyResolutions(video);
	const capped = ready.filter((r) => ORDER.indexOf(r.resolution) <= CAP);
	return capped.at(-1) ?? ready[0] ?? null;
};
