export default function LoadingIndicator() {
    return (
        <div className="flex items-center gap-2">
            <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "0ms"}}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "150ms"}}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "300ms"}}></div>
            </div>
        </div>
    );
}

export function TypingIndicator() {
    return (
        <div className="flex gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                </svg>
            </div>
            <div className="flex-1">
                <div className="text-sm font-semibold text-gray-200 mb-1">Repo Mentor</div>
                <div className="bg-slate-900 border border-slate-700 rounded-md px-4 py-3 w-fit">
                    <LoadingIndicator />
                </div>
            </div>
        </div>
    );
}
