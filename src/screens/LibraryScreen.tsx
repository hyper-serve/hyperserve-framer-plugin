import type { ListedVideo, VideoResult } from "@hyperserve/hyperserve-js";
import { framer } from "@framer/plugin";
import { useEffect, useMemo, useRef, useState } from "react";
import { makeClient } from "../api/client";
import { toPluginError } from "../api/errors";
import { DASHBOARD_URL, VIDEO_MODULE_URL } from "../config";
import { useSelectedHyperserveVideo } from "../hooks/useSelectedHyperserveVideo";
import { dragDataFor, insertVideo, tagDroppedNode } from "../video/canvas";
import { SelectedVideoPanel } from "./SelectedVideoPanel";
import { UploadPanel } from "./UploadPanel";

type Props = {
	apiKey: string;
	overridden: boolean;
	onDisconnected(notice?: string): void;
	onUseDifferentAccount(): void;
};

type Banner = { kind: "limit"; message: string } | { kind: "network" } | { kind: "unknown"; message: string };

const PAGE_SIZE = 20;
const FALLBACK_DRAG_DATA = { type: "componentInstance" as const, url: VIDEO_MODULE_URL };

const STATUS_LABEL: Record<ListedVideo["status"], string> = {
	pending_upload: "Processing",
	processing: "Processing",
	ready: "Ready",
	fail: "Failed",
};

export function LibraryScreen({ apiKey, overridden, onDisconnected, onUseDifferentAccount }: Props) {
	const client = useMemo(() => makeClient(apiKey), [apiKey]);
	const [videos, setVideos] = useState<ListedVideo[]>([]);
	const [total, setTotal] = useState(0);
	const [page, setPage] = useState(1);
	const [loading, setLoading] = useState(true);
	const [banner, setBanner] = useState<Banner | null>(null);
	const [showUpload, setShowUpload] = useState(false);
	const [selectedVideo, setSelectedVideo] = useState<VideoResult | null>(null);

	const cacheRef = useRef<Record<string, VideoResult>>({});
	const elementsRef = useRef<Record<string, HTMLElement>>({});
	const draggableRef = useRef<Set<string>>(new Set());
	const loadRequestRef = useRef(0);

	const selection = useSelectedHyperserveVideo();

	const handleError = (error: unknown) => {
		const mapped = toPluginError(error);
		if (mapped.kind === "revoked") {
			onDisconnected("Your connection was removed. Connect again.");
			return;
		}
		if (mapped.kind === "limit") {
			setBanner({ kind: "limit", message: mapped.message });
			return;
		}
		if (mapped.kind === "network") {
			setBanner({ kind: "network" });
			return;
		}
		setBanner({ kind: "unknown", message: mapped.kind === "unknown" ? mapped.message : "Something went wrong. Try again." });
	};

	const load = async (nextPage: number, append: boolean) => {
		const requestId = ++loadRequestRef.current;
		setLoading(true);
		try {
			const result = await client.listVideos({ visibility: "public", page: nextPage, limit: PAGE_SIZE });
			// A newer load may have started and already finished while this one
			// was in flight; don't let a late, stale response overwrite it.
			if (requestId !== loadRequestRef.current) return;
			setVideos((prev) => (append ? [...prev, ...result.data] : result.data));
			setTotal(result.total);
			setPage(result.page);
			setBanner(null);
		} catch (error) {
			if (requestId !== loadRequestRef.current) return;
			handleError(error);
		} finally {
			if (requestId === loadRequestRef.current) setLoading(false);
		}
	};

	// Reload from the top whenever the key (and so the client) changes; load
	// is recreated every render and would otherwise cause a reload loop.
	// biome-ignore lint/correctness/useExhaustiveDependencies: load is stable enough for this effect's purpose
	useEffect(() => {
		void load(1, false);
	}, [client]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: handleError is recreated every render and would otherwise cause a reload loop
	useEffect(() => {
		if (selection === null) {
			setSelectedVideo(null);
			return;
		}
		let cancelled = false;
		client
			.getVideo(selection.videoId)
			.then((video) => {
				if (!cancelled) setSelectedVideo(video);
			})
			.catch((error) => {
				if (cancelled) return;
				// A layer tagged by a collaborator with a video from an account we
				// can't see, or one since deleted: drop the panel quietly rather
				// than alarming the user or disconnecting them over it.
				if (toPluginError(error).kind === "not_found") {
					setSelectedVideo(null);
					return;
				}
				handleError(error);
			});
		return () => {
			cancelled = true;
		};
	}, [selection, client]);

	const registerDraggable = (id: string) => {
		if (draggableRef.current.has(id)) return;
		const el = elementsRef.current[id];
		if (el === undefined) return;
		draggableRef.current.add(id);
		framer.makeDraggable(
			el,
			() => {
				const cached = cacheRef.current[id];
				return (cached !== undefined ? dragDataFor(cached) : null) ?? FALLBACK_DRAG_DATA;
			},
			(result) => void tagDroppedNode(result, id),
		);
	};

	const cacheVideo = async (id: string): Promise<VideoResult> => {
		const cached = cacheRef.current[id];
		if (cached !== undefined) return cached;
		const video = await client.getVideo(id);
		cacheRef.current[id] = video;
		registerDraggable(id);
		return video;
	};

	// Hover-fetch is best effort and warms the cache for click-to-insert and
	// drag-to-insert; a real failure surfaces when the user actually clicks.
	const warm = (id: string) => {
		void cacheVideo(id).catch(() => {});
	};

	const insert = async (listed: ListedVideo) => {
		if (!framer.isAllowedTo("addComponentInstance")) {
			await framer.notify("You can't edit this project.", { variant: "error" });
			return;
		}
		try {
			const video = await cacheVideo(listed.id);
			await insertVideo(video);
			await framer.notify("Video inserted", { variant: "success" });
		} catch (error) {
			handleError(error);
		}
	};

	const canLoadMore = videos.length < total;

	return (
		<main className="stack">
			<header className="stack">
				<h1>Hyperserve</h1>
				<nav aria-label="Account" className="stack">
					<button type="button" onClick={() => setShowUpload((v) => !v)}>
						Upload
					</button>
					<button type="button" className="secondary" onClick={() => onDisconnected()}>
						Disconnect
					</button>
					<a href={`${DASHBOARD_URL}/api-keys`} target="_blank" rel="noreferrer">
						Revoke the key on the API keys page
					</a>
					{overridden && <p>This project uses its own Hyperserve account.</p>}
					<button type="button" className="link" onClick={onUseDifferentAccount}>
						Use a different account for this project
					</button>
				</nav>
			</header>

			{showUpload && (
				<UploadPanel
					client={client}
					onDone={() => {
						setShowUpload(false);
						void load(1, false);
					}}
					onError={handleError}
				/>
			)}

			{banner?.kind === "limit" && (
				<p role="alert">
					{banner.message}{" "}
					<a href={`${DASHBOARD_URL}/billing`} target="_blank" rel="noreferrer">
						Manage billing
					</a>
				</p>
			)}
			{banner?.kind === "network" && (
				<p role="alert">
					Can't reach Hyperserve. Check your connection.{" "}
					<button type="button" onClick={() => void load(1, false)}>
						Retry
					</button>
				</p>
			)}
			{banner?.kind === "unknown" && <p role="alert">{banner.message}</p>}

			{selection !== null && selectedVideo !== null && (
				// Keyed by the node, not the video id: two different layers can
				// reference the same video, and each must get its own panel state
				// (the chosen resolution) rather than reusing a stale instance.
				<SelectedVideoPanel key={selection.node.id} node={selection.node} video={selectedVideo} />
			)}

			{!loading && videos.length === 0 && banner === null ? (
				<p>No public videos yet. Upload one.</p>
			) : (
				<div className="grid">
					{videos.map((listed) => (
						<div key={listed.id} className="card">
							{listed.status === "ready" ? (
								<button
									type="button"
									aria-label={`Insert ${listed.fileName}`}
									ref={(el) => {
										if (el !== null) {
											elementsRef.current[listed.id] = el;
											if (cacheRef.current[listed.id] !== undefined) registerDraggable(listed.id);
										}
									}}
									onMouseEnter={() => warm(listed.id)}
									onClick={() => void insert(listed)}
								>
									<img src={listed.previewThumbnailUrl} alt="" />
									<span>{listed.fileName}</span>
									<span className="badge">{STATUS_LABEL[listed.status]}</span>
								</button>
							) : (
								<div>
									<img src={listed.previewThumbnailUrl} alt="" />
									<span>{listed.fileName}</span>
									<span className="badge">{STATUS_LABEL[listed.status]}</span>
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{canLoadMore && (
				<button type="button" disabled={loading} onClick={() => void load(page + 1, true)}>
					Load more
				</button>
			)}
		</main>
	);
}
