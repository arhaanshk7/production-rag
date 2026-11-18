from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from fastembed import TextEmbedding

from app.models.document_chunk import DocumentChunk

MODEL_NAME = "BAAI/bge-small-en-v1.5"
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

_model = None


def get_model():
    global _model
    if _model is None:
        _model = TextEmbedding(model_name=MODEL_NAME)
    return _model


def encode_documents(texts):
    return [e.tolist() for e in get_model().passage_embed(texts, batch_size=128)]


def encode_query(text):
    return next(get_model().query_embed(QUERY_PREFIX + text)).tolist()


def create_chunks(document_id, file_path, db):
    pages = PyPDFLoader(str(file_path)).load()

    chunks = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    ).split_documents(pages)

    if not chunks:
        return 0

    texts = [chunk.page_content for chunk in chunks]
    embeddings = encode_documents(texts)

    for index, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        db.add(DocumentChunk(
            document_id=document_id,
            chunk_index=index,
            page_number=chunk.metadata.get("page", 0) + 1,
            chunk_text=chunk.page_content,
            embedding=embedding,
        ))

    return len(chunks)
