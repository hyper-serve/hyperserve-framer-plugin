import type { ComponentInstanceNode } from "@framer/plugin";
import type { VideoResult } from "@hyperserve/hyperserve-js";
import { switchResolution } from "../video/canvas";
import { readVideoUrl } from "../config";
import { readyResolutions } from "../video/playback";

export function SelectedVideoPanel({ node, video }: { node: ComponentInstanceNode; video: VideoResult }) {
	const options = readyResolutions(video);
	const current = readVideoUrl(node.controls as Record<string, unknown>);

	return (
		<section className="stack">
			<label>
				Resolution
				<select
					aria-label="Resolution"
					value={current}
					onChange={(e) => {
						const pick = options.find((o) => o.url === e.target.value);
						if (pick !== undefined) void switchResolution(node, pick.url);
					}}
				>
					{options.map((o) => (
						<option key={o.resolution} value={o.url}>
							{o.resolution}
						</option>
					))}
				</select>
			</label>
		</section>
	);
}
