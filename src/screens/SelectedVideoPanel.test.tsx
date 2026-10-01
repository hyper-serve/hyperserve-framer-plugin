import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { videoControls } from "../config";
import { makeNode } from "../test/framerMock";

vi.mock("@framer/plugin", () => ({ framer: {}, isComponentInstanceNode: () => true }));
const { SelectedVideoPanel } = await import("./SelectedVideoPanel");

const video = {
	id: "v1",
	status: "ready" as const,
	isPublic: true,
	resolutions: {
		"720p": { id: "r1", status: "ready" as const, videoUrl: "https://cdn/720p.mp4", thumbnailImageUrls: [] },
		"1080p": { id: "r2", status: "ready" as const, videoUrl: "https://cdn/1080p.mp4", thumbnailImageUrls: [] },
	},
};

describe("SelectedVideoPanel", () => {
	it("shows the current resolution and switches the layer's url", async () => {
		const node = makeNode({ controls: videoControls("https://cdn/720p.mp4") });
		render(<SelectedVideoPanel node={node as never} video={video} />);

		expect(screen.getByRole("combobox", { name: "Resolution" })).toHaveValue("https://cdn/720p.mp4");
		await userEvent.selectOptions(screen.getByRole("combobox", { name: "Resolution" }), "1080p");

		expect(node.setAttributes).toHaveBeenCalledWith({ controls: videoControls("https://cdn/1080p.mp4") });
	});
});
