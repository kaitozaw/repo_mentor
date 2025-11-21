from backend.services.rag.llm_client import chat
import json

def summarise_commit(payload: dict) -> str:
    messages = [
        {
            "role": "system",
            "content": (
                "You are an assistant that summarizes Git commits for retrieval-augmented search. "
                "Given a JSON description of a single commit, write a concise but detailed, "
                "developer-facing summary in English.\n\n"
                "Requirements:\n"
                "- Explain the intent of the change if possible.\n"
                "- Highlight key changes grouped by file.\n"
                "- Mention important functions, classes, modules, or APIs.\n"
                "- Use clear bullet points, no markdown headings needed.\n"
                "- Do NOT restate the commit hash or author.\n"
            ),
        },
        {
            "role": "user",
            "content": (
                "Here is one commit as JSON. Summarize it in the following structure:\n\n"
                "Summary:\n"
                "- ...\n\n"
                "Files:\n"
                "- <path>: <short description>\n\n"
                "Commit JSON:\n"
                f"{json.dumps(payload, ensure_ascii=False)}"
            ),
        },
    ]

    return chat(messages, model="gpt-4.1-mini", temperature=0.2, max_tokens=4096)