import time

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy import insert

from app.core.config import settings
from app.models.document_chunk import DocumentChunk

MODEL_NAME = "gemini-embedding-001"
DIMENSIONS = 768
BATCH_SIZE = 100
RETRY_DELAY = 8

_api_keys = []
_clients = []
_batch_index = 0


def _keys():
    if not _api_keys:
        _api_keys.extend(
            key for key in (settings.GEMINI_KEY, settings.GEMINI_KEY2) if key
        )
    return _api_keys


def get_model(index=0):
    global _clients
    if not _clients:
        _clients = [genai.Client(api_key=key) for key in _keys()]
    return _clients[index % len(_clients)]


def embed_batch(batch, task_type):
    global _batch_index
    keys = _keys()

    for attempt in range(4):
        for offset in range(len(keys)):
            index = (_batch_index + offset) % len(keys)
            try:
                response = get_model(index).models.embed_content(
                    model=MODEL_NAME,
                    contents=batch,
                    config=types.EmbedContentConfig(
                        task_type=task_type,
                        output_dimensionality=DIMENSIONS,
                    ),
                )
                _batch_index += 1
                return [list(item.values) for item in response.embeddings]
            except genai_errors.ClientError as exc:
                if exc.code != 429:
                    raise
        time.sleep(RETRY_DELAY)

    raise RuntimeError("Gemini rate limit exceeded on all keys")


def embed(texts, task_type):
    result = []
    for start in range(0, len(texts), BATCH_SIZE):
        result.extend(embed_batch(texts[start:start + BATCH_SIZE], task_type))
    return result


def encode_documents(texts):
    return embed(texts, "RETRIEVAL_DOCUMENT")


def encode_query(text):
    return embed([text], "RETRIEVAL_QUERY")[0]


def create_chunks(document_id, file_path, db):
    pages = PyMuPDFLoader(str(file_path)).load()

    chunks = RecursiveCharacterTextSplitter(
        chunk_size=1600,
        chunk_overlap=200,
    ).split_documents(pages)

    if not chunks:
        return 0

    texts = [chunk.page_content for chunk in chunks]
    embeddings = encode_documents(texts)

    rows = [
        {
            "document_id": document_id,
            "chunk_index": index,
            "page_number": chunk.metadata.get("page", 0) + 1,
            "chunk_text": chunk.page_content,
            "embedding": embedding,
        }
        for index, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]
    db.flush()
    db.execute(insert(DocumentChunk), rows)

    return len(chunks)
