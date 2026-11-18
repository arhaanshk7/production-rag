
from app.db.base import Base
from app.db.session import engine

# Import all models so SQLAlchemy knows their tables
from app.models import (
    User,
    Conversation,
    Document,
    DocumentChunk,
    Message,
)


def init_db():
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
    print("Database tables created successfully!")
