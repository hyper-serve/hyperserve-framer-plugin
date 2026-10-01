export const API_BASE_URL: string =
	import.meta.env.VITE_HYPERSERVE_API_URL ?? "https://api.hyperserve.io/api";
export const DASHBOARD_URL: string = import.meta.env.VITE_HYPERSERVE_DASHBOARD_URL ?? "https://hyperserve.io";
export const VIDEO_MODULE_URL = "https://framer.com/m/framer/Video.js";

// Framer's asset docs use srcType + srcFile for uploads, so URL mode is likely
// srcType "URL" + srcUrl. Confirm in Framer (Task 10); this is the only place to change.
export const videoControls = (url: string) => ({ srcType: "URL", srcUrl: url });
export type VideoControls = ReturnType<typeof videoControls>;
export const readVideoUrl = (controls: Record<string, unknown>): string | undefined =>
	typeof controls.srcUrl === "string" ? controls.srcUrl : undefined;
