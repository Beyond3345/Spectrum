// One connection for every event stream of the window. A browser, and the desktop app's WebKit, allow six connections
// to the backend; the project's events, TexLab, Tinymist, an agent's run, a local agent's session and a compile's log
// are each a stream held open, and with a compile's own request they used all six, so a save made meanwhile waited for
// the compile to end. Here they share one: the window holds a single EventSource (/api/stream/<window>), asks the
// backend to open or close a channel on it with a short request, and each stream's events come down it marked with
// the channel's number (routes/stream.js). StreamSource is used as an EventSource is, and behaves as one: it opens,
// dispatches named events and messages, connects again after its stream ends (with the last event's id, so a stream
// that numbers its events carries on where it stopped), and gives up after an answer that isn't 200.
// stream.check.ts keeps every `new EventSource` of the app in this file.

type Listener = (event: MessageEvent) => void;
type Sent = { hello?: true; c?: number; status?: number; frame?: string; end?: true };

/** The fields of one server-sent event, as the backend passes it on whole: { type, data, id, retry }, data null without any. */
export function readFrame(frame: string) {
  let type = 'message';
  let id: string | undefined;
  let retry: number | undefined;
  const data: string[] = [];
  for (const line of frame.split(/\r\n|\r|\n/)) {
    if (!line || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') type = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id') id = value;
    else if (field === 'retry' && /^\d+$/.test(value)) retry = Number(value);
  }
  return { type, data: data.length ? data.join('\n') : null, id, retry };
}

/** What the hub needs of the page: a way to open the shared connection and to ask for channels (the tests give their own). */
export interface StreamTransport {
  connect(windowId: string, on: { message(data: string): void; error(): void }): { readonly readyState: number; close(): void };
  post(path: string, body: unknown): Promise<unknown>;
  timer(fn: () => void, ms: number): unknown;
  cancel(timer: unknown): void;
}

const browser = (): StreamTransport => ({
  connect: (windowId, on) => {
    const source = new EventSource(`/api/stream/${windowId}`);
    source.onmessage = (event) => on.message(event.data);
    source.onerror = () => on.error();
    return source;
  },
  post: (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  timer: (fn, ms) => window.setTimeout(fn, ms),
  cancel: (timer) => window.clearTimeout(timer as number)
});

/** The window's shared connection and the streams on it. */
export class StreamHub {
  private outer: ReturnType<StreamTransport['connect']> | null = null;
  private ready = false;
  private channels = new Map<number, StreamSource>();
  private next = 1;
  readonly windowId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');

  constructor(readonly transport: StreamTransport = browser()) {}

  add(source: StreamSource) {
    const channel = this.next++;
    this.channels.set(channel, source);
    if (this.ready) this.open(channel, source);
    else if (!this.outer) this.connect();
    return channel;
  }

  remove(channel: number) {
    if (!this.channels.delete(channel)) return;
    if (this.ready) this.ask(channel, 'close', { channel });
  }

  /** Asks for the channel's stream (again, after it ended): nothing while the connection is down, which opens them all when it is back. */
  open(channel: number, source: StreamSource) {
    if (!this.ready || this.channels.get(channel) !== source) return;
    this.ask(channel, 'open', { channel, url: source.url, lastEventId: source.lastEventId });
  }

  // a channel's requests one after another: each goes on a connection of its own, and a close that overtook its open
  // would leave the stream running with nobody listening
  private asked = new Map<number, Promise<unknown>>();
  private ask(channel: number, what: 'open' | 'close', body: unknown) {
    const sent = (this.asked.get(channel) ?? Promise.resolve()).then(() => this.transport.post(`/api/stream/${this.windowId}/${what}`, body)).catch(() => undefined);
    this.asked.set(channel, sent);
    sent.then(() => this.asked.get(channel) === sent && this.asked.delete(channel));
  }

  private connect() {
    const outer = this.transport.connect(this.windowId, {
      message: (data) => {
        const sent = JSON.parse(data) as Sent;
        if (sent.hello) {
          // a new connection: the backend has none of the channels yet
          this.ready = true;
          for (const [channel, source] of this.channels) this.open(channel, source);
          return;
        }
        const source = this.channels.get(sent.c ?? 0);
        if (!source) return;
        if (sent.status !== undefined) source.answered(sent.status);
        else if (sent.frame !== undefined) source.received(sent.frame);
        else if (sent.end) source.ended();
      },
      error: () => {
        // the browser connects again by itself unless the answer wasn't a stream at all; either way every stream on
        // it is cut off, as its own connection would have been
        const gone = outer.readyState === 2;
        this.ready = false;
        if (gone) {
          outer.close();
          this.outer = null;
        }
        for (const source of [...this.channels.values()]) source.lost(gone);
      }
    });
    this.outer = outer;
  }
}

let hub: StreamHub | null = null;

/** An event stream of the backend's, by its address: an EventSource in all but the connection, which the window's streams share. */
export class StreamSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readyState = 0;
  lastEventId = '';
  onopen: ((event: Event) => void) | null = null;
  onmessage: Listener | null = null;
  onerror: ((event: Event) => void) | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private retry = 3000;
  private waiting: unknown = null;
  private channel: number;
  private hub: StreamHub;

  constructor(readonly url: string, on: StreamHub = (hub ??= new StreamHub())) {
    this.hub = on;
    this.channel = on.add(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    if (this.readyState === 2) return;
    this.readyState = 2;
    this.hub.transport.cancel(this.waiting);
    this.hub.remove(this.channel);
  }

  private dispatch(event: Event) {
    // (an EventSource's onerror hears an event the server names "error" too)
    if (event.type === 'open') this.onopen?.(event);
    else if (event.type === 'error') this.onerror?.(event);
    else if (event.type === 'message') this.onmessage?.(event as MessageEvent);
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) listener(event as MessageEvent);
  }

  /** The backend's answer for the stream: 200 opens it, anything else ends it for good, as for an EventSource. */
  answered(status: number) {
    if (this.readyState === 2) return;
    if (status === 200) {
      this.readyState = 1;
      this.dispatch(new Event('open'));
    } else this.failed();
  }

  received(frame: string) {
    if (this.readyState !== 1) return;
    const { type, data, id, retry } = readFrame(frame);
    if (id !== undefined) this.lastEventId = id;
    if (retry !== undefined) this.retry = retry;
    if (data !== null) this.dispatch(new MessageEvent(type, { data, lastEventId: this.lastEventId }));
  }

  /** The stream ended at the backend: asked for again after a pause, from the last event's id. */
  ended() {
    if (this.readyState === 2) return;
    this.readyState = 0;
    this.dispatch(new Event('error'));
    if (this.readyState !== 0) return;
    this.hub.transport.cancel(this.waiting);
    this.waiting = this.hub.transport.timer(() => this.hub.open(this.channel, this), this.retry);
  }

  /** The shared connection dropped: connecting again with it, or over when it won't come back (gone). */
  lost(gone: boolean) {
    if (this.readyState === 2) return;
    this.hub.transport.cancel(this.waiting);
    if (gone) return this.failed();
    this.readyState = 0;
    this.dispatch(new Event('error'));
  }

  private failed() {
    this.readyState = 2;
    this.hub.remove(this.channel);
    this.dispatch(new Event('error'));
  }
}
