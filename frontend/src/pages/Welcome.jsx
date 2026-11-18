import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faComments,
  faFileLines,
  faUpload,
} from "@fortawesome/free-solid-svg-icons";

function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <span className="relative">
          <FontAwesomeIcon icon={faFileLines} className="text-4xl" />
          <FontAwesomeIcon
            icon={faComments}
            className="absolute -bottom-1 -right-2 rounded-full bg-blue-600 p-1 text-[10px] text-white"
          />
        </span>
      </div>

      <h1 className="mb-3 text-center text-3xl font-bold text-gray-900">
        Chat with your documents
      </h1>

      <p className="mb-8 max-w-md text-center text-gray-500">
        Upload your PDFs and ask questions. Get answers with sources and page
        references.
      </p>

      <button
        onClick={() => navigate("/new-chat")}
        className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
      >
        <FontAwesomeIcon icon={faUpload} />
        Upload Documents
      </button>

      <p className="mt-4 text-xs text-gray-400">
        PDF files · Multiple files supported
      </p>
    </div>
  );
}

export default Welcome;
