// The Live view's frame (EditorPage): Tinymist's preview page, from an address of its own. A window that refuses to
// frame it shows nothing at all, so the view says why instead: at once when the page's policy refuses it, and after
// a few seconds when the frame still holds a page of the app's own address (about:blank, which the desktop shell
// leaves when it cancels the load) rather than Tinymist's, which the app can't read.

type Frame = { readonly src: string; readonly contentWindow: { readonly location: { readonly href: string } } | null };
type Events = Pick<Document, 'addEventListener' | 'removeEventListener'>;

/** Calls fail(why) once if frame doesn't show its page within ms; the returned function stops watching. */
export function watchLiveFrame(frame: Frame, fail: (why: string) => void, ms = 5000, events: Events = document): () => void {
  const origin = new URL(frame.src).origin;
  let done = false;
  const once = (why: string) => {
    if (done) return;
    done = true;
    stop();
    fail(why);
  };
  const refused = (event: Event) => {
    const { blockedURI = '' } = event as SecurityPolicyViolationEvent;
    if (blockedURI.startsWith(origin)) once('This window refused Tinymist’s preview page.');
  };
  const timer = setTimeout(() => {
    // ponytail: an error page of the browser's own (Tinymist gone) reads as shown; the backend has just started the preview
    let ours = true;
    try {
      void frame.contentWindow?.location.href;
    } catch {
      ours = false;
    }
    if (ours) once('Tinymist’s preview page didn’t open in this window.');
  }, ms);
  events.addEventListener('securitypolicyviolation', refused);
  function stop() {
    done = true;
    clearTimeout(timer);
    events.removeEventListener('securitypolicyviolation', refused);
  }
  return stop;
}
