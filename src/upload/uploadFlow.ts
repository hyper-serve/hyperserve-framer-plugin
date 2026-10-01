import type { HyperserveClient, VideoResolution, VideoResult } from "@hyperserve/hyperserve-js";
import { putVideoToStorage } from "@hyperserve/hyperserve-js/browser";
import { toPluginError } from "../api/errors";

export const UPLOAD_RESOLUTIONS: VideoResolution[] = [
	"360p",
	"480p",
	"720p",
	"1080p",
	"1440p",
	"4k",
];
export const DEFAULT_RESOLUTIONS: VideoResolution[] = ["720p"];
const POLL_MS = 5_000;

export type UploadEvent =
	| { phase: "uploading"; percent: number }
	| { phase: "processing" }
	| { phase: "ready"; video: VideoResult }
	| { phase: "failed"; videoId: string };

export async function runUpload(input: {
	client: Pick<HyperserveClient, "createVideo" | "completeUpload" | "getVideoStatus" | "getVideo">;
	file: File;
	resolutions: VideoResolution[];
	onEvent: (event: UploadEvent) => void;
	signal: AbortSignal;
	put?: typeof putVideoToStorage;
	sleep?: (ms: number) => Promise<void>;
}): Promise<void> {
	const { client, file, onEvent, signal } = input;
	const put = input.put ?? putVideoToStorage;
	const sleep = input.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
	const [first, ...rest] = input.resolutions;
	if (first === undefined) throw new Error("Pick at least one resolution");

	// Always public: a private link expires and would break on a published site.
	const created = await client.createVideo({
		filename: file.name,
		resolutions: [first, ...rest],
		isPublic: true,
	});

	onEvent({ phase: "uploading", percent: 0 });
	await put({
		uploadUrl: created.uploadUrl,
		contentType: created.contentType,
		file,
		onProgress: (percent: number) => onEvent({ phase: "uploading", percent }),
	});
	await client.completeUpload(created.id);
	onEvent({ phase: "processing" });

	while (!signal.aborted) {
		await sleep(POLL_MS);
		if (signal.aborted) return;

		let status: Awaited<ReturnType<typeof client.getVideoStatus>>;
		try {
			status = await client.getVideoStatus(created.id);
		} catch (error) {
			// Processing can take minutes; one dropped status poll must not fail the
			// upload. Any other error (a revoked key, for instance) still surfaces.
			if (toPluginError(error).kind === "network") continue;
			throw error;
		}

		if (status.status === "fail") {
			onEvent({ phase: "failed", videoId: created.id });
			return;
		}
		if (status.status === "ready") {
			onEvent({ phase: "ready", video: await client.getVideo(created.id) });
			return;
		}
	}
}
