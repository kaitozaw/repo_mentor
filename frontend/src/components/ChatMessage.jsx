import { marked } from "marked";
import { useEffect, useRef, useMemo } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-bash";

marked.setOptions({ breaks: true, gfm: true });

// Helper function to linkify commit hashes
function linkifyCommitHashes(text, repoUrl) {
    if (!text || !repoUrl) return text;
    
    // Extract owner/repo from GitHub URL
    const match = repoUrl.match(/github\.com\/([\w.-]+)\/([\w.-]+)/);
    if (!match) return text;
    
    const owner = match[1];
    const repo = match[2].replace('.git', '');
    
    // Regex to match 7-40 character hex strings (commit hashes)
    // Matches: 12e50e0, 98bb4588, 7a31cd4a9bc01a, etc.
    const commitRegex = /\b([0-9a-f]{7,40})\b/gi;
    
    return text.replace(commitRegex, (fullMatch, hash) => {
        const githubUrl = `https://github.com/${owner}/${repo}/commit/${hash}`;
        return `<a href="${githubUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline hover:text-blue-300 font-mono transition-colors">${hash}</a>`;
    });
}

// Helper function to render chunk ID with clickable commit hashes
function renderChunkId(chunkId, repoUrl) {
    const linkedHtml = linkifyCommitHashes(chunkId, repoUrl);
    return { __html: linkedHtml };
}

// Process markdown and linkify commit hashes
function processMessageContent(message, repoUrl) {
    if (!message) return '';
    
    // First, parse markdown
    let html = marked.parse(message);
    
    // Then linkify commit hashes in text nodes only (not in code blocks or existing links)
    // We need to be careful to only replace in text content, not in HTML tags
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    
    // Function to recursively process text nodes
    function processNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            // Only process text nodes that aren't inside <a>, <code>, or <pre>
            let parent = node.parentElement;
            let shouldProcess = true;
            
            while (parent && parent !== tempDiv) {
                if (parent.tagName === 'A' || parent.tagName === 'PRE' || 
                    (parent.tagName === 'CODE' && parent.parentElement?.tagName === 'PRE')) {
                    shouldProcess = false;
                    break;
                }
                parent = parent.parentElement;
            }
            
            if (shouldProcess && node.textContent) {
                const linkedText = linkifyCommitHashes(node.textContent, repoUrl);
                if (linkedText !== node.textContent) {
                    const span = document.createElement('span');
                    span.innerHTML = linkedText;
                    node.replaceWith(span);
                }
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // Process inline code elements (not in pre blocks)
            if (node.tagName === 'CODE' && node.parentElement?.tagName !== 'PRE') {
                const linkedText = linkifyCommitHashes(node.textContent, repoUrl);
                if (linkedText !== node.textContent) {
                    node.innerHTML = linkedText;
                }
            } else {
                // Recursively process child nodes
                Array.from(node.childNodes).forEach(child => processNode(child));
            }
        }
    }
    
    processNode(tempDiv);
    return tempDiv.innerHTML;
}

export default function ChatMessage({ message, type = "user", timestamp, index = 0, totalMessages = 1, repoUrl = "", retrievedChunks = [] }) {
    const isUser = type === "user";
    const isSystem = type === "system";
    const contentRef = useRef(null);

    // Calculate opacity based on message recency (newer = more visible)
    // Latest message: 100%, oldest: 40%
    const calculateOpacity = () => {
        if (totalMessages <= 1) return 1;
        const position = index / (totalMessages - 1); // 0 (oldest) to 1 (newest)
        return 0.4 + (position * 0.6); // Range from 0.4 to 1.0
    };

    const messageOpacity = calculateOpacity();

    // Process message content with commit links (memoized for performance)
    const processedContent = useMemo(() => {
        if (isUser) return message;
        return processMessageContent(message, repoUrl);
    }, [message, repoUrl, isUser]);

    useEffect(() => {
        if (contentRef.current && !isUser) {
            Prism.highlightAllUnder(contentRef.current);
            
            const codeBlocks = contentRef.current.querySelectorAll("pre code");
            codeBlocks.forEach((block) => {
                const pre = block.parentElement;
                if (!pre.querySelector(".copy-button")) {
                    const button = document.createElement("button");
                    button.className = "copy-button";
                    button.textContent = "Copy";
                    button.onclick = async () => {
                        await navigator.clipboard.writeText(block.textContent);
                        button.textContent = "Copied!";
                        setTimeout(() => button.textContent = "Copy", 2000);
                    };
                    pre.style.position = "relative";
                    pre.appendChild(button);
                }
            });
        }
    }, [processedContent, isUser]);

    const formatTime = (timestamp) => {
        if (!timestamp) return "";
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };

    if (isSystem) {
        return (
            <div className="flex justify-center my-4">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-900 px-4 py-2 rounded-md border border-slate-700">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    {message}
                </div>
            </div>
        );
    }

    return (
        <div 
            className={`group flex gap-3 mb-4 animate-fadeIn ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
        >
            {/* Avatar - GitHub Dark style */}
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border ${
                isUser 
                    ? 'bg-gray-700 border-gray-600' 
                    : 'bg-gray-700 border-gray-600'
            }`}>
                {isUser ? (
                    <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                ) : (
                    <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                        <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
                    </svg>
                )}
            </div>

            {/* Message content */}
            <div className="flex-1 min-w-0 max-w-3xl">
                {/* Header */}
                <div className={`flex items-baseline gap-2 mb-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className={`text-sm font-semibold ${isUser ? 'text-gray-200' : 'text-gray-200'}`}>
                        {isUser ? "You" : "Repo Mentor"}
                    </span>
                    {timestamp && (
                        <span className="text-xs text-gray-500">
                            {formatTime(timestamp)}
                        </span>
                    )}
                </div>

                {/* Message bubble - GitHub Dark style with gradient opacity */}
                <div 
                    className={`rounded-md px-4 py-3 ${
                        isUser 
                            ? 'bg-blue-900 bg-opacity-30 border border-blue-700 message-user' 
                            : 'bg-slate-900 border border-slate-700'
                    }`}
                    style={{ 
                        opacity: messageOpacity,
                        transition: 'opacity 0.3s ease-in-out'
                    }}
                >
                    {isUser ? (
                        <div className="text-sm leading-relaxed prose">
                            {message}
                        </div>
                    ) : (
                        <>
                            <div 
                                ref={contentRef}
                                className="text-sm leading-relaxed prose"
                                dangerouslySetInnerHTML={{ __html: processedContent }}
                            />
                            
                            {/* Retrieved chunks (sources used) */}
                            {retrievedChunks && retrievedChunks.length > 0 && (
                                <details className="mt-3 text-xs">
                                    <summary className="cursor-pointer text-blue-400 hover:text-blue-300 hover:underline transition-all flex items-center gap-1.5 w-fit font-medium select-none">
                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                                        </svg>
                                        <span className="underline decoration-dotted decoration-1 underline-offset-2">
                                            {retrievedChunks.length} source{retrievedChunks.length !== 1 ? 's' : ''} used
                                        </span>
                                        <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </summary>
                                    <div className="mt-2 space-y-2 pl-1">
                                        {retrievedChunks.map((chunk, idx) => (
                                            <div key={idx} className="bg-gray-800 bg-opacity-50 rounded-md p-2 border border-gray-700">
                                                <div 
                                                    className="font-mono text-[10px] text-gray-400 break-all"
                                                    dangerouslySetInnerHTML={renderChunkId(chunk.id, repoUrl)}
                                                />
                                                <div className="text-[11px] mt-1 text-gray-500">
                                                    Similarity: <span className="text-blue-400 font-medium">{(chunk.similarity * 100).toFixed(1)}%</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
