import type { VideoResult } from "@hyperserve/hyperserve-js";
import { type ComponentInstanceNode, framer, isComponentInstanceNode } from "@framer/plugin";
import { VIDEO_MODULE_URL, videoControls } from "../config";
import { pickPlaybackResolution } from "./playback";

export const VIDEO_ID_KEY = "hyperserveVideoId";

export const dragDataFor = (video: VideoResult) => {
	const pick = pickPlaybackResolution(video);
	if (pick === null) return null;
	return {
		type: "componentInstance" as const,
		url: VIDEO_MODULE_URL,
		attributes: { controls: videoControls(pick.url) },
	};
};

export const insertVideo = async (video: VideoResult) => {
	const data = dragDataFor(video);
	if (data === null) throw new Error("This video has no ready resolution yet.");
	const node = await framer.addComponentInstance({ url: data.url, attributes: data.attributes });
	await node.setPluginData(VIDEO_ID_KEY, video.id);
};

export const hyperserveVideoIdOf = async (node: unknown) => {
	if (!isComponentInstanceNode(node)) return null;
	return node.getPluginData(VIDEO_ID_KEY);
};

export const switchResolution = async (node: ComponentInstanceNode, url: string) => {
	await node.setAttributes({ controls: videoControls(url) });
};
