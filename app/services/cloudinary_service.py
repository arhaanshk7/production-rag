import cloudinary
import cloudinary.uploader
import cloudinary.utils

from app.core.config import settings

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)


def upload_pdf(file_path):
    result = cloudinary.uploader.upload(
        str(file_path),
        resource_type="raw",
        folder="pdfs",
    )
    return result["public_id"]


def pdf_url(public_id):
    url, _ = cloudinary.utils.cloudinary_url(
        public_id,
        resource_type="raw",
        secure=True,
    )
    return url


def delete_pdf(public_id):
    cloudinary.uploader.destroy(public_id, resource_type="raw")
