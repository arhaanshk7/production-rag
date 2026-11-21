import { useEffect, useState, useSyncExternalStore } from "react";
import { Outlet, useMatch } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faFileLines } from "@fortawesome/free-solid-svg-icons";

import Sidebar from "./Sidebar";
import DocumentsPanel from "./DocumentsPanel";

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeToMobile(callback) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getMobileSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function getMobileServerSnapshot() {
  return false;
}

function AppLayout() {
  const isMobile = useSyncExternalStore(
    subscribeToMobile,
    getMobileSnapshot,
    getMobileServerSnapshot
  );
  const isConversation = Boolean(useMatch("/conversations/:id"));
  const [panelOverride, setPanelOverride] = useState({
    breakpoint: isMobile,
    sidebar: null,
    docs: null,
  });

  const overrideApplies = panelOverride.breakpoint === isMobile;
  const sidebarOpen =
    overrideApplies && panelOverride.sidebar !== null
      ? panelOverride.sidebar
      : !isMobile;
  const docsOpen =
    overrideApplies && panelOverride.docs !== null
      ? panelOverride.docs
      : !isMobile;

  function setPanels(next) {
    setPanelOverride((prev) => {
      const previousApplies = prev.breakpoint === isMobile;
      return {
        breakpoint: isMobile,
        sidebar:
          next.sidebar ?? (previousApplies ? prev.sidebar : null),
        docs: next.docs ?? (previousApplies ? prev.docs : null),
      };
    });
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setPanels({ sidebar: false, docs: false });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const mobileChatChrome = isMobile && isConversation;

  function openSidebar() {
    setPanels({ sidebar: true, docs: false });
  }

  function openDocuments() {
    setPanels({ sidebar: false, docs: true });
  }

  function closeSidebarOnNavigate() {
    if (isMobile) setPanels({ sidebar: false });
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-gray-50">
      <Sidebar
        open={sidebarOpen}
        onCollapse={() => setPanels({ sidebar: false })}
        onNavigate={closeSidebarOnNavigate}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        {mobileChatChrome && (
          <header className="z-10 flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              onClick={openSidebar}
              className="rounded-lg border border-gray-200 bg-white p-2.5 text-gray-600 hover:bg-gray-50"
              aria-label="Open conversations"
            >
              <FontAwesomeIcon icon={faBars} />
            </button>

            <span className="min-w-0 flex-1 truncate text-center font-semibold text-gray-800">
              Conversation
            </span>

            <button
              onClick={openDocuments}
              className="rounded-lg border border-gray-200 bg-white p-2.5 text-gray-600 hover:bg-gray-50"
              aria-label="Open documents"
            >
              <FontAwesomeIcon icon={faFileLines} />
            </button>
          </header>
        )}

        {!sidebarOpen && !mobileChatChrome && (
          <button
            onClick={openSidebar}
            className="absolute left-3 top-3 z-20 rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm hover:bg-gray-50"
            aria-label="Open sidebar"
          >
            <FontAwesomeIcon icon={faBars} />
          </button>
        )}

        <Outlet />

        {!docsOpen && !mobileChatChrome && (
          <button
            onClick={openDocuments}
            className="absolute right-3 top-3 z-20 rounded-lg border border-gray-200 bg-white p-2 text-gray-600 shadow-sm hover:bg-gray-50"
            aria-label="Open documents"
          >
            <FontAwesomeIcon icon={faFileLines} />
          </button>
        )}
      </main>

      <DocumentsPanel open={docsOpen} onCollapse={() => setPanels({ docs: false })} />
    </div>
  );
}

export default AppLayout;
