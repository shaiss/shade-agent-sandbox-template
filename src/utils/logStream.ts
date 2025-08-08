import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

type LogLevel = 'info' | 'error' | 'warn' | 'debug';

type LogEvent = {
  id: number;
  ts: string;
  level: LogLevel;
  message: string;
};

type Subscriber = (evt: LogEvent) => void;

const subscribers: Set<Subscriber> = new Set();
let nextId = 1;
const ringBuffer: LogEvent[] = [];
const RING_MAX = 300;

export function publish(level: LogLevel, message: string) {
  const evt: LogEvent = { id: nextId++, ts: new Date().toISOString(), level, message };
  ringBuffer.push(evt);
  if (ringBuffer.length > RING_MAX) ringBuffer.shift();
  for (const sub of subscribers) {
    try { sub(evt); } catch {}
  }
}

// Convenience wrappers that rely on console hook to broadcast
export const logInfo = (msg: string) => { console.log(msg); };
export const logError = (msg: string) => { console.error(msg); };
export const logWarn = (msg: string) => { console.warn(msg); };

export function attachSSE(c: Context) {
  return streamSSE(c, async (stream) => {
    // Send recent history first
    for (const evt of ringBuffer) {
      await stream.writeSSE({ data: JSON.stringify(evt), event: 'log' });
    }
    const handler: Subscriber = async (evt) => {
      try { await stream.writeSSE({ data: JSON.stringify(evt), event: 'log' }); } catch {}
    };
    subscribers.add(handler);
    try {
      await new Promise<void>((resolve) => {
        // keep open until client disconnects
        const onClose = () => { subscribers.delete(handler); resolve(); };
        // @ts-ignore - not all runtimes expose signal
        const signal: AbortSignal | undefined = c.req.raw?.signal;
        if (signal) signal.addEventListener('abort', onClose, { once: true });
      });
    } finally {
      subscribers.delete(handler);
    }
  });
}

function stringifyArg(arg: unknown): string {
  try {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.stack || arg.message;
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function hookConsole() {
  const origLog = console.log.bind(console);
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  const origDebug = console.debug.bind(console);

  console.log = (...args: unknown[]) => {
    try { publish('info', args.map(stringifyArg).join(' ')); } catch {}
    origLog(...args);
  };
  console.error = (...args: unknown[]) => {
    try { publish('error', args.map(stringifyArg).join(' ')); } catch {}
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    try { publish('warn', args.map(stringifyArg).join(' ')); } catch {}
    origWarn(...args);
  };
  console.debug = (...args: unknown[]) => {
    try { publish('debug', args.map(stringifyArg).join(' ')); } catch {}
    origDebug(...args);
  };
}


