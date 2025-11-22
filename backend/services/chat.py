from typing import Dict, Any, AsyncGenerator
from backend.services.rag.retriever import retrieve_chunks
from backend.services.rag.llm_client import chat as llm_chat, chat_stream as llm_chat_stream
from backend.services.rag.prompt import build_chat_prompt


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
        system_message = build_chat_prompt(context)

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
            max_tokens=400  # Enough to complete responses without cutting off (~150-200 words)
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


def chat_with_repo_stream(repo_id: str, user_message: str, top_k: int = 5):
    """
    Process a user query about a repository using RAG with streaming response.

    Args:
        repo_id: Repository identifier
        user_message: User's question/message
        top_k: Number of chunks to retrieve (default: 5)

    Yields:
        Dicts containing:
        - {"type": "chunk", "content": "..."} for each text chunk
        - {"type": "chunks", "retrieved_chunks": [...]} at the end with metadata
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
        system_message = build_chat_prompt(context)

        # 4. Create messages for LLM
        messages = [
            {"role": "system", "content": system_message},
            {"role": "user", "content": user_message}
        ]

        # 5. Stream response using LLM
        for content_chunk in llm_chat_stream(
            messages=messages,
            model="gpt-4o-mini",
            temperature=0.5,
            max_tokens=400
        ):
            yield {"type": "chunk", "content": content_chunk}

        # 6. Send retrieved chunks metadata at the end
        yield {
            "type": "chunks",
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
            yield {
                "type": "error",
                "message": f"I couldn't find the repository '{repo_id}'. Please make sure the repository has been ingested and indexed first."
            }
        else:
            yield {
                "type": "error",
                "message": "I encountered an error while processing your request. Please try again."
            }
