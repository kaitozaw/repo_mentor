from backend.config import OPENAI_API_KEY
from openai import OpenAI, APIError, APIConnectionError, RateLimitError, APITimeoutError
from typing import List
import time

# Initialize OpenAI client with timeout settings
_client = OpenAI(
    api_key=OPENAI_API_KEY,
    timeout=60.0,  # 60 second timeout
    max_retries=2   # Retry up to 2 times
)
EMBEDDING_MODEL = "text-embedding-3-small"

def chat(messages, model="gpt-4o-mini", temperature=0.2, max_tokens=4096):
    """Generate chat completions with retry logic."""
    try:
        response = _client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""
    except APIConnectionError as e:
        print(f"OpenAI API Connection Error: {str(e)}")
        raise Exception(f"Failed to connect to OpenAI API. Please check your internet connection.")
    except APITimeoutError as e:
        print(f"OpenAI API Timeout Error: {str(e)}")
        raise Exception(f"OpenAI API request timed out. Please try again.")
    except RateLimitError as e:
        print(f"OpenAI Rate Limit Error: {str(e)}")
        raise Exception(f"OpenAI API rate limit exceeded. Please wait a moment and try again.")
    except APIError as e:
        print(f"OpenAI API Error: {str(e)}")
        raise Exception(f"OpenAI API error: {str(e)}")
    except Exception as e:
        print(f"Unexpected error in chat: {type(e).__name__}: {str(e)}")
        raise

def chat_stream(messages, model="gpt-4o-mini", temperature=0.2, max_tokens=4096):
    """Generate streaming chat completions (sync generator for use in async context)."""
    try:
        stream = _client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True
        )
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    except APIConnectionError as e:
        print(f"OpenAI API Connection Error: {str(e)}")
        raise Exception(f"Failed to connect to OpenAI API. Please check your internet connection.")
    except APITimeoutError as e:
        print(f"OpenAI API Timeout Error: {str(e)}")
        raise Exception(f"OpenAI API request timed out. Please try again.")
    except RateLimitError as e:
        print(f"OpenAI Rate Limit Error: {str(e)}")
        raise Exception(f"OpenAI API rate limit exceeded. Please wait a moment and try again.")
    except APIError as e:
        print(f"OpenAI API Error: {str(e)}")
        raise Exception(f"OpenAI API error: {str(e)}")
    except Exception as e:
        print(f"Unexpected error in chat_stream: {type(e).__name__}: {str(e)}")
        raise

def embed_texts(texts: List[str]) -> List[List[float]]:
    """Generate embeddings with retry logic."""
    if not texts:
        return []

    try:
        response = _client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=texts,
        )
        embeddings: List[List[float]] = [item.embedding for item in response.data]
        return embeddings

    except APIConnectionError as e:
        print(f"OpenAI API Connection Error: {str(e)}")
        raise Exception(f"Failed to connect to OpenAI API. Please check your internet connection.")
    except APITimeoutError as e:
        print(f"OpenAI API Timeout Error: {str(e)}")
        raise Exception(f"OpenAI API request timed out. Please try again.")
    except RateLimitError as e:
        print(f"OpenAI Rate Limit Error: {str(e)}")
        raise Exception(f"OpenAI API rate limit exceeded. Please wait a moment and try again.")
    except APIError as e:
        print(f"OpenAI API Error: {str(e)}")
        raise Exception(f"OpenAI API error: {str(e)}")
    except Exception as e:
        print(f"Unexpected error in embed_texts: {type(e).__name__}: {str(e)}")
        raise