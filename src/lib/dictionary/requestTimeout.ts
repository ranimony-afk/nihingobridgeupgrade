/** Bound browser-side waiting independently of the server's SQL statement budget. */
export const DICTIONARY_REQUEST_TIMEOUT_MS = 15_000;

export function createDictionaryRequestSignal(parent?: AbortSignal) {
  const controller = new AbortController();
  let timedOut = false;
  const forwardAbort = () => controller.abort();
  if (parent?.aborted) forwardAbort();
  else parent?.addEventListener("abort", forwardAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DICTIONARY_REQUEST_TIMEOUT_MS);

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", forwardAbort);
    },
  };
}
