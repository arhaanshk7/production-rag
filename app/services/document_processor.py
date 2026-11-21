import httpx
from langchain_community.document_loaders import PyMuPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy import insert

from app.core.config import settings
from app.models.document_chunk import DocumentChunk

EMBED_URL = "https://openrouter.ai/api/v1/embeddings"
MODEL_NAME = "baai/bge-base-en-v1.5"
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "
BATCH_SIZE = 64


def embed(texts):
    result = []
    for start in range(0, len(texts), BATCH_SIZE):
        response = httpx.post(
            EMBED_URL,
            headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
            json={"model": MODEL_NAME, "input": texts[start:start + BATCH_SIZE]},
            timeout=60,
        )
        response.raise_for_status()
        data = sorted(response.json()["data"], key=lambda d: d["index"])
        result.extend(item["embedding"] for item in data)
    return result


def encode_documents(texts):
    return embed(texts)


def encode_query(text):
    return embed([QUERY_PREFIX + text])[0]


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