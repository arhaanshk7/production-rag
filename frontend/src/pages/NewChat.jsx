import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faFilePdf,
  faUpload,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import api from "../services/api";

function NewChat() {
  const navigate = useNavigate();
  const inputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState("");

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const pdfs = incoming.filter((file) =>
      file.name.toLowerCase().endsWith(".pdf")
    );

    setError(pdfs.length === incoming.length ? "" : "Only PDF files are allowed.");

    setFiles((prev) => {
      const merged = [...prev];
      for (const file of pdfs) {
        const exists = merged.some(
          (existing) => existing.name === file.name && existing.size === file.size
        );
        if (!exists) merged.push(file);
      }
      return merged;
    });
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function handleUpload() {
    if (uploading || conversationId) return;

    if (files.length === 0) {
      setError("Please select at least one PDF.");
      return;
    }

    setError("");
    setUploading(true);

    let id = null;

    try {
      const conversationResponse = await api.post("/conversations", {});
      id = conversationResponse.data.conversation_id;

      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }

      await api.post(`/conversations/${id}/documents`, formData);
      setConversationId(id);
    } catch (err) {
      if (id) {
        await api.delete(`/conversations/${id}`).catch(() => {});
      }
      setError(err.response?.data?.detail || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  const uploaded = Boolean(conversationId);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Create New Chat</h1>
        <p className="mb-8 text-gray-500">
          Upload one or more PDFs to start a conversation.
        </p>

        {!uploaded ? (
          <>
            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                addFiles(event.dataTransfer.files);
              }}
              className={`rounded-2xl border-2 border-dashed p-10 text-center transition ${
                dragging ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white"
              }`}
            >
              <FontAwesomeIcon
                icon={faUpload}
                className="mb-4 text-3xl text-blue-500"
              />

              <h2 className="mb-1 text-lg font-semibold text-gray-800">
                Drag & drop your PDFs here
              </h2>
              <p className="mb-5 text-sm text-gray-500">
                or choose files from your device
              </p>

              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
              >
                Choose Files
              </button>

              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                className="hidden"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />

              <p className="mt-4 text-xs text-gray-400">PDF files only</p>
            </div>

            {files.length > 0 && (
              <div className="mt-6 space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Selected files ({files.length})
                </p>

                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
                  >
                    <FontAwesomeIcon icon={faFilePdf} className="text-red-500" />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-gray-800">{file.name}</p>
                      <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
                    </div>

                    <button
                      onClick={() => removeFile(index)}
                      disabled={uploading}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                      aria-label="Remove file"
                    >
                      <FontAwesomeIcon icon={faXmark} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading || files.length === 0}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faUpload} />
              {uploading ? "Uploading & processing..." : "Upload & Create Chat"}
            </button>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
                >
                  <FontAwesomeIcon icon={faFilePdf} className="text-red-500" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-800">{file.name}</p>
                    <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
                  </div>

                  <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    <FontAwesomeIcon icon={faCircleCheck} /> Ready
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-6 rounded-lg bg-green-50 p-3 text-sm text-green-700">
              All documents finished processing. You can start chatting now.
            </p>

            <button
              onClick={() => navigate(`/conversations/${conversationId}`)}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Start Chat
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default NewChat;
