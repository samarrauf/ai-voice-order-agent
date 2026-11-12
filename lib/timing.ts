// Server-side stopwatch for the API routes.
//
// Every response gets a standard `Server-Timing` header, e.g.
//   Server-Timing: auth;dur=0.2, parse;dur=0.4, db;dur=38.1, total;dur=39.6
// so latency can be measured exactly from anywhere (curl, browser devtools),
// without the caller's own internet distance getting mixed in.
// The same numbers are logged as one line, so real Vapi calls can be checked
// in the Vercel logs.
//
// Only durations and step names are exposed — never request data.

export type Timer = {
  /** Records the time since the previous lap (or the start) under `name`. */
  lap(name: string): void;
  /** Adds the Server-Timing header, logs one line, and returns the response. */
  finish<T extends Response>(route: string, response: T): T;
};

export function startTimer(): Timer {
  const start = performance.now();
  let last = start;
  const laps: { name: string; ms: number }[] = [];

  return {
    lap(name) {
      const now = performance.now();
      laps.push({ name, ms: now - last });
      last = now;
    },
    finish(route, response) {
      const all = [...laps, { name: "total", ms: performance.now() - start }];
      response.headers.set(
        "Server-Timing",
        all.map((l) => `${l.name};dur=${l.ms.toFixed(1)}`).join(", "),
      );
      console.log(
        `[timing] ${route} ${response.status} ${all.map((l) => `${l.name}=${Math.round(l.ms)}ms`).join(" ")}`,
      );
      return response;
    },
  };
}

/**
 * Wraps a route handler so every response — including early error returns —
 * gets timed. The handler receives the timer to record its own laps.
 */
export function timed<Req extends Request>(
  route: string,
  handler: (request: Req, timer: Timer) => Promise<Response>,
): (request: Req) => Promise<Response> {
  return async (request) => {
    const timer = startTimer();
    const response = await handler(request, timer);
    return timer.finish(route, response);
  };
}
