import { HyperserveValidationError } from "@hyperserve/hyperserve-js";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { UploadEvent } from "../upload/uploadFlow";

const runUpload = vi.fn();
vi.mock("../upload/uploadFlow", async (orig) => ({ ...(await orig<object>()), runUpload }));
const insertVideo = vi.fn();
vi.mock("../video/canvas", () => ({ insertVideo }));

const { UploadPanel } = await import("./UploadPanel");
const file = new File(["x"], "promo.mp4", { type: "video/mp4" });

describe("UploadPanel", () => {
	it("defaults to 720p, allows adding more, says uploads are public, and inserts when ready", async () => {
		runUpload.mockImplementation(async ({ onEvent }) => {
			onEvent({ phase: "uploading", percent: 40 });
			onEvent({ phase: "processing" });
			onEvent({ phase: "ready", video: { id: "v1" } });
		});
		const onDone = vi.fn();
		render(<UploadPanel client={{} as never} onDone={onDone} onError={vi.fn()} />);

		expect(screen.getByText("Videos uploaded here are public.")).toBeInTheDocument();
		expect(screen.getByRole("checkbox", { name: "720p" })).toBeChecked();
		await userEvent.click(screen.getByRole("checkbox", { name: "1080p" }));
		await userEvent.upload(screen.getByLabelText("Video file"), file);
		await userEvent.click(screen.getByRole("button", { name: "Upload" }));

		expect(runUpload).toHaveBeenCalledWith(expect.objectContaining({ file, resolutions: ["720p", "1080p"] }));
		await vi.waitFor(() => expect(insertVideo).toHaveBeenCalledWith({ id: "v1" }));
		expect(onDone).toHaveBeenCalled();
	});

	it("disables Upload when no resolution is selected", async () => {
		render(<UploadPanel client={{} as never} onDone={vi.fn()} onError={vi.fn()} />);
		await userEvent.upload(screen.getByLabelText("Video file"), file);
		await userEvent.click(screen.getByRole("checkbox", { name: "720p" }));
		expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
	});

	it("shows Failed with a dashboard link when transcoding fails, and inserts nothing", async () => {
		insertVideo.mockClear();
		runUpload.mockImplementation(async ({ onEvent }) => onEvent({ phase: "failed", videoId: "v1" }));
		render(<UploadPanel client={{} as never} onDone={vi.fn()} onError={vi.fn()} />);

		await userEvent.upload(screen.getByLabelText("Video file"), file);
		await userEvent.click(screen.getByRole("button", { name: "Upload" }));

		expect(await screen.findByText("Processing failed.")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open in dashboard" })).toBeInTheDocument();
		expect(insertVideo).not.toHaveBeenCalled();
	});

	it("passes plan-limit and revoked errors up to the Library", async () => {
		const error = new HyperserveValidationError("You have exceeded your free tier limits.", 403, { code: "FREE_TIER_EXCEEDED" });
		runUpload.mockRejectedValue(error);
		const onError = vi.fn();
		render(<UploadPanel client={{} as never} onDone={vi.fn()} onError={onError} />);

		await userEvent.upload(screen.getByLabelText("Video file"), file);
		await userEvent.click(screen.getByRole("button", { name: "Upload" }));

		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
	});

	it("aborts the in-flight upload on unmount: no further status polls, and no onError/onDone", async () => {
		const pollStatus = vi.fn();
		let capturedSignal: AbortSignal | undefined;
		runUpload.mockImplementation(
			async ({ signal, onEvent }: { signal: AbortSignal; onEvent: (event: UploadEvent) => void }) => {
				capturedSignal = signal;
				onEvent({ phase: "uploading", percent: 0 });
				onEvent({ phase: "processing" });
				// Keeps "returning processing" until the signal says to stop, like the
				// real poll loop in runUpload.
				while (!signal.aborted) {
					pollStatus();
					await new Promise((resolve) => setTimeout(resolve, 0));
				}
			},
		);
		const onDone = vi.fn();
		const onError = vi.fn();
		const { unmount } = render(<UploadPanel client={{} as never} onDone={onDone} onError={onError} />);

		await userEvent.upload(screen.getByLabelText("Video file"), file);
		await userEvent.click(screen.getByRole("button", { name: "Upload" }));
		await screen.findByText("Processing");
		await vi.waitFor(() => expect(pollStatus.mock.calls.length).toBeGreaterThan(0));

		const callsBeforeUnmount = pollStatus.mock.calls.length;
		unmount();

		expect(capturedSignal?.aborted).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(pollStatus).toHaveBeenCalledTimes(callsBeforeUnmount);
		expect(onDone).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});

	it("passes an insertVideo failure to onError, without calling onDone", async () => {
		insertVideo.mockRejectedValueOnce(new Error("insert failed"));
		runUpload.mockImplementation(async ({ onEvent }) => onEvent({ phase: "ready", video: { id: "v1" } }));
		const onDone = vi.fn();
		const onError = vi.fn();
		render(<UploadPanel client={{} as never} onDone={onDone} onError={onError} />);

		await userEvent.upload(screen.getByLabelText("Video file"), file);
		await userEvent.click(screen.getByRole("button", { name: "Upload" }));

		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)));
		expect(onDone).not.toHaveBeenCalled();
	});

	it("clears the progress state when the upload throws, so no frozen bar is left behind", async () => {
		runUpload.mockImplementation(async ({ onEvent }) => {
			onEvent({ phase: "uploading", percent: 70 });
			throw new Error("boom");
		});
		const onError = vi.fn();
		render(<UploadPanel client={{} as never} onDone={vi.fn()} onError={onError} />);

		await userEvent.upload(screen.getByLabelText("Video file"), file);
		await userEvent.click(screen.getByRole("button", { name: "Upload" }));

		await vi.waitFor(() => expect(onError).toHaveBeenCalled());
		expect(screen.queryByRole("progressbar")).toBeNull();
	});
});
