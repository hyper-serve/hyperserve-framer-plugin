import { type ComponentInstanceNode, framer } from "@framer/plugin";
import { useEffect, useState } from "react";
import { hyperserveVideoIdOf } from "../video/canvas";

export function useSelectedHyperserveVideo() {
	const [selected, setSelected] = useState<{ node: ComponentInstanceNode; videoId: string } | null>(null);

	useEffect(() => {
		let disposed = false;
		let requestId = 0;

		const unsubscribe = framer.subscribeToSelection(async (nodes) => {
			const thisRequest = ++requestId;
			if (nodes.length !== 1) {
				setSelected(null);
				return;
			}
			const videoId = await hyperserveVideoIdOf(nodes[0]);
			// A newer selection may have resolved first, or the hook may have
			// unmounted, while this lookup was in flight; don't let it win.
			if (disposed || thisRequest !== requestId) return;
			setSelected(videoId === null ? null : { node: nodes[0] as ComponentInstanceNode, videoId });
		});

		return () => {
			disposed = true;
			unsubscribe();
		};
	}, []);

	return selected;
}
