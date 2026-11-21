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
  const inputRef = useRef(null);

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

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [input]);

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
      <div
        className="flex-1 space-y-4 overflow-y-auto overscroll-contain bg-white px-3 py-4 sm:px-8 sm:py-6"
        aria-live="polite"
      >
        {loading ? (
          <p className="text-center text-sm text-gray-500">
            Loading conversation...
          </p>
        ) : messages.length === 0 ? (
          <div className="mx-auto max-w-md py-10 text-center sm:py-16">
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
                  className={`max-w-[88%] rounded-2xl px-4 py-3 text-base sm:max-w-[85%] sm:text-sm ${
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

        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-400">
              Thinking...
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-gray-300 p-2 focus-within:border-blue-500 sm:rounded-xl">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            enterKeyHint="send"
            placeholder="Ask a question..."
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none sm:min-h-0 sm:text-sm"
          />

          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="rounded-xl bg-blue-600 p-3 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-lg sm:p-2.5"
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
