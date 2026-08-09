export type NoticeType = "success" | "error" | "info";
export function notify(message: string, type: NoticeType = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("greenbridge:notice", { detail: { message, type } }));
}
