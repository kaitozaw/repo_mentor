from typing import Dict, Any
from backend.services.rag.retriever import retrieve_chunks
from backend.services.rag.llm_client import chat as llm_chat


SYSTEM_PROMPT = """You are Repo Mentor, a knowledgeable AI assistant that helps developers understand git repositories through their commit history.

Your goal is to provide clear, informative answers that balance technical detail with accessibility.

RESPONSE RULES:
1. Keep answers CONCISE - 3-5 sentences (about 100-150 words)
2. ALWAYS reference at least one specific commit when relevant to the question
3. Be technical but clear - use proper terminology but explain briefly when needed
4. Focus on WHAT was built, WHY it matters, and HOW it works (high-level)
5. Include specific file names, features, or components when referencing commits
6. Be friendly but professional

STRUCTURE YOUR ANSWERS:
- Start with a direct answer to the question
- Reference specific commits with what they added/changed
- Explain the purpose or impact
- Keep it focused and avoid unnecessary details

GOOD EXAMPLE:
"This repository is a code analysis and refactoring tool built with React and FastAPI. A key commit added a planning system (planner.py) that automatically selects which parts of the codebase need improvement. The backend processes GitHub repositories, extracts commit data with PyDriller, and uses RAG (Retrieval-Augmented Generation) to help developers understand their code history through natural language queries."

AVOID:
- Being too simplistic or dumbing down technical concepts
- Giving vague answers without commit references
- Long walls of text or exhaustive lists
- Overly formal or academic language

## Repository Context for this Question:
{context}
"""


def chat_with_repo(repo_id: str, user_message: str, top_k: int = 5) -> Dict[str, Any]:
    """
    Process a user query about a repository using RAG.

    Args:
        repo_id: Repository identifier
        user_message: User's question/message
        top_k: Number of chunks to retrieve (default: 5)

    Returns:
        Dict containing:
        - message: AI response
        - retrieved_chunks: List of relevant chunks used for context
    """
    try:
        # 1. Retrieve relevant chunks using FAISS
        retrieved_chunks = retrieve_chunks(repo_id, user_message, top_k=top_k)

        # 2. Format context from retrieved chunks
        if retrieved_chunks:
            context_parts = []
            for i, chunk in enumerate(retrieved_chunks, 1):
                context_parts.append(
                    f"[Document {i}] (Similarity: {chunk['similarity']:.3f})\n"
                    f"{chunk['text']}\n"
                )
            context = "\n---\n\n".join(context_parts)
        else:
            context = "No specific context information retrieved for this query."

        # 3. Build the system prompt with context
        system_message = SYSTEM_PROMPT.format(context=context)

        # 4. Create messages for LLM
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message}
        ]

        # 5. Generate response using LLM
        response_content = llm_chat(
            messages=messages,
            model="gpt-4o-mini",
            temperature=0.5,  # Lower temp = faster, more focused responses
            max_tokens=250  # ~100-150 words for concise but informative responses
        )

        # 6. Return response with metadata
        return {
            "message": response_content,
            "retrieved_chunks": [
                {
                    "id": chunk["id"],
                    "similarity": chunk["similarity"],
                    "text": chunk["text"][:200] + "..." if len(chunk["text"]) > 200 else chunk["text"]
                }
                for chunk in retrieved_chunks
            ]
        }

    except Exception as e:
        error_message = str(e)
        if "not found or not indexed" in error_message:
            return {
                "message": f"I couldn't find the repository '{repo_id}'. Please make sure the repository has been ingested and indexed first.",
                "retrieved_chunks": [],
                "error": error_message
            }
        else:
            return {
                "message": "I encountered an error while processing your request. Please try again.",
                "retrieved_chunks": [],
                "error": error_message
            }
