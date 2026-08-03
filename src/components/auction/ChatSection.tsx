import React from 'react';
import { Send } from 'lucide-react';
import { resolveAvatarUrl } from '../../utils/avatarPlaceholder';

/* ======================================================================
   ChatSection — the Chat / comments block that lives LOWER on the mobile
   product page (mockup frame 3), NOT overlaid on the media. It renders the
   PERSISTENT chat `messages` for the active lot (system/bid rows styled
   distinctly from member messages) — the full Firestore-backed list, NOT the
   reel's ephemeral overlay buffer that auto-removes each entry after ~7s — and
   a composer bound to the EXISTING chat props (commentText / setCommentText /
   onCommentSubmit) — the send path that Task 2 fixed so member comments now
   round-trip and render (and now persist in the log).

   Guests get the same signup gate the reel used (requestSignIn); signed-in
   members get a working input + send.
   ====================================================================== */

interface ChatSectionProps {
  /** Persistent chat messages for the active lot (full list, not ephemeral). */
  messages: any[];
  commentText: string;
  setCommentText: (text: string) => void;
  onCommentSubmit: (e: React.FormEvent) => void;
  isGuest: boolean;
  requestSignIn: () => void;
  isAr: boolean;
}

export const ChatSection: React.FC<ChatSectionProps> = ({
  messages,
  commentText,
  setCommentText,
  onCommentSubmit,
  isGuest,
  requestSignIn,
  isAr,
}) => {
  const count = messages.length;

  return (
    <section
      className="mt-4 border-t border-line"
      id="mobile-auction-chat"
      aria-label={isAr ? 'الدردشة' : 'Chat'}
    >
      {/* ----- Header: title + a small live message count ----- */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-line">
        <h2 className="text-[15px] font-black text-fg">
          {isAr ? 'الدردشة' : 'Chat'}
        </h2>
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#12B76A]"
          dir="ltr"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#12B76A]" />
          {count}{' '}
          {isAr ? 'رسالة' : count === 1 ? 'message' : 'messages'}
        </span>
      </div>

      {/* ----- Message list ----- */}
      <div className="px-4 py-3.5 flex flex-col gap-3">
        {count === 0 && (
          <p className="text-[12px] text-fg-muted font-medium py-4 text-center">
            {isAr
              ? 'لا توجد رسائل بعد — كن أول من يكتب.'
              : 'No messages yet — be the first to write.'}
          </p>
        )}

        {messages.map((msg) => {
          const isSystemRow = !!msg.isSystem || !!msg.isBid;

          if (isSystemRow) {
            // System / bid announcement — no avatar, orange bubble (mockup .msg.sys).
            return (
              <div key={`chat-${msg.id}`} className="flex">
                <div className="bg-[#F05123]/[0.07] rounded-[10px] px-2.5 py-1.5">
                  <p className="text-[11.5px] font-bold text-[#F05123] leading-snug">
                    {msg.text}
                  </p>
                </div>
              </div>
            );
          }

          // Normal member message — avatar + name + text.
          return (
            <div key={`chat-${msg.id}`} className="flex gap-2.5 items-start">
              <img
                src={resolveAvatarUrl(msg.userAvatar, msg.userId)}
                alt=""
                width={30}
                height={30}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-[30px] h-[30px] rounded-full object-cover bg-[#EAEAEA] shrink-0"
              />
              <div className="min-w-0">
                <span className="text-[11px] font-extrabold text-fg leading-none block">
                  {msg.userName}
                </span>
                <p className="text-[12.5px] text-fg leading-snug mt-0.5 break-words">
                  {msg.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ----- Composer (guest gate vs working input) ----- */}
      {isGuest ? (
        <div className="px-4 pt-3 pb-4 border-t border-line">
          <button
            type="button"
            onClick={requestSignIn}
            className="w-full py-3 rounded-full bg-surface border border-line text-[13px] font-black text-fg active:scale-[0.99] transition-transform cursor-pointer"
          >
            {isAr ? '💬 سجّل للدردشة' : '💬 Sign up to chat'}
          </button>
        </div>
      ) : (
        <form
          onSubmit={onCommentSubmit}
          className="flex gap-2.5 items-center px-4 pt-3 pb-4 border-t border-line"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={isAr ? 'اكتب تعليقاً…' : 'Write a comment…'}
            className="flex-1 h-10 px-4 bg-surface rounded-full text-[12.5px] text-fg placeholder-[#999] outline-none border border-transparent focus:border-[#F05123]/40 transition-colors"
            aria-label={isAr ? 'اكتب تعليقاً' : 'Write a comment'}
          />
          <button
            type="submit"
            disabled={!commentText.trim()}
            className="w-10 h-10 shrink-0 rounded-full bg-[#F05123] text-white grid place-items-center disabled:opacity-40 active:scale-95 transition-transform cursor-pointer"
            aria-label={isAr ? 'إرسال' : 'Send'}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}
    </section>
  );
};

export default ChatSection;
