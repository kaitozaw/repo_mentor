import { useEffect, useState } from "react";
import Chat from "../components/Chat";

const GITHUB_REPO_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git\/?$/;

export default function RepoMentor() {
    const [repoId, setRepoId] = useState(null);
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [repoUrl, setRepoUrl] = useState("");

    const [repoOptions, setRepoOptions] = useState([]);
    const [selectedRepoId, setSelectedRepoId] = useState("");

    // Store chat history per repository (session-based, not persisted)
    const [chatHistories, setChatHistories] = useState({});

    const apiBaseRaw = import.meta.env.VITE_API_BASE_URL;
    const apiBase = apiBaseRaw ? apiBaseRaw.replace(/\/+$/, "") : "";

    const validate = (value) => {
        if (!value || value.trim().length === 0) return "Enter Github URL";
        if (!GITHUB_REPO_REGEX.test(value.trim()))
            return "Enter by the following format: https://github.com/owner/repo.git";
        return "";
    };

    const fetchRepositories = async () => {
        if (!apiBase) return;

        try {
            const res = await fetch(`${apiBase}/repository`);
            if (!res.ok) return;

            const data = await res.json();
            if (Array.isArray(data)) {
                setRepoOptions(data);
            }
        } catch {
        }
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

            // Refresh repository list after successful submission
            await fetchRepositories();

            // Auto-select the newly added repository
            if (newRepoId) {
                setSelectedRepoId(newRepoId);
            }

            // Clear the input
            setRepoUrl("");
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
        fetchRepositories();
    }, [apiBase]);

    const handleSelectRepo = (e) => {
        const newRepoId = e.target.value;
        setSelectedRepoId(newRepoId);

        // Initialize chat history for this repo if it doesn't exist
        if (newRepoId && !chatHistories[newRepoId]) {
            setChatHistories(prev => ({
                ...prev,
                [newRepoId]: []
            }));
        }
    };

    const currentMessages = selectedRepoId ? (chatHistories[selectedRepoId] || []) : [];

    const setCurrentMessages = (messagesOrUpdater) => {
        if (selectedRepoId) {
            setChatHistories(prev => {
                const currentRepoMessages = prev[selectedRepoId] || [];
                const newMessages = typeof messagesOrUpdater === 'function'
                    ? messagesOrUpdater(currentRepoMessages)
                    : messagesOrUpdater;

                return {
                    ...prev,
                    [selectedRepoId]: newMessages
                };
            });
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {!selectedRepoId ? (
                // Center screen - No repository selected
                <div className="flex items-center justify-center min-h-screen p-6">
                    <div className="w-full max-w-md space-y-6">
                        <div className="text-center mb-8">
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">Repo Mentor</h1>
                            <p className="text-sm text-gray-600">Chat with your GitHub repositories</p>
                        </div>

                        {/* Submit New Repository */}
                        <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-gray-800">Add Repository</h2>
                            <form onSubmit={onSubmit} className="space-y-4">
                                <input
                                    type="url"
                                    value={repoUrl}
                                    onChange={(e) => setRepoUrl(e.target.value)}
                                    placeholder="https://github.com/owner/repo.git"
                                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    disabled={loading}
                                    required
                                />
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full rounded-lg px-4 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                                >
                                    {loading ? "Adding Repository..." : "Add Repository"}
                                </button>
                            </form>

                            {error && (
                                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                                    {error}
                                </div>
                            )}
                            {repoId && status && (
                                <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
                                    <div className="font-medium">✓ Repository added successfully</div>
                                    <div className="mt-1 text-xs">
                                        Status: <span className="font-mono">{status}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Select Existing Repository */}
                        {repoOptions.length > 0 && (
                            <div className="bg-white rounded-lg shadow-sm border p-6 space-y-4">
                                <h2 className="text-lg font-semibold text-gray-800">Select Repository</h2>
                                <select
                                    className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    value={selectedRepoId}
                                    onChange={handleSelectRepo}
                                    disabled={loading}
                                >
                                    <option value="">Choose a repository...</option>
                                    {repoOptions.map((id) => (
                                        <option key={id} value={id}>
                                            {id}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                // Full screen chat
                <div className="flex flex-col h-screen">
                    {/* Top bar with repo selector */}
                    <div className="bg-white border-b shadow-sm">
                        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
                            <div className="flex items-center space-x-4 flex-1">
                                <button
                                    onClick={() => setSelectedRepoId("")}
                                    className="text-gray-600 hover:text-gray-900 transition-colors"
                                    title="Back to repository selection"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                <div className="flex-1 max-w-md">
                                    <select
                                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={selectedRepoId}
                                        onChange={handleSelectRepo}
                                    >
                                        {repoOptions.map((id) => (
                                            <option key={id} value={id}>
                                                {id}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Chat content */}
                    <div className="flex-1 overflow-hidden">
                        <div className="max-w-5xl mx-auto h-full">
                            <Chat
                                repoId={selectedRepoId}
                                repoName={selectedRepoId}
                                messages={currentMessages}
                                setMessages={setCurrentMessages}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
