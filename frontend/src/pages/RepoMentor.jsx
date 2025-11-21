import { useEffect, useState } from "react";

const GITHUB_REPO_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git\/?$/;

export default function RepoMentor() {
    const [repoId, setRepoId] = useState(null);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [repoUrl, setRepoUrl] = useState("");

    const [repoOptions, setRepoOptions] = useState([]);
    const [selectedExistingRepoId, setSelectedExistingRepoId] = useState("");

    const apiBaseRaw = import.meta.env.VITE_API_BASE_URL;
    const apiBase = apiBaseRaw ? apiBaseRaw.replace(/\/+$/, "") : "";

    const validate = (value) => {
        if (!value || value.trim().length === 0) return "Enter Github URL";
        if (!GITHUB_REPO_REGEX.test(value.trim()))
            return "Enter by the following format: https://github.com/owner/repo.git";
        return "";
    };

    const onSubmit = async (e) => {
        e.preventDefault();
        setRepoId("");
        setStatus(null);
        setError("");

        const v = validate(repoUrl);
        if (v) {
            setError(v);
            return;
        }
        if (!apiBase) {
            setError("Unable to connect to the server. Please try again.");
            return;
        }

        setLoading(true);
        let ctrl;
        let timer; 

        try {
            const payload = { repo_url: repoUrl.trim() };

            ctrl = new AbortController();
            timer = setTimeout(() => ctrl.abort(), 20000);

            const res = await fetch(`${apiBase}/repository`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
                signal: ctrl.signal,
            });

            const isJson = res.headers.get("content-type")?.includes("application/json");
            const data = isJson ? await res.json() : null;

            if (!res.ok) {
                const msg = data?.error?.message || `Server Error (HTTP ${res.status})`;
                throw new Error(msg);
            }
            const newRepoId = data?.repo_id || null;
            setRepoId(newRepoId);
            setStatus("accepted");
        } catch (err) {
            setError(err.name === "AbortError" ? "The request took too long. Please try again later." : "Something went wrong. Please try again.");
        } finally {
            if (timer) clearTimeout(timer);
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!repoId || !apiBase) return;

        let cancelled = false;
        let intervalId;

        const fetchStatus = async () => {
            if (cancelled) return;
            try {
                const res = await fetch(`${apiBase}/repository/${repoId}`);
                if (!res.ok) return;

                const data = await res.json();
                const nextStatus = data?.status || "unknown";
                if (cancelled) return;
                setStatus(nextStatus);
                if (nextStatus === "completed" || nextStatus === "failed") {
                    if (intervalId) clearInterval(intervalId);
                }
            } catch {
            }
        };

        fetchStatus();
        intervalId = setInterval(fetchStatus, 3000);

        return () => {
            cancelled = true;
            if (intervalId) clearInterval(intervalId);
        };
    }, [repoId, apiBase]);

    useEffect(() => {
        if (!apiBase) return;

        let cancelled = false;

        const fetchRepositories = async () => {
            try {
                const res = await fetch(`${apiBase}/repository`);
                if (!res.ok) return;

                const data = await res.json();
                if (!cancelled && Array.isArray(data)) {
                    setRepoOptions(data);
                }
            } catch {
            }
        };

        fetchRepositories();

        return () => {
            cancelled = true;
        };
    }, [apiBase]);

    const handleSelectExistingRepo = (e) => {
        setSelectedExistingRepoId(e.target.value);
    };

    return (
        <div className="mx-auto max-w-xl p-6">
            <h1 className="text-2xl font-semibold mb-4">Submit GitHub Repository</h1>
            <form onSubmit={onSubmit} className="space-y-4">
                <label className="block">
                    <span className="block text-sm font-medium mb-1">GitHub Repo URL</span>
                    <input
                        type="url"
                        value={repoUrl}
                        onChange={(e) => setRepoUrl(e.target.value)}
                        placeholder="https://github.com/owner/repo.git"
                        className="w-full rounded border px-3 py-2"
                        disabled={loading}
                        required
                    />
                </label>
                <button
                    type="submit"
                    disabled={loading}
                    className={`rounded px-4 py-2 text-white ${loading ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700"}`}
                >
                    {loading ? "Submitting…" : "Submit"}
                </button>
            </form>
            {error && (
                <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                </div>
            )}
            {repoId && (
                <div className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
                    <div className="font-medium">Repository accepted</div>
                    <div className="mt-1">
                        <span className="font-mono">repo_id:</span>{" "}
                        <span className="font-mono">{repoId}</span>
                    </div>
                    {status && (
                        <div className="mt-1">
                            <span className="font-mono">status:</span>{" "}
                            <span className="font-mono">{status}</span>
                        </div>
                    )}
                </div>
            )}
            {repoOptions.length > 0 && (
                <div className="mt-6">
                    <label className="block text-sm font-medium mb-1">
                        Or ask questions about existing repositories!
                    </label>
                    <select
                        className="w-full rounded border px-3 py-2"
                        value={selectedExistingRepoId}
                        onChange={handleSelectExistingRepo}
                        disabled={loading}
                    >
                        <option value="">Select a repository…</option>
                        {repoOptions.map((id) => (
                            <option key={id} value={id}>
                                {id}
                            </option>
                        ))}
                    </select>
                </div>
            )}
        </div>
    );
}