import { useState, useEffect, useRef } from "react";
import ChatMessage from "../components/ChatMessage";
import InputBar from "../components/InputBar";
import { TypingIndicator } from "../components/LoadingIndicator";
import RepoCard from "../components/RepoCard";

const GITHUB_REPO_REGEX = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\.git\/?$/;

export default function RepoMentor() {
    const [phase, setPhase] = useState("submission");
    const [repoUrl, setRepoUrl] = useState("");
    const [repoId, setRepoId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [messages, setMessages] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    
    const chatRef = useRef(null);
    const apiBase = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

    useEffect(() => {
        const saved = localStorage.getItem("currentRepo");
        if (saved) {
            const repo = JSON.parse(saved);
            setRepoId(repo.repoId);
            setRepoUrl(repo.repoUrl);
            setPhase("chat");
            setMessages(JSON.parse(localStorage.getItem("chatHistory") || "[]"));
        }
    }, []);

    useEffect(() => {
        if (messages.length > 0) localStorage.setItem("chatHistory", JSON.stringify(messages));
    }, [messages]);

    useEffect(() => {
        if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }, [messages, chatLoading]);

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
            setRepoId(newRepoId);
            
            localStorage.setItem("currentRepo", JSON.stringify({ repoId: newRepoId, repoUrl: trimmed }));
            
            const welcome = {
                id: Date.now(),
                type: "system",
                content: "Repository loaded successfully! Ask me anything.",
                timestamp: new Date().toISOString()
            };
            
            setMessages([welcome]);
            localStorage.setItem("chatHistory", JSON.stringify([welcome]));
            setPhase("chat");
        } catch (err) {
            setError(err.name === "AbortError" ? "Request timeout" : err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSendMessage = async (message) => {
        const userMsg = {
            id: Date.now(),
            type: "user",
            content: message,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMsg]);
        setChatLoading(true);

        try {
            const res = await fetch(`${apiBase}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message, repo_id: repoId }),
            });

            const data = await res.json();

            const botMsg = {
                id: Date.now() + 1,
                type: "bot",
                content: data?.message || "I couldn't process that request.",
                timestamp: new Date().toISOString()
            };

            setMessages(prev => [...prev, botMsg]);
        } catch (err) {
            const errorMsg = {
                id: Date.now() + 1,
                type: "bot",
                content: `Error: ${err.message}`,
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setChatLoading(false);
        }
    };

    const handleNewRepo = () => {
        if (confirm("Start with a new repository? Current chat will be saved.")) {
            localStorage.removeItem("currentRepo");
            localStorage.removeItem("chatHistory");
            setPhase("submission");
            setRepoUrl("");
            setRepoId(null);
            setMessages([]);
        }
    };

    if (phase === "submission") {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6">
                <div className="w-full max-w-lg">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-800 rounded-full mb-4 border border-gray-700">
                            <svg className="w-8 h-8 text-gray-200" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <h1 className="text-3xl font-semibold text-gray-100 mb-2">Repo Mentor</h1>
                        <p className="text-gray-400 text-base">AI-powered repository intelligence</p>
                    </div>

                    <form onSubmit={handleSubmit} className="bg-gray-900 rounded-lg border border-gray-700 p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-200 mb-2">
                                GitHub Repository URL
                            </label>
                            <input
                                type="url"
                                value={repoUrl}
                                onChange={(e) => setRepoUrl(e.target.value)}
                                placeholder="https://github.com/owner/repo.git"
                                className="w-full px-3 py-2 bg-black border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-100 placeholder-gray-500"
                                disabled={loading}
                                required
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-900 bg-opacity-30 border border-red-700 rounded-md text-sm text-red-400">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 font-medium text-sm transition-colors"
                        >
                            {loading ? "Analyzing..." : "Analyze Repository"}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-black">
            <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
                <div className="max-w-5xl mx-auto">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="text-xl font-semibold text-gray-100">Repo Mentor</h1>
                        <button
                            onClick={handleNewRepo}
                            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 font-medium transition-colors"
                        >
                            New Repository
                        </button>
                    </div>
                    <RepoCard repoUrl={repoUrl} repoId={repoId} />
                </div>
            </header>

            <div ref={chatRef} className="flex-1 overflow-y-auto px-6 py-4">
                <div className="max-w-4xl mx-auto">
                    {messages.map((msg, index) => (
                        <ChatMessage 
                            key={msg.id} 
                            message={msg.content} 
                            type={msg.type} 
                            timestamp={msg.timestamp}
                            index={index}
                            totalMessages={messages.length}
                        />
                    ))}
                    {chatLoading && <TypingIndicator />}
                </div>
            </div>

            <InputBar onSend={handleSendMessage} disabled={chatLoading} />
        </div>
    );
}
