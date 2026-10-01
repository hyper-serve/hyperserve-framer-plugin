import type { ComponentInstanceNode } from "@framer/plugin";
import type { VideoResult } from "@hyperserve/hyperserve-js";
import { useState } from "react";
import { switchResolution } from "../video/canvas";
import { readVideoUrl } from "../config";
import { readyResolutions } from "../video/playback";

export function SelectedVideoPanel({ node, video }: { node: ComponentInstanceNode; video: VideoResult }) {
	const options = readyResolutions(video);
	// Local state, not a value derived fresh from node.controls every render:
	// Framer doesn't always re-emit the selection after setAttributes, so a
	// derived value would snap the select back to the node's last-known url.
	const [value, setValue] = useState(() => readVideoUrl(node.controls as Record<string, unknown>) ?? "");

	return (
		<section className="stack">
			<label>
				Resolution
				<select
					aria-label="Resolution"
					value={value}
					onChange={(e) => {
						const pick = options.find((o) => o.url === e.target.value);
						if (pick !== undefined) {
							setValue(pick.url);
							void switchResolution(node, pick.url);
						}
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
