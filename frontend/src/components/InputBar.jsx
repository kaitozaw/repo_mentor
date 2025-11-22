import { useState } from "react";

export default function InputBar({ onSend, disabled = false }) {
    const [input, setInput] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim() && !disabled) {
            onSend(input.trim());
            setInput("");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="border-t border-gray-800 bg-gray-900 p-4">
            <div className="max-w-4xl mx-auto flex gap-2">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit(e);
                        }
                    }}
                    placeholder="Ask about this repository..."
                    disabled={disabled}
                    rows={1}
                    className="flex-1 px-4 py-3 bg-gray-800 border-2 border-gray-600 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:bg-gray-700 disabled:bg-gray-800 text-sm text-gray-100 placeholder-gray-400"
                    style={{ minHeight: '48px', maxHeight: '120px' }}
                />
                <button
                    type="submit"
                    disabled={disabled || !input.trim()}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                >
                    Send
                </button>
            </div>
        </form>
    );
}
