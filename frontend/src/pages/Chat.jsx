import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPaperPlane } from "@fortawesome/free-solid-svg-icons";

import api from "../services/api";

function Chat() {
  const { id } = useParams();
  const bottomRef = useRef(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadConversation() {
      setLoading(true);
      try {
        const response = await api.get(`/conversations/${id}/messages`);

        if (!active) return;

        setMessages(Array.isArray(response.data) ? response.data : []);
      } catch {
        if (active) setMessages([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadConversation();
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setError("");
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const response = await api.post(`/conversations/${id}/messages`, {
        content: text,
      });

      const answer = response.data?.content ?? response.data?.answer;
      const sources = response.data?.sources ?? [];

      if (answer) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: answer, sources },
        ]);
      }

      window.dispatchEvent(
        new CustomEvent("conversationUpdated", {
          detail: { conversationId: id, title: response.data.title },
        })
      );
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Failed to send. The chat backend is not available yet."
      );
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto bg-white px-4 py-6 sm:px-8">
        {loading ? (
          <p className="text-center text-sm text-gray-500">
            Loading conversation...
          </p>
        ) : messages.length === 0 ? (
          <div className="mx-auto max-w-md py-16 text-center">
            <p className="font-medium text-gray-700">
              Ask a question about your documents
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Answers will appear here with sources and page references.
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isUser = message.role === "user";

            return (
              <div
                key={message.message_id || index}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    isUser
                      ? "bg-blue-100 text-gray-900"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {message.content}
                    </p>
                  ) : (
                    <div className="markdown leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {!isUser && message.sources?.length > 0 && (
                    <div className="mt-2 border-t border-gray-300 pt-2 text-xs text-gray-500">
                      <p className="font-medium">Sources</p>
                      <ul className="list-inside list-disc">
                        {message.sources.map((source, sourceIndex) => (
                          <li key={sourceIndex}>
                            {source.filename ||
                              source.document ||
                              source.title ||
                              `Source ${sourceIndex + 1}`}
                            {source.page_number ? ` · p.${source.page_number}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {sending && <p className="text-sm text-gray-400">Thinking...</p>}

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 bg-white p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-xl border border-gray-300 p-2 focus-within:border-blue-500">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ask a question about your documents..."
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none"
          />

          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="rounded-lg bg-blue-600 p-2.5 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Send message"
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default Chat;
