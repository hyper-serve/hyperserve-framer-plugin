import { useRef, useState } from "react";
import { DASHBOARD_URL } from "../config";
import { type ConnectSession, startConnect, waitForApproval } from "../connect/connectFlow";

type Props = { onConnected(apiKey: string): void; notice?: string };

export function ConnectScreen({ onConnected, notice }: Props) {
	const [waiting, setWaiting] = useState<ConnectSession | null>(null);
	const [message, setMessage] = useState<string | undefined>(notice);
	const [pasting, setPasting] = useState(false);
	const [pasted, setPasted] = useState("");
	const abort = useRef<AbortController | null>(null);

	const connect = async () => {
		setMessage(undefined);
		try {
			const session = await startConnect();
			// May be blocked by the browser since it runs after an await; the
			// waiting view also renders a link so the user can always get there.
			window.open(session.connectUrl, "hyperserve-connect", "width=480,height=720");
			setWaiting(session);
			abort.current = new AbortController();
			const result = await waitForApproval(session, { signal: abort.current.signal });
			if (result.kind === "connected") {
				// The parent swaps this screen out on success, so there's no local
				// state left to reset back to the start view.
				onConnected(result.apiKey);
				return;
			}
			setWaiting(null);
			if (result.kind === "denied_or_expired") setMessage("The connection wasn't approved in time. Try again.");
		} catch (error) {
			setWaiting(null);
			setMessage(error instanceof Error ? error.message : "Couldn't connect. Try again.");
		}
	};

	if (waiting !== null) {
		return (
			<main className="stack">
				<p>Approve the connection in the browser window that opened.</p>
				<p>Check this code matches:</p>
				<p className="code">{waiting.userCode}</p>
				<a href={waiting.connectUrl} target="_blank" rel="noreferrer">
					Open the approval page
				</a>
				<button type="button" className="secondary" onClick={() => abort.current?.abort()}>
					Cancel
				</button>
			</main>
		);
	}

	return (
		<main className="stack">
			<h1>Hyperserve</h1>
			<p>Upload videos or pick ones you already host, and place them on your page.</p>
			{message !== undefined && <p role="status">{message}</p>}
			<button type="button" onClick={connect}>
				Connect Hyperserve
			</button>
			<p className="muted">
				No account? The window that opens lets you sign up.{" "}
				<a href={DASHBOARD_URL} target="_blank" rel="noreferrer">
					hyperserve.io
				</a>
			</p>
			{pasting ? (
				<form
					className="stack"
					onSubmit={(e) => {
						e.preventDefault();
						if (pasted.trim() !== "") onConnected(pasted.trim());
					}}
				>
					<label>
						API key
						<input value={pasted} onChange={(e) => setPasted(e.target.value)} autoComplete="off" />
					</label>
					<button type="submit">Save key</button>
				</form>
			) : (
				<button type="button" className="link" onClick={() => setPasting(true)}>
					Use an API key instead
				</button>
			)}
		</main>
	);
}
