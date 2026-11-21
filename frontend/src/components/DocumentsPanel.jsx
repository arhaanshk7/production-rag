import { useEffect, useState } from "react";
import { useMatch } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowLeft,
  faChevronRight,
  faFileLines,
  faFilePdf,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";

import api from "../services/api";

const statusStyles = {
  ready: "bg-green-100 text-green-700",
  uploaded: "bg-green-100 text-green-700",
  processing: "bg-amber-100 text-amber-700",
  uploading: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

function DocumentsPanel({ open, onCollapse }) {
  const match = useMatch("/conversations/:id");
  const conversationId = match?.params.id;

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;

    if (!conversationId) return;

    async function loadDocuments() {
      setLoading(true);
      try {
        const response = await api.get(
          `/conversations/${conversationId}/documents`
        );
        if (active) setDocuments(response.data);
      } catch {
        if (active) setDocuments([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDocuments();
    return () => {
      active = false;
    };
  }, [conversationId]);

  if (!open) return null;

  const visibleDocuments = conversationId ? documents : [];
  const selectedUrl =
    selected && selected.conversationId === conversationId ? selected.url : null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        onClick={onCollapse}
        aria-hidden="true"
      />

      <aside className="fixed inset-x-0 bottom-0 z-50 flex h-[78dvh] shrink-0 flex-col rounded-t-2xl border-t border-gray-200 bg-slate-50 shadow-2xl sm:h-[70dvh] lg:static lg:z-auto lg:h-auto lg:w-[32rem] lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-gray-300 lg:hidden" />

        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
          <div className="flex min-w-0 items-center gap-2 text-gray-800">
            <FontAwesomeIcon icon={faFileLines} />
            <span className="truncate font-semibold">Uploaded Documents</span>
            <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">
              {visibleDocuments.length}
            </span>
          </div>

          <button
            onClick={onCollapse}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-200"
            aria-label="Close documents"
          >
            <FontAwesomeIcon icon={faXmark} className="lg:hidden" />
            <FontAwesomeIcon
              icon={faChevronRight}
              className="hidden lg:inline-block"
            />
          </button>
        </div>

        {selectedUrl ? (
          <div className="flex min-h-0 flex-1 flex-col p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-4">
            <button
              onClick={() => setSelected(null)}
              className="flex items-center gap-2 self-start rounded-lg px-2 py-1.5 text-sm text-gray-600 hover:bg-gray-200"
            >
              <FontAwesomeIcon icon={faArrowLeft} />
              Back
            </button>

            <iframe
              src={selectedUrl}
              title="PDF preview"
              className="mt-3 min-h-0 w-full flex-1 rounded-lg border border-gray-200 bg-white"
            />
          </div>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-4">
            {loading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : visibleDocuments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center">
                <p className="text-sm font-medium text-gray-700">
                  No documents uploaded yet
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Your uploaded PDFs will appear here.
                </p>
              </div>
            ) : (
              visibleDocuments.map((document) => {
                const status = (document.status || "uploaded").toLowerCase();

                return (
                  <button
                    key={document.document_id}
                    onClick={() =>
                      document.url &&
                      setSelected({
                        conversationId,
                        url: `${document.url}#toolbar=0&navpanes=0`,
                      })
                    }
                    disabled={!document.url}
                    className="flex w-full items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-default disabled:hover:border-gray-200 disabled:hover:bg-white md:p-3"
                  >
                    <FontAwesomeIcon
                      icon={faFilePdf}
                      className="mt-0.5 text-red-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-800">
                        {document.filename}
                      </p>
                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs ${
                          statusStyles[status] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        )}
      </aside>
    </>
  );
}

export default DocumentsPanel;
