import { useState } from "react";
import { Outlet } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faFileLines } from "@fortawesome/free-solid-svg-icons";

import Sidebar from "./Sidebar";
import DocumentsPanel from "./DocumentsPanel";

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [docsOpen, setDocsOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar open={sidebarOpen} onCollapse={() => setSidebarOpen(false)} />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute left-3 top-3 z-20 rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm hover:bg-gray-50"
            aria-label="Open sidebar"
          >
            <FontAwesomeIcon icon={faBars} />
          </button>
        )}

        <Outlet />

        {!docsOpen && (
          <button
            onClick={() => setDocsOpen(true)}
            className="absolute right-3 top-3 z-20 rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm hover:bg-gray-50"
            aria-label="Open documents"
          >
            <FontAwesomeIcon icon={faFileLines} />
          </button>
        )}
      </main>

      <DocumentsPanel open={docsOpen} onCollapse={() => setDocsOpen(false)} />
    </div>
  );
}

export default AppLayout;
