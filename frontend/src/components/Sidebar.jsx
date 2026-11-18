import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useMatch, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faComments,
  faPlus,
  faRightFromBracket,
  faTrash,
} from "@fortawesome/free-solid-svg-icons";

import api from "../services/api";

function Sidebar({ open, onCollapse }) {
  const navigate = useNavigate();
  const location = useLocation();
  const match = useMatch("/conversations/:id");
  const selectedId = match?.params.id;

  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadConversations() {
      try {
        const response = await api.get("/conversations");
        if (active) setConversations(response.data);
      } catch {
        if (active) setConversations([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadConversations();
    return () => {
      active = false;
    };
  }, [location.pathname]);

  useEffect(() => {
    function handleUpdate(event) {
      const { conversationId, title } = event.detail;

      setConversations((prev) => {
        const target = prev.find(
          (conversation) => conversation.conversation_id === conversationId
        );

        if (!target) return prev;

        return [
          { ...target, title },
          ...prev.filter(
            (conversation) => conversation.conversation_id !== conversationId
          ),
        ];
      });
    }

    window.addEventListener("conversationUpdated", handleUpdate);
    return () =>
      window.removeEventListener("conversationUpdated", handleUpdate);
  }, []);

  function handleLogout() {
    localStorage.removeItem("access_token");
    navigate("/login");
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this chat?")) return;

    try {
      await api.delete(`/conversations/${id}`);
      setConversations((prev) =>
        prev.filter((conversation) => conversation.conversation_id !== id)
      );
      if (id === selectedId) navigate("/");
    } catch {
      return;
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-20 bg-black/40 md:hidden"
        onClick={onCollapse}
      />

      <aside className="fixed inset-y-0 left-0 z-30 flex w-72 shrink-0 flex-col bg-[#0f172a] text-white md:static md:z-auto">
        <div className="flex items-center justify-between px-4 pt-4">
          <span className="text-lg font-semibold">DocChat</span>
          <button
            onClick={onCollapse}
            className="rounded-md p-2 text-gray-400 hover:bg-white/10 hover:text-white"
            aria-label="Collapse sidebar"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
        </div>

        <div className="p-4">
          <Link
            to="/new-chat"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-medium transition hover:bg-blue-700"
          >
            <FontAwesomeIcon icon={faPlus} />
            New Chat
          </Link>
        </div>

        <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Conversations
        </p>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2">
          {loading ? (
            <p className="px-2 py-3 text-sm text-gray-500">Loading...</p>
          ) : conversations.length === 0 ? (
            <div className="px-2 py-3">
              <p className="text-sm text-gray-300">No conversations yet</p>
              <p className="mt-1 text-xs text-gray-500">
                Start a new chat to see it here.
              </p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const id = conversation.conversation_id;
              const isActive = id === selectedId;

              return (
                <div
                  key={id}
                  className={`flex items-center rounded-lg ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-gray-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <NavLink
                    to={`/conversations/${id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm"
                  >
                    <FontAwesomeIcon
                      icon={faComments}
                      className="shrink-0 text-xs"
                    />
                    <span className="truncate">
                      {conversation.title || "Untitled"}
                    </span>
                  </NavLink>

                  <button
                    onClick={() => handleDelete(id)}
                    className="mr-2 rounded-md p-1.5 text-gray-500 hover:bg-white/10 hover:text-red-400"
                    aria-label="Delete conversation"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>
              );
            })
          )}
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 transition hover:bg-white/5 hover:text-white"
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
