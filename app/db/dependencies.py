from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError

from app.db.session import SessionLocal
from app.security import verify_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


def get_current_user_id(
    token: str = Depends(oauth2_scheme),
) -> str:
    try:
        payload = verify_access_token(token)
        return payload["sub"]

    except InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )