import { useSupportContact } from "@/app/SettingsProvider";

/** Floating chat button on public pages; hidden until an admin sets the WhatsApp number. */
export function WhatsAppButton() {
  const { whatsappChatUrl } = useSupportContact();
  if (!whatsappChatUrl) return null;

  return (
    <a
      href={whatsappChatUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      title="Chat with us on WhatsApp"
      className="fixed right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 grid size-14 place-items-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/25 transition hover:scale-105 hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] lg:right-6 lg:bottom-6"
    >
      <svg viewBox="0 0 32 32" className="size-8" fill="currentColor" aria-hidden>
        <path d="M16.004 3C8.837 3 3.01 8.82 3.01 15.98c0 2.29.6 4.53 1.74 6.5L3 29l6.7-1.72a12.97 12.97 0 0 0 6.3 1.62h.01c7.16 0 12.99-5.82 12.99-12.98 0-3.47-1.35-6.73-3.8-9.18A12.9 12.9 0 0 0 16.003 3Zm0 23.7h-.01a10.8 10.8 0 0 1-5.5-1.5l-.4-.23-3.98 1.02 1.06-3.86-.26-.4a10.7 10.7 0 0 1-1.65-5.73c0-5.94 4.84-10.78 10.8-10.78 2.88 0 5.59 1.13 7.63 3.16a10.7 10.7 0 0 1 3.16 7.63c0 5.95-4.84 10.79-10.85 10.79Zm5.92-8.07c-.32-.16-1.92-.95-2.22-1.06-.3-.11-.51-.16-.73.16-.21.32-.84 1.06-1.03 1.27-.19.22-.38.24-.7.08-.32-.16-1.37-.5-2.6-1.6-.96-.86-1.61-1.92-1.8-2.24-.19-.32-.02-.5.14-.66.15-.14.32-.38.48-.57.16-.19.21-.32.32-.54.11-.21.05-.4-.03-.56-.08-.16-.73-1.75-1-2.4-.26-.63-.53-.54-.73-.55h-.62c-.21 0-.56.08-.86.4-.3.32-1.13 1.1-1.13 2.69 0 1.58 1.16 3.12 1.32 3.33.16.22 2.28 3.48 5.52 4.88.77.33 1.37.53 1.84.68.77.25 1.48.21 2.03.13.62-.09 1.92-.78 2.19-1.54.27-.76.27-1.4.19-1.54-.08-.13-.29-.21-.61-.37Z" />
      </svg>
    </a>
  );
}
