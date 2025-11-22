import { useState, useEffect, useRef } from "react";
import ChatMessage from "../components/ChatMessage";
import InputBar from "../components/InputBar";
import { TypingIndicator } from "../components/LoadingIndicator";

const GITHUB_REPO_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git\/?$/;

export default function RepoMentor() {
    const [phase, setPhase] = useState("selection"); // selection, progress, chat
    const [repoUrl, setRepoUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [repoStatus, setRepoStatus] = useState(null);
    
    // Repository selection
    const [repoOptions, setRepoOptions] = useState([]);
    const [selectedRepoId, setSelectedRepoId] = useState("");
    const [repoUrls, setRepoUrls] = useState({}); // Map repo IDs to URLs
    
    // Chat per repository
    const [chatHistories, setChatHistories] = useState({});
    const [chatLoading, setChatLoading] = useState(false);
    
    const chatRef = useRef(null);
    const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

    // Fetch available repositories on mount
    useEffect(() => {
        fetchRepositories();
    }, [apiBase]);

    const fetchRepositories = async () => {
        if (!apiBase) return;

        try {
            const res = await fetch(`${apiBase}/repository`);
            if (!res.ok) return;

            const data = await res.json();
            if (Array.isArray(data)) {
                setRepoOptions(data);
            }
        } catch (err) {
            console.error("Failed to fetch repositories:", err);
        }
    };

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
    }, [chatHistories, chatLoading, selectedRepoId]);

    // Poll repository status when in progress phase
    useEffect(() => {
        if (phase !== "progress" || !selectedRepoId || !apiBase) return;

        let cancelled = false;
        let intervalId;

        const checkStatus = async () => {
            if (cancelled) return;
            
            try {
                const res = await fetch(`${apiBase}/repository/${selectedRepoId}`);
                if (!res.ok) return;

                const data = await res.json();
                const status = data?.status || "unknown";
                
                if (cancelled) return;
                setRepoStatus(status);

                if (status === "completed") {
                    clearInterval(intervalId);
                    
                    // Initialize chat for this repo
                    if (!chatHistories[selectedRepoId]) {
                        setChatHistories(prev => ({
                            ...prev,
                            [selectedRepoId]: [{
                                id: Date.now(),
                                type: "system",
                                content: "Repository loaded successfully! Ask me anything.",
                                timestamp: new Date().toISOString()
                            }]
                        }));
                    }
                    
                    setPhase("chat");
                } else if (status === "failed") {
                    clearInterval(intervalId);
                    setError("Repository analysis failed. Please try again.");
                    setPhase("selection");
                    setSelectedRepoId("");
                }
            } catch (err) {
                console.error("Status check error:", err);
            }
        };

        checkStatus();
        intervalId = setInterval(checkStatus, 2000);

        return () => {
            cancelled = true;
            if (intervalId) clearInterval(intervalId);
        };
    }, [phase, selectedRepoId, apiBase, chatHistories]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = repoUrl.trim();
        
        if (!trimmed) return setError("Enter GitHub URL");
        if (!GITHUB_REPO_REGEX.test(trimmed)) return setError("Invalid format. Use: https://github.com/owner/repo.git");
        if (!apiBase) return setError("Unable to connect to server");

        setLoading(true);
        setError(null);

        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 60000);
            
            const res = await fetch(`${apiBase}/repository`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ repo_url: trimmed }),
                signal: ctrl.signal,
            });

            clearTimeout(timer);
            const data = await res.json();

            if (!res.ok) throw new Error(data?.error || "Server error");

            const newRepoId = data?.repo_id || "unknown";
            setSelectedRepoId(newRepoId);
            setRepoStatus("processing");
            
            // Store the URL for this repo ID
            setRepoUrls(prev => ({
                ...prev,
                [newRepoId]: trimmed
            }));
            
            setRepoUrl("");
            
            // Refresh repo list
            await fetchRepositories();
            
            // Move to progress phase
            setPhase("progress");
        } catch (err) {
            setError(err.name === "AbortError" ? "Request timeout" : err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectRepo = (repoId) => {
        setSelectedRepoId(repoId);
        
        // Initialize chat history for this repo if it doesn't exist
        if (!chatHistories[repoId]) {
            setChatHistories(prev => ({
                ...prev,
                [repoId]: []
            }));
        }
        
        setPhase("chat");
    };

    const handleSendMessage = async (message) => {
        const currentMessages = chatHistories[selectedRepoId] || [];
        
        const userMsg = {
            id: Date.now(),
            type: "user",
            content: message,
            timestamp: new Date().toISOString()
        };

        setChatHistories(prev => ({
            ...prev,
            [selectedRepoId]: [...currentMessages, userMsg]
        }));
        
        setChatLoading(true);

        try {
            const res = await fetch(`${apiBase}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message, repo_id: selectedRepoId }),
            });

            const data = await res.json();

            const botMsg = {
                id: Date.now() + 1,
                type: "bot",
                content: data?.message || "I couldn't process that request.",
                timestamp: new Date().toISOString()
            };

            setChatHistories(prev => ({
                ...prev,
                [selectedRepoId]: [...prev[selectedRepoId], botMsg]
            }));
        } catch (err) {
            const errorMsg = {
                id: Date.now() + 1,
                type: "bot",
                content: `Error: ${err.message}`,
                timestamp: new Date().toISOString()
            };
            
            setChatHistories(prev => ({
                ...prev,
                [selectedRepoId]: [...prev[selectedRepoId], errorMsg]
            }));
        } finally {
            setChatLoading(false);
        }
    };

    const handleBackToSelection = () => {
        setPhase("selection");
        setSelectedRepoId("");
    };

    // Progress Page
    if (phase === "progress") {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6">
                <div className="w-full max-w-lg text-center">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-800 rounded-full mb-6 border border-gray-700 animate-pulse">
                        <svg className="w-10 h-10 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                    
                    <h2 className="text-2xl font-semibold text-gray-100 mb-3">
                        Analyzing Repository
                    </h2>
                    <p className="text-gray-400 mb-6">
                        Repo Mentor is analyzing your repository...
                    </p>
                    
                    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 mb-4">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-gray-300">Status:</span>
                            <span className="text-sm font-mono text-blue-400 capitalize">
                                {repoStatus || "processing"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-300">Repository:</span>
                            <span className="text-sm font-mono text-gray-400 truncate max-w-xs">
                                {selectedRepoId}
                            </span>
                        </div>
                    </div>

                    <div className="flex gap-2 justify-center">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: "0ms"}}></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: "150ms"}}></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: "300ms"}}></div>
                    </div>
                    
                    <p className="text-xs text-gray-500 mt-6">
                        This may take a few moments depending on repository size
                    </p>
                </div>
            </div>
        );
    }

    // Selection Page
    if (phase === "selection") {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6">
                <div className="w-full max-w-lg space-y-6">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-800 rounded-full mb-4 border border-gray-700">
                            <svg className="w-8 h-8 text-gray-200" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <h1 className="text-3xl font-semibold text-gray-100 mb-2">Repo Mentor</h1>
                        <p className="text-gray-400 text-base">AI-powered repository intelligence</p>
                    </div>

                    {/* Add New Repository */}
                    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 space-y-4">
                        <h2 className="text-lg font-semibold text-gray-200">Add Repository</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input
                                type="url"
                                value={repoUrl}
                                onChange={(e) => setRepoUrl(e.target.value)}
                                placeholder="https://github.com/owner/repo.git"
                                className="w-full px-3 py-2 bg-black border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-100 placeholder-gray-500"
                                disabled={loading}
                                required
                            />
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 font-medium text-sm transition-colors"
                            >
                                {loading ? "Adding Repository..." : "Add Repository"}
                            </button>
                        </form>

                        {error && (
                            <div className="p-3 bg-red-900 bg-opacity-30 border border-red-700 rounded-md text-sm text-red-400">
                                {error}
                            </div>
                        )}
                    </div>

                    {/* Select Existing Repository */}
                    {repoOptions.length > 0 && (
                        <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 space-y-4">
                            <h2 className="text-lg font-semibold text-gray-200">Select Repository</h2>
                            <div className="space-y-2">
                                {repoOptions.map((id) => (
                                    <button
                                        key={id}
                                        onClick={() => handleSelectRepo(id)}
                                        className="w-full text-left px-4 py-3 bg-gray-800 hover:bg-gray-750 border border-gray-700 rounded-md text-sm text-gray-200 transition-colors flex items-center justify-between group"
                                    >
                                        <span className="font-mono text-sm">{id}</span>
                                        <svg className="w-5 h-5 text-gray-500 group-hover:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Chat Page
    const currentMessages = chatHistories[selectedRepoId] || [];

    return (
        <div className="flex flex-col h-screen bg-black">
            <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
                <div className="max-w-5xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleBackToSelection}
                            className="text-gray-400 hover:text-gray-200 transition-colors"
                            title="Back to repository selection"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <div>
                            <h1 className="text-lg font-semibold text-gray-100">Repo Mentor</h1>
                            <p className="text-xs text-gray-400 font-mono">{selectedRepoId}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleBackToSelection}
                        className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 font-medium transition-colors"
                    >
                        Change Repository
                    </button>
                </div>
            </header>

            <div ref={chatRef} className="flex-1 overflow-y-auto px-6 py-4">
                <div className="max-w-4xl mx-auto">
                    {currentMessages.map((msg, index) => (
                        <ChatMessage 
                            key={msg.id} 
                            message={msg.content} 
                            type={msg.type} 
                            timestamp={msg.timestamp}
                            index={index}
                            totalMessages={currentMessages.length}
                            repoUrl={repoUrls[selectedRepoId] || ""}
                        />
                    ))}
                    {chatLoading && <TypingIndicator />}
                </div>
            </div>

            <InputBar onSend={handleSendMessage} disabled={chatLoading} />
        </div>
    );
}
