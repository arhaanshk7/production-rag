from fastapi import Depends, FastAPI

from sqlalchemy.orm import Session

from app.db.dependencies import get_db,get_current_user_id

from app.models.user import User

from pydantic import BaseModel, Field

from app.security import hash_password

from app.security import verify_password

from fastapi import HTTPException

from sqlalchemy import select, text, func
import httpx

from app.core.config import settings
from app.models.message import Message
from app.services.document_processor import encode_query, get_model

from app.security import create_access_token

from fastapi.middleware.cors import CORSMiddleware

from app.models.conversation import Conversation

from app.models.document import Document

import uuid

from concurrent.futures import ThreadPoolExecutor

from pathlib import Path

from fastapi import UploadFile, File

from app.services.document_processor import create_chunks

from app.services.cloudinary_service import upload_pdf, pdf_url, delete_pdf

from contextlib import asynccontextmanager

from app.security import verify_access_token

from fastapi import Request
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.extension import _rate_limit_exceeded_handler
from app.core.config import REDIS_URL


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_model()
    yield


app = FastAPI(lifespan=lifespan)


def get_user_rate_limit_key(request: Request) -> str:
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    payload = verify_access_token(token)
    return payload["sub"]

limiter = Limiter(
    key_func=get_user_rate_limit_key,
    storage_uri=REDIS_URL,
)

app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,
    _rate_limit_exceeded_handler,
)
app.add_middleware(SlowAPIMiddleware)

cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    username: str
    password: str


@app.post("/signup")
def signup(user: SignupRequest, db: Session = Depends(get_db)):

    # 1. Check whether the username already exists
    existing_user = db.scalar(
        select(User).where(User.username == user.username)
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Username already exists. Please choose another username."
        )

    # 2. Hash the user's password
    hashed_password = hash_password(user.password)

    # 3. Create the new user
    new_user = User(
        username=user.username,
        password_hash=hashed_password
    )

    # 4. Save the user in PostgreSQL
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # 5. Generate a JWT access token
    access_token = create_access_token(str(new_user.user_id))

    # 6. Return the token and user details
    return {
        "message": "Signup successful",
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": str(new_user.user_id),
        "username": new_user.username
    }


@app.post("/login")
def login(user: LoginRequest, db: Session = Depends(get_db)):
    existing_user = db.scalar(
        select(User).where(User.username == user.username)
    )

    if not existing_user:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    if not verify_password(user.password, existing_user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    access_token = create_access_token(str(existing_user.user_id))

    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": str(existing_user.user_id),
        "username": existing_user.username
    }





@app.post("/conversations")
def create_conversation(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    conversation = Conversation(
        user_id=uuid.UUID(user_id),
        title="New Chat",
    )

    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    return {
        "conversation_id": str(conversation.conversation_id),
        "title": conversation.title,
    }


@app.get("/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    conversations = db.scalars(
        select(Conversation)
        .where(Conversation.user_id == uuid.UUID(user_id))
        .order_by(Conversation.updated_at.desc())
    ).all()

    return [
        {
            "conversation_id": str(conversation.conversation_id),
            "title": conversation.title,
        }
        for conversation in conversations
    ]


UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


@app.post("/conversations/{conversation_id}/documents")
@limiter.limit("10/minute")
def upload_documents(
    request:Request,
    conversation_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    conversation = db.query(Conversation).filter(
        Conversation.conversation_id == conversation_id,
        Conversation.user_id == uuid.UUID(user_id),
    ).first()

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    for file in files:
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail="Only PDF files are allowed",
            )

    saved_paths = []

    try:
        for file in files:
            document_id = uuid.uuid4()
            file_path = UPLOAD_DIR / f"{document_id}.pdf"

            with open(file_path, "wb") as f:
                f.write(file.file.read())

            saved_paths.append(file_path)

            document = Document(
                document_id=document_id,
                user_id=uuid.UUID(user_id),
                conversation_id=conversation_id,
                filename=file.filename,
                storage_key=None,
                status="uploaded",
            )

            db.add(document)

            with ThreadPoolExecutor(max_workers=1) as pool:
                cloudinary_future = pool.submit(upload_pdf, file_path)
                chunk_count = create_chunks(document_id, file_path, db)
                storage_key = cloudinary_future.result()

            if chunk_count == 0:
                raise HTTPException(
                    status_code=422,
                    detail=f"No extractable text in '{file.filename}'. It may be a scanned PDF.",
                )

            document.storage_key = storage_key
            document.status = "ready"
            file_path.unlink(missing_ok=True)

        db.commit()

    except Exception:
        db.rollback()
        for path in saved_paths:
            path.unlink(missing_ok=True)
        raise

    return {"message": "PDFs uploaded successfully"}


@app.get("/conversations/{conversation_id}/documents")
def list_documents(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.conversation_id == conversation_id,
            Conversation.user_id == uuid.UUID(user_id),
        )
    )

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    documents = db.scalars(
        select(Document).where(Document.conversation_id == conversation_id)
    ).all()

    return [
        {
            "document_id": str(document.document_id),
            "filename": document.filename,
            "status": document.status,
            "url": pdf_url(document.storage_key) if document.storage_key else None,
        }
        for document in documents
    ]


@app.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.conversation_id == conversation_id,
            Conversation.user_id == uuid.UUID(user_id),
        )
    )

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    documents = db.scalars(
        select(Document).where(Document.conversation_id == conversation_id)
    ).all()

    db.delete(conversation)
    db.commit()

    for document in documents:
        if document.storage_key:
            delete_pdf(document.storage_key)
        (UPLOAD_DIR / f"{document.document_id}.pdf").unlink(missing_ok=True)

    return {"message": "Conversation deleted"}


class MessageRequest(BaseModel):
    content: str


def format_embedding(embedding):
    return "[" + ",".join(str(float(value)) for value in embedding) + "]"


def rrf_fusion(bm25_rows, vector_rows, top_n=5, k=60):
    scores = {}
    rows = {}

    for results in [bm25_rows, vector_rows]:
        for rank, row in enumerate(results, 1):
            chunk_id = row.chunk_id
            scores[chunk_id] = scores.get(chunk_id, 0) + 1 / (k + rank)
            rows[chunk_id] = row

    top_ids = sorted(scores, key=scores.get, reverse=True)[:top_n]
    return [rows[chunk_id] for chunk_id in top_ids]


def ask_groq(question, context):
    response = httpx.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.OPENROUTER_API_KEY}"},
        json={
            "model": "openai/gpt-oss-20b",
            
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Answer using ONLY the provided context. "
                        "If the answer is not in the context, say exactly: I couldn't find relevant information in your uploaded documents. "
                        "Only cite sources you actually used. "
                        "At the end, add a line like: CITED: S1, S2 "
                        "Use only source IDs from the context (S1-S5). Do not invent filenames or page numbers."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Context:\n{context}\n\nQuestion: {question}",
                },
            ],
        },
        timeout=60,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


@app.get("/conversations/{conversation_id}/messages")
@limiter.limit("20/minute")
def list_messages(
    request: Request,
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.conversation_id == conversation_id,
            Conversation.user_id == uuid.UUID(user_id),
        )
    )

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    ).all()

    return [
        {
            "message_id": str(message.message_id),
            "role": message.role,
            "content": message.content,
            "sources": message.sources or [],
        }
        for message in messages
    ]


@app.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: uuid.UUID,
    body: MessageRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    import re

    conversation = db.scalar(
        select(Conversation).where(
            Conversation.conversation_id == conversation_id,
            Conversation.user_id == uuid.UUID(user_id),
        )
    )

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if conversation.title == "New Chat":
        title = body.content.strip()
        conversation.title = title[:50] + ("..." if len(title) > 50 else "")

    conversation.updated_at = func.now()

    db.add(Message(
        conversation_id=conversation_id,
        role="user",
        content=body.content,
    ))
    db.commit()

    question_embedding = encode_query(body.content)

    bm25_rows = db.execute(
        text("""
            SELECT
                c.chunk_id,
                c.chunk_text,
                c.page_number,
                d.filename,
                pdb.score(c.chunk_id) AS bm25_score
            FROM document_chunks AS c
            JOIN documents AS d ON c.document_id = d.document_id
            WHERE c.chunk_text ||| :question
              AND d.user_id = :user_id
              AND d.conversation_id = :conversation_id
              AND d.status = 'ready'
            ORDER BY bm25_score DESC
            LIMIT 20
        """),
        {
            "question": body.content,
            "user_id": uuid.UUID(user_id),
            "conversation_id": conversation_id,
        },
    ).all()

    vector_rows = db.execute(
        text("""
            SELECT
                c.chunk_id,
                c.chunk_text,
                c.page_number,
                d.filename,
                c.embedding <=> CAST(:question_embedding AS vector) AS distance
            FROM document_chunks AS c
            JOIN documents AS d ON c.document_id = d.document_id
            WHERE d.user_id = :user_id
              AND d.conversation_id = :conversation_id
              AND d.status = 'ready'
            ORDER BY c.embedding <=> CAST(:question_embedding AS vector)
            LIMIT 20
        """),
        {
            "question_embedding": format_embedding(question_embedding),
            "user_id": uuid.UUID(user_id),
            "conversation_id": conversation_id,
        },
    ).all()

    rows = rrf_fusion(bm25_rows, vector_rows)

    if not rows:
        answer = "I couldn't find relevant information in your uploaded documents."
        sources = []
    else:
        sources_map = {}
        context_lines = []
        for i, row in enumerate(rows, start=1):
            sid = f"S{i}"
            sources_map[sid] = {"filename": row.filename, "page_number": row.page_number}
            context_lines.append(f"{sid}: [{row.filename} | page {row.page_number}]\n{row.chunk_text}")
        context = "\n\n".join(context_lines)

        try:
            raw = ask_groq(body.content, context)
        except Exception:
            raise HTTPException(status_code=502, detail="Failed to generate an answer")

        answer = raw
        # Remove CITED line from answer shown to user
        cited_line = re.search(r'(?i)^CITED\s*:.*$', raw, re.M)
        if cited_line:
            answer = (raw[:cited_line.start()] + raw[cited_line.end():]).strip()

        sources = []
        if answer.strip().lower().startswith("i couldn't find relevant information"):
            sources = []
        else:
            cited = []
            if cited_line:
                cited = re.findall(r'S[1-5]', cited_line.group(), re.I)
            # deduplicate by (filename, page) - if same page comes twice, show once
            seen = set()
            for sid in cited:
                sid_up = sid.upper()
                if sid_up in sources_map:
                    key = (sources_map[sid_up]["filename"], sources_map[sid_up]["page_number"])
                    if key in seen:
                        continue  # skip duplicate
                    sources.append(sources_map[sid_up])
                    seen.add(key)

    assistant_message = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=answer,
        sources=sources,
    )
    db.add(assistant_message)
    db.commit()
    db.refresh(assistant_message)

    return {
        "message_id": str(assistant_message.message_id),
        "role": "assistant",
        "content": answer,
        "sources": sources,
        "title": conversation.title,
    }






