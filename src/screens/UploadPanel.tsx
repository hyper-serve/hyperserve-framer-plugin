import type { HyperserveClient, VideoResolution } from "@hyperserve/hyperserve-js";
import { useEffect, useRef, useState } from "react";
import { DASHBOARD_URL } from "../config";
import { insertVideo } from "../video/canvas";
import { DEFAULT_RESOLUTIONS, type UploadEvent, UPLOAD_RESOLUTIONS, runUpload } from "../upload/uploadFlow";

type Props = {
	client: Pick<HyperserveClient, "createVideo" | "completeUpload" | "getVideoStatus" | "getVideo">;
	onDone(): void;
	onError(error: unknown): void;
};

type ReadyVideo = Extract<UploadEvent, { phase: "ready" }>["video"];

export function UploadPanel({ client, onDone, onError }: Props) {
	const [file, setFile] = useState<File | null>(null);
	const [checked, setChecked] = useState<Set<VideoResolution>>(new Set(DEFAULT_RESOLUTIONS));
	const [event, setEvent] = useState<UploadEvent | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const abortRef = useRef<AbortController | null>(null);

	// Leaving the panel (closing it, or the plugin window) must not let a
	// background poll keep running or call back into an unmounted component.
	useEffect(() => {
		return () => {
			abortRef.current?.abort();
		};
	}, []);

	const resolutions = UPLOAD_RESOLUTIONS.filter((r) => checked.has(r));
	const disabled = file === null || resolutions.length === 0 || submitting;

	const toggle = (resolution: VideoResolution) => {
		setChecked((prev) => {
			const next = new Set(prev);
			if (next.has(resolution)) next.delete(resolution);
			else next.add(resolution);
			return next;
		});
	};

	const upload = async () => {
		if (file === null || resolutions.length === 0) return;
		setSubmitting(true);
		setEvent(null);
		const controller = new AbortController();
		abortRef.current = controller;
		let readyVideo: ReadyVideo | null = null;

		try {
			await runUpload({
				client,
				file,
				resolutions,
				signal: controller.signal,
				onEvent: (next) => {
					if (controller.signal.aborted) return;
					setEvent(next);
					if (next.phase === "ready") readyVideo = next.video;
				},
			});
			if (controller.signal.aborted) return;
			// Insert inside the same try as the upload itself, so a failure here
			// (not just a failure in runUpload) is reported through onError too.
			if (readyVideo !== null) {
				await insertVideo(readyVideo);
				onDone();
			}
		} catch (error) {
			if (controller.signal.aborted) return;
			setEvent(null);
			onError(error);
		} finally {
			if (!controller.signal.aborted) setSubmitting(false);
		}
	};

	return (
		<section className="stack">
			<p>Videos uploaded here are public.</p>
			<label>
				Video file
				<input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
			</label>
			<fieldset className="stack">
				<legend>Resolutions</legend>
				{UPLOAD_RESOLUTIONS.map((resolution) => (
					<label key={resolution}>
						<input type="checkbox" checked={checked.has(resolution)} onChange={() => toggle(resolution)} />
						{resolution}
					</label>
				))}
			</fieldset>
			<button type="button" onClick={() => void upload()} disabled={disabled}>
				Upload
			</button>
			{event?.phase === "uploading" && <progress aria-label="Upload progress" value={event.percent} max={100} />}
			{event?.phase === "processing" && <p>Processing</p>}
			{event?.phase === "failed" && (
				<p>
					Processing failed.{" "}
					<a href={`${DASHBOARD_URL}/videos`} target="_blank" rel="noreferrer">
						Open in dashboard
					</a>
				</p>
			)}
		</section>
	);
}
