import { framer } from "@framer/plugin";
import { useEffect, useState } from "react";
import "./styles.css";
import { keyStore } from "./keyStore";
import { ConnectScreen } from "./screens/ConnectScreen";
import { LibraryScreen } from "./screens/LibraryScreen";

// Framer's getProjectInfo id is unavailable without this fallback (permission
// denied, or the call fails); treat every project as this one shared project
// rather than failing to find a stored key at all.
const FALLBACK_PROJECT_ID = "default";

type Mode = "library" | "connect-default" | "connect-project";

export function App() {
	const [ready, setReady] = useState(false);
	const [projectId, setProjectId] = useState(FALLBACK_PROJECT_ID);
	const [integrationUserId, setIntegrationUserId] = useState<string | undefined>(undefined);
	const [mode, setMode] = useState<Mode>("connect-default");
	const [apiKey, setApiKey] = useState<string | null>(null);
	const [notice, setNotice] = useState<string>();

	useEffect(() => {
		let cancelled = false;

		const loadProjectId = async () => {
			try {
				return (await framer.getProjectInfo()).id;
			} catch {
				return FALLBACK_PROJECT_ID;
			}
		};
		const loadIntegrationUserId = async () => {
			try {
				return (await framer.getCurrentUser()).id;
			} catch {
				return undefined;
			}
		};

		Promise.all([loadProjectId(), loadIntegrationUserId()]).then(([resolvedProjectId, resolvedIntegrationUserId]) => {
			if (cancelled) return;
			setProjectId(resolvedProjectId);
			setIntegrationUserId(resolvedIntegrationUserId);
			const key = keyStore.keyFor(resolvedProjectId);
			setApiKey(key);
			setMode(key === null ? "connect-default" : "library");
			setReady(true);
		});

		return () => {
			cancelled = true;
		};
	}, []);

	if (!ready) return null;

	if (mode === "library" && apiKey !== null) {
		return (
			<LibraryScreen
				apiKey={apiKey}
				overridden={keyStore.isOverridden(projectId)}
				onUseDifferentAccount={() => setMode("connect-project")}
				onDisconnected={(reason) => {
					keyStore.disconnect(projectId);
					setApiKey(null);
					setNotice(reason);
					setMode("connect-default");
				}}
			/>
		);
	}

	return (
		<ConnectScreen
			notice={notice}
			integrationUserId={integrationUserId}
			heading={mode === "connect-project" ? "Connect a different account for this project" : undefined}
			onCancel={mode === "connect-project" ? () => setMode("library") : undefined}
			onConnected={(key) => {
				keyStore.connect(projectId, key, mode === "connect-project" ? "project" : "default");
				setNotice(undefined);
				setApiKey(key);
				setMode("library");
			}}
		/>
	);
}
