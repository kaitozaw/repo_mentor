import { marked } from "marked";
import { useEffect, useRef } from "react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-bash";

marked.setOptions({ breaks: true, gfm: true });

export default function ChatMessage({ message, type = "user", timestamp, index = 0, totalMessages = 1, repoUrl = "" }) {
    const isUser = type === "user";
    const isSystem = type === "system";
    const contentRef = useRef(null);
    
    // Extract GitHub owner/repo from URL
    const getGitHubInfo = (url) => {
        const match = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/);
        if (match) {
            return {
                owner: match[1],
                repo: match[2].replace('.git', '')
            };
        }
        return null;
    };

    // Calculate opacity based on message recency (newer = more visible)
    // Latest message: 100%, oldest: 40%
    const calculateOpacity = () => {
        if (totalMessages <= 1) return 1;
        const position = index / (totalMessages - 1); // 0 (oldest) to 1 (newest)
        return 0.4 + (position * 0.6); // Range from 0.4 to 1.0
    };

    const messageOpacity = calculateOpacity();

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
            
            // Linkify commit IDs
            const githubInfo = getGitHubInfo(repoUrl);
            if (githubInfo) {
                const { owner, repo } = githubInfo;
                
                // Find all text nodes and CODE elements
                const walker = document.createTreeWalker(
                    contentRef.current,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: (node) => {
                            // Skip if parent is already a link or in a pre block
                            if (node.parentElement.tagName === 'A' || 
                                node.parentElement.closest('pre')) {
                                return NodeFilter.FILTER_REJECT;
                            }
                            return NodeFilter.FILTER_ACCEPT;
                        }
                    }
                );
                
                const textNodes = [];
                let node;
                while (node = walker.nextNode()) {
                    textNodes.push(node);
                }
                
                // Also find inline code elements
                const codeElements = contentRef.current.querySelectorAll('code:not(pre code)');
                codeElements.forEach(codeEl => {
                    if (codeEl.childNodes.length === 1 && codeEl.childNodes[0].nodeType === Node.TEXT_NODE) {
                        textNodes.push(codeEl.childNodes[0]);
                    }
                });
                
                // Regex for commit IDs (7-40 character hex strings)
                // Allow them to be preceded/followed by punctuation like () [] {}
                const commitRegex = /([0-9a-f]{7,40})/gi;
                
                textNodes.forEach((textNode) => {
                    const text = textNode.textContent;
                    const matches = [...text.matchAll(commitRegex)];
                    
                    if (matches.length > 0) {
                        const fragment = document.createDocumentFragment();
                        let lastIndex = 0;
                        
                        matches.forEach((match) => {
                            const commitId = match[1];
                            const startIndex = match.index;
                            
                            // Validate it's actually hex (all digits 0-9 or letters a-f)
                            if (!/^[0-9a-f]+$/i.test(commitId)) {
                                return;
                            }
                            
                            // Add text before the commit ID
                            if (startIndex > lastIndex) {
                                fragment.appendChild(document.createTextNode(text.substring(lastIndex, startIndex)));
                            }
                            
                            // Create link for commit ID
                            const link = document.createElement('a');
                            link.href = `https://github.com/${owner}/${repo}/commit/${commitId}`;
                            link.textContent = commitId;
                            link.target = "_blank";
                            link.rel = "noopener noreferrer";
                            link.className = "commit-link";
                            fragment.appendChild(link);
                            
                            lastIndex = startIndex + commitId.length;
                        });
                        
                        // Add remaining text
                        if (lastIndex < text.length) {
                            fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                        }
                        
                        // Only replace if we actually created links
                        if (fragment.childNodes.length > 0) {
                            textNode.parentNode.replaceChild(fragment, textNode);
                        }
                    }
                });
            }
        }
    }, [message, isUser, repoUrl]);

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
                        <div 
                            ref={contentRef}
                            className="text-sm leading-relaxed prose"
                            dangerouslySetInnerHTML={{ __html: marked.parse(message || '') }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
