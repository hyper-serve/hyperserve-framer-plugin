import { type ComponentInstanceNode, framer } from "@framer/plugin";
import { useEffect, useState } from "react";
import { hyperserveVideoIdOf } from "../video/canvas";

export function useSelectedHyperserveVideo() {
	const [selected, setSelected] = useState<{ node: ComponentInstanceNode; videoId: string } | null>(null);

	useEffect(
		() =>
			framer.subscribeToSelection(async (nodes) => {
				if (nodes.length !== 1) return setSelected(null);
				const videoId = await hyperserveVideoIdOf(nodes[0]);
				setSelected(videoId === null ? null : { node: nodes[0] as ComponentInstanceNode, videoId });
			}),
		[],
	);

	return selected;
}
