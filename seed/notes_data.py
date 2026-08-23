# -*- coding: utf-8 -*-
"""
100 real, hand-written technical notes for DevMind seed data.
Each note has explicit collection + tags (no random assignment).
Content is diverse in phrasing on purpose — some notes describe the
SAME underlying concept using different vocabulary, so semantic search
can be meaningfully compared against keyword search.

Structure: list of dicts:
{
  "title": str,
  "content": str,
  "collection": str,   # must match a name in COLLECTIONS
  "tags": [str, ...],  # must match names in TAGS
}
"""

COLLECTIONS = [
    "Node.js", "React", "Docker & DevOps", "Python",
    "Database", "Security", "TypeScript", "System Design",
]

TAGS = [
    "react", "node", "docker", "python", "typescript", "postgres",
    "redis", "jwt", "testing", "git", "architecture", "performance",
    "nextjs", "graphql", "security", "devops", "kubernetes",
    "express", "mongodb", "nginx",
]

NOTES = []

# ============================================================
# NODE.JS (14 notes)
# ============================================================
NOTES += [
{
    "title": "Fixing ERR_HTTP_HEADERS_SENT in Express",
    "content": "This error happens when res.send() or res.json() is called more than once on the same response. Common cause: forgetting to return after sending a response inside an if-block, so the code falls through to another res.send() later. Fix: always `return res.status(400).json({error})` instead of just calling it without return. In async middleware, make sure every code path terminates with exactly one response call.",
    "collection": "Node.js",
    "tags": ["express", "node"],
},
{
    "title": "Express error-handling middleware order matters",
    "content": "Error-handling middleware in Express must be defined last, after all routes, and must take exactly 4 arguments (err, req, res, next) or Express won't recognize it as an error handler. If you throw inside an async route handler without a try/catch, Express 4 will NOT catch it automatically — you need express-async-errors or Express 5 (which supports async rejection catching natively).",
    "collection": "Node.js",
    "tags": ["express", "node"],
},
{
    "title": "Streaming large files in Node without loading into memory",
    "content": "Use fs.createReadStream() piped directly into the response instead of fs.readFile(). For an Express route: `fs.createReadStream(path).pipe(res)`. This keeps memory usage flat regardless of file size because Node streams the file in chunks rather than buffering the whole thing. For remote files, pipe the incoming stream from an HTTP request straight into the outgoing response.",
    "collection": "Node.js",
    "tags": ["node", "performance"],
},
{
    "title": "Understanding the Node.js event loop phases",
    "content": "The event loop has distinct phases: timers (setTimeout/setInterval callbacks), pending callbacks, poll (retrieving new I/O events), check (setImmediate callbacks), and close callbacks. process.nextTick() and Promise microtasks run between every phase, not as a separate phase — this is why nextTick can starve I/O if called recursively.",
    "collection": "Node.js",
    "tags": ["node", "architecture"],
},
{
    "title": "Graceful shutdown for a Node HTTP server",
    "content": "On SIGTERM, stop accepting new connections with server.close(), then wait for in-flight requests to finish before exiting. Close database connection pools inside the server.close() callback, not before, or you'll error out requests that are still running. Set a hard timeout (e.g. 10s) that force-exits if close() hangs, common when a keep-alive socket refuses to die.",
    "collection": "Node.js",
    "tags": ["node", "devops"],
},
{
    "title": "Cluster module vs worker_threads: when to use which",
    "content": "cluster forks full Node processes and is best for scaling HTTP servers across CPU cores since each worker gets its own event loop and memory space. worker_threads share memory via SharedArrayBuffer and are better suited for CPU-bound tasks like image processing or heavy computation within a single request, without the overhead of spinning up a whole process.",
    "collection": "Node.js",
    "tags": ["node", "performance", "architecture"],
},
{
    "title": "Debugging memory leaks in a long-running Node process",
    "content": "Take heap snapshots with `node --inspect` and Chrome DevTools at two points in time, then compare. Look for objects whose count keeps growing across snapshots — usually caused by event listeners never removed (use .off() or {once:true}), closures holding references in a cache with no eviction, or timers that are never cleared.",
    "collection": "Node.js",
    "tags": ["node", "performance"],
},
{
    "title": "Rate limiting an Express API with a sliding window",
    "content": "express-rate-limit's default fixed-window algorithm allows bursts at window boundaries. For a sliding window, use a Redis sorted set: on each request, add the current timestamp as a member, remove entries older than the window, then count remaining members against the limit. This smooths out the boundary-burst problem of fixed windows.",
    "collection": "Node.js",
    "tags": ["node", "redis", "security"],
},
{
    "title": "Environment variable validation at startup",
    "content": "Don't let a missing env var crash the app three requests in — validate all required config at boot using a schema library like zod or envalid. Fail fast with a clear error message listing exactly which variables are missing, before the server starts listening, rather than letting undefined values silently propagate into runtime bugs.",
    "collection": "Node.js",
    "tags": ["node", "architecture"],
},
{
    "title": "Why require() caches modules and how to bust it",
    "content": "Node caches modules by resolved file path after the first require() call — subsequent requires return the same object reference, which is why singletons (like a DB connection) work naturally. To force a fresh load (rare, mostly for hot-reloading in dev), delete the entry from require.cache[require.resolve(path)] before requiring again.",
    "collection": "Node.js",
    "tags": ["node"],
},
{
    "title": "Handling unhandled promise rejections gracefully",
    "content": "Register a process-level handler: `process.on('unhandledRejection', (reason) => {...})`. Log the reason with full stack trace and ideally exit the process after logging, since an unhandled rejection usually means the app is in an inconsistent state. Don't just swallow it silently — that hides real bugs until they cause data corruption.",
    "collection": "Node.js",
    "tags": ["node", "architecture"],
},
{
    "title": "Connection pooling gotchas with pg (node-postgres)",
    "content": "Always release a client back to the pool in a finally block — `client.release()` — or the pool will eventually exhaust and every new query will hang waiting for a free connection. Set a reasonable pool max (start around 10-20 depending on DB plan) and idleTimeoutMillis so stale connections get recycled instead of piling up.",
    "collection": "Node.js",
    "tags": ["node", "postgres"],
},
{
    "title": "Building a simple job queue with BullMQ and Redis",
    "content": "BullMQ separates producers (who add jobs) from workers (who process them), backed by Redis lists and sorted sets. Use it for anything that shouldn't block the HTTP response: sending emails, generating reports, resizing images. Configure retries with exponential backoff and a dead-letter queue for jobs that fail repeatedly so they don't vanish silently.",
    "collection": "Node.js",
    "tags": ["node", "redis", "architecture"],
},
{
    "title": "CORS misconfiguration: the wildcard-with-credentials trap",
    "content": "Setting Access-Control-Allow-Origin: '*' together with credentials: true will make the browser reject the response — you can't combine a wildcard origin with cookies/auth headers. Instead, reflect the specific request origin dynamically (validated against an allowlist) when credentials are needed.",
    "collection": "Node.js",
    "tags": ["node", "express", "security"],
},
]

# ============================================================
# REACT (13 notes)
# ============================================================
NOTES += [
{
    "title": "Optimizing React re-renders with React.memo and useCallback",
    "content": "React.memo skips re-rendering a component if its props are shallowly equal to the previous render. But it's useless if you pass a new function reference every render — wrap that function in useCallback so its identity stays stable across renders. Same idea for object/array props: use useMemo to keep the reference stable.",
    "collection": "React",
    "tags": ["react", "performance"],
},
{
    "title": "Why your useEffect runs twice in development",
    "content": "React 18 Strict Mode intentionally mounts, unmounts, and remounts components in development to help you find effects that aren't properly cleaned up. It's not a bug — if your effect breaks on double-invocation, it means your cleanup function is missing or incomplete. This double-run does not happen in production builds.",
    "collection": "React",
    "tags": ["react"],
},
{
    "title": "Avoiding stale closures inside useEffect",
    "content": "If an effect reads a state variable but that variable isn't in the dependency array, the effect captures the value from whichever render it was created in — a 'stale closure'. Either add the variable to the deps array, or use a functional state update (setState(prev => ...)) which doesn't need the current value from the closure at all.",
    "collection": "React",
    "tags": ["react"],
},
{
    "title": "useReducer vs useState: when the switch is worth it",
    "content": "Reach for useReducer when the next state depends on multiple related pieces of the previous state, or when several event handlers update the same state shape in different ways. It centralizes the update logic in one reducer function, which is easier to test and reason about than several scattered setState calls.",
    "collection": "React",
    "tags": ["react", "architecture"],
},
{
    "title": "Lifting state up vs Context vs external store",
    "content": "Lift state to the nearest common parent when only a few components need it. Reach for Context when state needs to reach deeply nested components without prop drilling, but be aware every consumer re-renders on any context value change. For frequently-changing global state read by many unrelated components, an external store like Zustand avoids the re-render-everything problem of Context.",
    "collection": "React",
    "tags": ["react", "architecture"],
},
{
    "title": "Controlled vs uncontrolled form inputs",
    "content": "A controlled input's value is driven entirely by React state (value + onChange) — React is the single source of truth. An uncontrolled input keeps its own DOM state and you read it via a ref (e.g. on submit). Uncontrolled is simpler for large forms where you don't need per-keystroke validation; controlled is necessary when you need to validate, format, or react to input as the user types.",
    "collection": "React",
    "tags": ["react"],
},
{
    "title": "Debugging why a key prop warning appears in a list",
    "content": "React uses the key prop to match array items between renders so it can reuse DOM nodes efficiently instead of destroying and recreating them. Using the array index as key breaks this when items are reordered, inserted, or removed — React will misattribute state to the wrong item. Always use a stable, unique ID from your data instead of the index.",
    "collection": "React",
    "tags": ["react", "performance"],
},
{
    "title": "React Query vs manual useEffect fetching",
    "content": "Manual fetch-in-useEffect means you're re-implementing caching, request deduplication, retry logic, and race-condition handling (an older request resolving after a newer one) by hand every time. React Query (TanStack Query) handles all of that out of the box, plus background refetching and stale-while-revalidate caching, which is why most production apps reach for it instead of raw useEffect fetching.",
    "collection": "React",
    "tags": ["react", "architecture"],
},
{
    "title": "Preventing layout shift with skeleton loaders",
    "content": "If a loading spinner is centered in a small box and then replaced by full content, the page jumps — this hurts Cumulative Layout Shift score. Instead, render a skeleton placeholder that reserves the same height/width as the eventual content, so the layout stays stable while data loads.",
    "collection": "React",
    "tags": ["react", "performance"],
},
{
    "title": "Custom hooks: extracting logic without extracting UI",
    "content": "A custom hook is just a function starting with 'use' that calls other hooks internally — it lets you share stateful logic (like a debounced value, a fetch-with-loading-state pattern, or a window-resize listener) across components without sharing any rendered markup. Unlike a HOC, it doesn't add a wrapper component to the tree.",
    "collection": "React",
    "tags": ["react", "architecture"],
},
{
    "title": "React portals for modals and tooltips",
    "content": "createPortal renders children into a DOM node outside the parent component's DOM hierarchy — typically a div#modal-root at the top of index.html — while keeping them inside the React component tree for context and event bubbling purposes. This solves z-index and overflow:hidden clipping issues that plague modals rendered inline.",
    "collection": "React",
    "tags": ["react"],
},
{
    "title": "Suspense for data fetching: what it actually does",
    "content": "Suspense lets a component 'pause' rendering and show a fallback while data is loading, by throwing a promise that Suspense catches. It's not a data-fetching library itself — it's a mechanism that libraries like React Query or Relay can plug into so loading states are declared once at a boundary instead of scattered through every component with its own isLoading flag.",
    "collection": "React",
    "tags": ["react", "architecture"],
},
{
    "title": "Testing React components with React Testing Library",
    "content": "RTL's philosophy is to test components the way a user interacts with them — query by visible text, label, or role, not by CSS class or component internals. Avoid testing implementation details like state variable names; if you refactor a component's internals without changing its behavior, the tests should still pass unchanged.",
    "collection": "React",
    "tags": ["react", "testing"],
},
]

# ============================================================
# DOCKER & DEVOPS (14 notes)
# ============================================================
NOTES += [
{
    "title": "Reducing a Docker image from 1.2GB to 150MB with multi-stage builds",
    "content": "Use a builder stage with the full SDK/toolchain to install dependencies and compile, then a final stage FROM a slim or alpine base that only COPYs the compiled output and production dependencies. The builder stage's layers (dev tools, source cache, build artifacts) never make it into the final image, since only the last stage is tagged and shipped.",
    "collection": "Docker & DevOps",
    "tags": ["docker", "performance"],
},
{
    "title": "Docker layer caching: ordering COPY and RUN correctly",
    "content": "Copy package.json and run npm install BEFORE copying the rest of the source code. Docker caches each layer and only invalidates it (and everything after it) when its inputs change — if you copy all source first, every code change busts the dependency-install layer too, forcing a full reinstall on every build.",
    "collection": "Docker & DevOps",
    "tags": ["docker", "performance"],
},
{
    "title": "Why my container exits immediately after docker run",
    "content": "A container stays alive only as long as its PID 1 process is running. If your CMD/ENTRYPOINT is a script that finishes (e.g. it starts a background daemon with & and then returns), the container exits right after because the foreground process ended. Run the actual server process in the foreground as PID 1, not as a backgrounded child.",
    "collection": "Docker & DevOps",
    "tags": ["docker"],
},
{
    "title": "Docker Compose healthchecks and depends_on with condition",
    "content": "Plain depends_on only waits for the container to start, not for the service inside it to actually be ready — a Postgres container can be 'started' while the DB is still initializing. Add a healthcheck block to the DB service and use `depends_on: db: condition: service_healthy` on dependent services so they wait for the DB to actually accept connections.",
    "collection": "Docker & DevOps",
    "tags": ["docker", "postgres"],
},
{
    "title": "Kubernetes liveness vs readiness probes",
    "content": "A failing liveness probe causes Kubernetes to kill and restart the container — use it to detect a truly stuck/deadlocked process. A failing readiness probe just removes the pod from the Service's load-balancing endpoints without restarting it — use it for temporary states like 'still loading a large cache on startup' where restarting would just make things worse.",
    "collection": "Docker & DevOps",
    "tags": ["kubernetes", "devops"],
},
{
    "title": "Setting resource requests and limits in Kubernetes",
    "content": "requests are what the scheduler guarantees is reserved for the pod (used for bin-packing decisions across nodes); limits are the hard ceiling the pod cannot exceed. Setting a CPU limit lower than what your app needs under load causes CPU throttling, not a crash — this shows up as mysteriously slow response times rather than an OOMKilled event.",
    "collection": "Docker & DevOps",
    "tags": ["kubernetes", "devops", "performance"],
},
{
    "title": "GitHub Actions: caching node_modules between runs",
    "content": "Use actions/cache with a key based on the hash of package-lock.json (`hashFiles('**/package-lock.json')`). On a cache hit, subsequent npm install calls skip re-downloading packages that haven't changed, cutting CI time significantly for projects with heavy dependency trees.",
    "collection": "Docker & DevOps",
    "tags": ["devops", "git"],
},
{
    "title": "Blue-green vs canary deployment strategies",
    "content": "Blue-green keeps two full identical environments and switches all traffic at once from the old (blue) to the new (green) version — rollback is instant since blue is still running. Canary instead routes a small percentage of traffic to the new version first, gradually increasing it while watching error rates, which catches bugs before they hit everyone but takes longer to fully roll out.",
    "collection": "Docker & DevOps",
    "tags": ["devops", "architecture"],
},
{
    "title": "Nginx as a reverse proxy for a Node app: minimal config",
    "content": "proxy_pass http://localhost:3000; alone isn't enough — you also need proxy_set_header Host $host, X-Real-IP $remote_addr, and X-Forwarded-For to preserve the original client info, since without these your Node app sees every request as coming from 127.0.0.1. Also set proxy_http_version 1.1 and Connection '' to enable keep-alive to the upstream.",
    "collection": "Docker & DevOps",
    "tags": ["nginx", "devops"],
},
{
    "title": "Nginx rate limiting with limit_req_zone",
    "content": "Define a shared memory zone keyed by client IP: `limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;` then apply it in a location block with `limit_req zone=api burst=20 nodelay;`. The burst parameter allows short spikes above the steady rate before requests start getting 503'd, which avoids punishing normal bursty browser behavior.",
    "collection": "Docker & DevOps",
    "tags": ["nginx", "security"],
},
{
    "title": "Zero-downtime deploys with Docker Compose and a reverse proxy",
    "content": "Start the new container version alongside the old one on a different internal port, wait for its healthcheck to pass, then flip the reverse proxy (nginx or Traefik) to point at the new container, and only then stop the old one. Killing the old container before the new one is healthy causes a request-dropping gap.",
    "collection": "Docker & DevOps",
    "tags": ["docker", "nginx", "devops"],
},
{
    "title": "Debugging a container that can't reach another container",
    "content": "Containers on the default Docker bridge network can't resolve each other by name — only containers on a user-defined network (or the network Compose creates automatically for a project) get automatic DNS resolution by service name. Check with `docker network inspect` that both containers are actually on the same network before assuming it's an app-level bug.",
    "collection": "Docker & DevOps",
    "tags": ["docker"],
},
{
    "title": "Secrets management: env vars vs Docker secrets vs a vault",
    "content": "Plain env vars are visible via `docker inspect` and process listing, which is fine for non-sensitive config but risky for API keys. Docker secrets (Swarm) or Kubernetes Secrets mount values as files instead of env vars, reducing accidental leakage via logs or crash dumps. For anything truly sensitive in production, a dedicated vault (HashiCorp Vault, AWS Secrets Manager) with rotation is worth the extra setup.",
    "collection": "Docker & DevOps",
    "tags": ["docker", "security", "devops"],
},
{
    "title": "CI pipeline stages: lint, test, build, deploy — why order matters",
    "content": "Run the cheapest, fastest checks first (lint takes seconds) so a trivial style error fails the pipeline in 10 seconds instead of after a 5-minute build. Fail fast: each stage should only run if the previous one passed, saving CI minutes and giving faster feedback to the developer who pushed the broken code.",
    "collection": "Docker & DevOps",
    "tags": ["devops", "git", "testing"],
},
]

# ============================================================
# PYTHON (13 notes)
# ============================================================
NOTES += [
{
    "title": "Using asyncio.gather for concurrent API calls",
    "content": "asyncio.gather runs multiple coroutines concurrently and returns their results in the same order once all complete: `results = await asyncio.gather(*[fetch(url) for url in urls])`. If one coroutine raises, gather immediately propagates that exception by default — pass return_exceptions=True if you want failed calls to return their exception object instead of cancelling the whole batch.",
    "collection": "Python",
    "tags": ["python"],
},
{
    "title": "Why mutable default arguments are a classic Python bug",
    "content": "`def f(items=[])` creates the list ONCE at function definition time, not on every call — so mutations from one call leak into the next call's 'default' value. Always use `def f(items=None): items = items or []` inside the function body instead.",
    "collection": "Python",
    "tags": ["python"],
},
{
    "title": "GIL and why threading doesn't speed up CPU-bound Python",
    "content": "The Global Interpreter Lock ensures only one thread executes Python bytecode at a time, so threading gives no speedup for CPU-bound work (it can even be slower due to context-switch overhead). Threading still helps for I/O-bound work (waiting on network/disk) because the GIL is released during blocking I/O calls. For real CPU parallelism, use multiprocessing instead, which runs separate processes with separate GILs.",
    "collection": "Python",
    "tags": ["python", "performance", "architecture"],
},
{
    "title": "Context managers beyond 'with open()'",
    "content": "Any object implementing __enter__ and __exit__ works with `with`. Use contextlib.contextmanager to write one as a generator function with a single yield — code before yield is __enter__, code after (in a try/finally) is __exit__. Useful for things like temporarily changing a working directory or acquiring/releasing a lock, guaranteeing cleanup even if an exception occurs inside the block.",
    "collection": "Python",
    "tags": ["python"],
},
{
    "title": "Type hints with mypy: catching bugs before runtime",
    "content": "Python type hints (def f(x: int) -> str) aren't enforced at runtime by default — they're purely for static analysis tools like mypy and for IDE autocomplete. Running `mypy .` in CI catches type mismatches (passing a string where an int was declared) before the code ever runs, similar to what TypeScript's compiler does for JS.",
    "collection": "Python",
    "tags": ["python", "testing"],
},
{
    "title": "Virtual environments: venv vs Poetry vs conda",
    "content": "venv (built into Python 3) creates an isolated site-packages directory but you manage requirements.txt by hand. Poetry adds a lockfile (poetry.lock) for reproducible installs and handles dependency resolution more robustly, similar to npm's package-lock.json. conda is heavier but necessary when you need non-Python binary dependencies (like specific CUDA versions) that pip can't manage.",
    "collection": "Python",
    "tags": ["python"],
},
{
    "title": "List comprehension vs generator expression: when memory matters",
    "content": "`[x*2 for x in range(1000000)]` builds the entire list in memory immediately. `(x*2 for x in range(1000000))` is a generator — it computes each value lazily on demand and never holds more than one item in memory at a time. Use generators when you're going to iterate once and don't need random access or len().",
    "collection": "Python",
    "tags": ["python", "performance"],
},
{
    "title": "Decorators explained with a practical caching example",
    "content": "functools.lru_cache is a decorator that wraps a function so repeated calls with the same arguments return a cached result instead of recomputing. Writing your own decorator is just a function that takes a function and returns a wrapped version of it — useful for logging, timing, retry logic, or auth checks without repeating that logic in every function.",
    "collection": "Python",
    "tags": ["python"],
},
{
    "title": "Dataclasses vs plain classes vs Pydantic models",
    "content": "@dataclass auto-generates __init__, __repr__, and __eq__ from type-annotated fields, cutting boilerplate for simple data containers. Pydantic goes further by validating and coercing types at instantiation (raising if a required field is missing or the wrong type), which is why it's the standard choice for FastAPI request/response models where you actually need runtime validation, not just static typing.",
    "collection": "Python",
    "tags": ["python", "architecture"],
},
{
    "title": "Debugging with pdb: breakpoints without an IDE",
    "content": "Insert `breakpoint()` (Python 3.7+) at the line you want to pause on — it drops you into an interactive pdb shell at that exact point. From there, 'n' steps to the next line, 's' steps into a function call, 'c' continues execution, and 'p variable_name' prints a value. Faster than sprinkling print statements when you need to inspect state at a specific moment.",
    "collection": "Python",
    "tags": ["python", "testing"],
},
{
    "title": "FastAPI dependency injection with Depends",
    "content": "A function passed to Depends() runs before the route handler and its return value is injected as a parameter — commonly used for getting a DB session, validating a JWT and returning the current user, or checking permissions. FastAPI resolves the dependency tree automatically, including nested dependencies, and caches a dependency's result per-request if it's used more than once.",
    "collection": "Python",
    "tags": ["python", "jwt", "architecture"],
},
{
    "title": "pytest fixtures vs setUp/tearDown from unittest",
    "content": "unittest's setUp/tearDown run for every test in a class with no way to share expensive setup across classes. pytest fixtures are functions decorated with @pytest.fixture that can be scoped (function, class, module, session) so an expensive resource like a DB connection is created once per test session instead of once per test, and are composable — a test just declares the fixture names it needs as parameters.",
    "collection": "Python",
    "tags": ["python", "testing"],
},
{
    "title": "Why 'except Exception' is usually too broad",
    "content": "Catching the base Exception class swallows bugs you didn't anticipate — a typo causing an AttributeError gets silently caught right alongside the network error you actually meant to handle. Catch the most specific exception type possible (requests.ConnectionError, not Exception), and if you must catch broadly for a top-level handler, always re-raise or log the full traceback rather than passing silently.",
    "collection": "Python",
    "tags": ["python"],
},
]

# ============================================================
# DATABASE (13 notes)
# ============================================================
NOTES += [
{
    "title": "PostgreSQL full-text search with weighted columns",
    "content": "Build a tsvector combining multiple columns with different weights: `setweight(to_tsvector(title), 'A') || setweight(to_tsvector(body), 'B')`. Query with to_tsquery or plainto_tsquery, and rank results with ts_rank so matches in the title (weight A) score higher than matches only in the body (weight B). Add a GIN index on the tsvector column or every search will do a full table scan.",
    "collection": "Database",
    "tags": ["postgres"],
},
{
    "title": "When a B-tree index doesn't help your query",
    "content": "A B-tree index on a column won't be used if you wrap that column in a function (WHERE LOWER(email) = ...) unless you index the expression itself (CREATE INDEX ON users (LOWER(email))). It also won't help a leading-wildcard LIKE '%term' search — for that you need trigram indexes (pg_trgm) or full-text search instead.",
    "collection": "Database",
    "tags": ["postgres", "performance"],
},
{
    "title": "Explaining EXPLAIN ANALYZE output",
    "content": "EXPLAIN shows the planned query execution steps; EXPLAIN ANALYZE actually runs the query and shows real timings per step. Look for 'Seq Scan' on a large table where you expected an index to be used — that's your signal the planner isn't using an available index, often because statistics are stale (run ANALYZE table_name) or the query wraps the column in a function.",
    "collection": "Database",
    "tags": ["postgres", "performance"],
},
{
    "title": "Database connection pooling: why you need PgBouncer even with app-level pooling",
    "content": "Your app's connection pool (e.g. pg's Pool) limits connections per app instance, but if you scale to 10 instances each with a pool of 20, that's 200 connections hitting Postgres — which has a hard max_connections limit (often 100) and gets expensive per connection in memory. PgBouncer sits between your app fleet and Postgres, multiplexing many app connections onto a smaller set of real DB connections.",
    "collection": "Database",
    "tags": ["postgres", "architecture", "performance"],
},
{
    "title": "MongoDB aggregation pipeline for reporting queries",
    "content": "Chain stages left to right: $match filters documents early (do this first to reduce data volume before expensive stages), $lookup joins another collection similar to a SQL JOIN, $unwind flattens an array field into separate documents, $group aggregates (sum, avg, count) by a key, and $sort/$limit for pagination. Put $match and $limit as early as possible in the pipeline for performance.",
    "collection": "Database",
    "tags": ["mongodb"],
},
{
    "title": "MongoDB schema design: embedding vs referencing",
    "content": "Embed related data directly in a document when it's read together and rarely updated independently (e.g. an address inside a user doc). Reference (store an ObjectId and do a separate query or $lookup) when the related data is large, updated independently, or accessed on its own frequently — embedding a growing array of thousands of comments inside a post document will eventually hit MongoDB's 16MB document size limit.",
    "collection": "Database",
    "tags": ["mongodb", "architecture"],
},
{
    "title": "Why your MongoDB query isn't using the index you created",
    "content": "Check with .explain('executionStats') — a common cause is a compound index where the query doesn't follow the ESR rule (Equality fields first, then Sort fields, then Range fields) matching the index's field order. An index on {a:1, b:1} won't be used efficiently for a query that filters only on b.",
    "collection": "Database",
    "tags": ["mongodb", "performance"],
},
{
    "title": "Redis as a cache: TTL strategy and cache stampede prevention",
    "content": "Set a TTL on every cache key so stale data eventually self-corrects even if you forget to invalidate it manually. For high-traffic keys, a cache stampede happens when the key expires and many concurrent requests all miss the cache simultaneously and hammer the DB at once — mitigate with a short random jitter on TTLs so keys don't all expire at the same instant, or a lock so only one request recomputes while others wait.",
    "collection": "Database",
    "tags": ["redis", "performance"],
},
{
    "title": "Redis data structures beyond simple key-value: sorted sets for leaderboards",
    "content": "A sorted set (ZADD/ZRANGE) stores members with a score and keeps them ordered automatically, making it a natural fit for leaderboards, rate-limiting windows, or priority queues — ZRANGEBYSCORE and ZRANK give you range queries and ranking in O(log N) without loading the entire dataset into your app to sort it.",
    "collection": "Database",
    "tags": ["redis"],
},
{
    "title": "Database migrations: why you should never edit an already-run migration",
    "content": "Once a migration has run in any shared environment (staging, prod), editing its file instead of writing a new migration means environments diverge silently — a fresh environment running migrations from scratch will end up in a different state than one that already ran the old version. Always add a new migration to fix a mistake, never rewrite history.",
    "collection": "Database",
    "tags": ["postgres", "architecture"],
},
{
    "title": "Choosing between SQL and NoSQL: it's about access patterns, not scale",
    "content": "The 'NoSQL scales better' framing is outdated — Postgres handles massive scale fine for most apps. The real question is your access pattern: relational data with complex multi-table queries and strong consistency needs (financial records, anything with foreign-key integrity requirements) fits SQL naturally. Document-shaped data that's read/written as a whole unit with a flexible, evolving schema fits MongoDB's model better.",
    "collection": "Database",
    "tags": ["postgres", "mongodb", "architecture"],
},
{
    "title": "Database transactions and isolation levels explained simply",
    "content": "READ COMMITTED (Postgres default) prevents reading uncommitted data from other transactions but allows non-repeatable reads (the same row can return different values if read twice in one transaction, if another transaction commits in between). SERIALIZABLE is the strictest — transactions behave as if run one at a time — but has the most performance cost and can cause serialization failures requiring retry logic.",
    "collection": "Database",
    "tags": ["postgres", "architecture"],
},
{
    "title": "N+1 query problem and how ORMs cause it silently",
    "content": "Fetching a list of posts then looping to fetch each post's author separately (1 query + N queries) instead of a single JOIN or a batched IN query is the classic N+1 problem. ORMs make this easy to write accidentally via lazy-loaded relations — use eager loading (Sequelize's `include`, Prisma's `include`, or a manual JOIN) when you know upfront you'll need the related data.",
    "collection": "Database",
    "tags": ["postgres", "performance", "architecture"],
},
]

# ============================================================
# SECURITY (12 notes)
# ============================================================
NOTES += [
{
    "title": "Invalidating JWT tokens on password change",
    "content": "JWTs are stateless by design, so you can't 'delete' an issued token server-side. Add a tokenVersion field to the user model, embed it in the JWT payload at signing time, and increment it whenever the password changes. On every request, compare the token's version against the current DB value — a mismatch means the token was issued before the password change and should be rejected.",
    "collection": "Security",
    "tags": ["jwt", "security"],
},
{
    "title": "Access tokens vs refresh tokens: why you need both",
    "content": "A short-lived access token (5-15 min) limits the damage window if it's stolen, since it expires quickly. A longer-lived refresh token, stored more securely (httpOnly cookie, not localStorage) and used only to mint new access tokens, means the user doesn't have to re-login every 15 minutes. Refresh tokens should be revocable server-side (stored in DB) since long-lived tokens are a bigger risk if leaked.",
    "collection": "Security",
    "tags": ["jwt", "security"],
},
{
    "title": "Why storing JWTs in localStorage is risky",
    "content": "localStorage is accessible to any JavaScript running on the page, so a single XSS vulnerability anywhere in your app (even in a third-party script) lets an attacker read and exfiltrate the token. httpOnly cookies aren't readable by JavaScript at all, which closes that specific attack vector — though cookies bring their own concern (CSRF) that needs a SameSite attribute or CSRF token to mitigate.",
    "collection": "Security",
    "tags": ["jwt", "security"],
},
{
    "title": "Password hashing: why bcrypt over plain SHA-256",
    "content": "SHA-256 is fast by design, which is exactly wrong for password storage — fast hashing means an attacker with a stolen hash database can brute-force billions of guesses per second on GPUs. bcrypt (and argon2, scrypt) are deliberately slow and have a configurable cost/work factor you can increase over time as hardware gets faster, keeping brute-force attacks impractical.",
    "collection": "Security",
    "tags": ["security"],
},
{
    "title": "SQL injection: why parameterized queries fully solve it",
    "content": "String-concatenating user input into a SQL query (`\"SELECT * FROM users WHERE email = '\" + input + \"'\"`) lets an attacker break out of the string context entirely. Parameterized queries (using ? or $1 placeholders with a separate values array) send the query structure and the data separately to the DB driver, so user input is never interpreted as SQL syntax no matter what characters it contains.",
    "collection": "Security",
    "tags": ["security", "postgres"],
},
{
    "title": "Preventing NoSQL injection in MongoDB queries",
    "content": "If you pass req.body directly into a Mongo query filter without validation, an attacker can send `{\"password\": {\"$ne\": null}}` as the password field, and MongoDB will interpret that as an operator instead of a literal string — potentially bypassing auth. Validate and sanitize input types explicitly (e.g. with a schema library), and consider using mongo-sanitize to strip keys starting with $ or containing dots.",
    "collection": "Security",
    "tags": ["security", "mongodb"],
},
{
    "title": "CSRF explained: why SameSite cookies help but aren't a complete fix",
    "content": "SameSite=Strict or Lax on a cookie stops it from being sent on cross-site requests, which blocks most CSRF attacks that rely on the browser auto-attaching cookies. But it doesn't help if the attack is a same-site issue, or for older browsers that don't support SameSite. A CSRF token (a random value in a hidden form field, verified server-side) is the more complete, defense-in-depth solution.",
    "collection": "Security",
    "tags": ["security"],
},
{
    "title": "XSS: the difference between stored, reflected, and DOM-based",
    "content": "Stored XSS is when malicious script gets saved to the DB (e.g. in a comment) and served to every future visitor. Reflected XSS bounces the payload straight from a URL parameter into the page's HTML in the same response, requiring a victim to click a crafted link. DOM-based XSS never touches the server at all — vulnerable client-side JS writes untrusted data (like location.hash) directly into the DOM via innerHTML.",
    "collection": "Security",
    "tags": ["security"],
},
{
    "title": "Rate limiting login attempts to prevent brute force",
    "content": "Limit failed login attempts per account AND per IP separately — per-account-only limiting lets an attacker try many different accounts from one IP without tripping any limit, while per-IP-only limiting is defeated by a botnet. After N failures, add exponential backoff or a CAPTCHA rather than a hard lockout, since a hard lockout itself becomes a denial-of-service vector against a specific user.",
    "collection": "Security",
    "tags": ["security"],
},
{
    "title": "Content Security Policy (CSP): a second layer against XSS",
    "content": "A CSP header tells the browser which sources of scripts, styles, and other resources are allowed to load — even if an attacker manages to inject a `<script src='evil.com'>` tag via XSS, the browser will refuse to execute it if evil.com isn't in the allowlist. Start with a report-only policy to see what would break before enforcing it, since a too-strict CSP can silently break legitimate third-party widgets.",
    "collection": "Security",
    "tags": ["security"],
},
{
    "title": "OAuth 2.0 authorization code flow, briefly",
    "content": "The user is redirected to the provider (Google, GitHub) to log in and approve access; the provider redirects back with a short-lived authorization code (not a token) in the URL. Your backend then exchanges that code for an access token in a server-to-server call, using a client secret — the token itself never touches the browser or the URL, which is why this flow is safer than the older implicit flow.",
    "collection": "Security",
    "tags": ["security", "architecture"],
},
{
    "title": "Least privilege for database credentials",
    "content": "The app's DB user should have only the permissions it actually needs (SELECT/INSERT/UPDATE on specific tables) rather than a superuser or owner role. If the app is ever compromised via SQL injection or a leaked credential, a scoped-down user limits the blast radius — it can't drop tables or read tables it has no business touching, even if the attacker gets full control of the query.",
    "collection": "Security",
    "tags": ["security", "postgres", "architecture"],
},
]

# ============================================================
# TYPESCRIPT (12 notes)
# ============================================================
NOTES += [
{
    "title": "TypeScript type guards for narrowing union types",
    "content": "A type guard is a function whose return type is `x is SomeType`, which TypeScript uses to narrow the type inside conditional blocks after calling it. Example: `function isUser(obj: unknown): obj is User { return typeof obj === 'object' && obj !== null && 'email' in obj; }`. Inside an `if (isUser(x))` block, TypeScript now treats x as User, not unknown.",
    "collection": "TypeScript",
    "tags": ["typescript"],
},
{
    "title": "unknown vs any: why unknown is the safer escape hatch",
    "content": "any disables type checking entirely for that value — you can call any method on it and TypeScript won't complain, even if it doesn't exist. unknown also accepts any value, but TypeScript forces you to narrow it (with a type guard or type assertion) before you can do anything with it, catching mistakes any would silently let through. Prefer unknown for values of genuinely unpredictable type, like JSON.parse's return value.",
    "collection": "TypeScript",
    "tags": ["typescript"],
},
{
    "title": "Discriminated unions for modeling state machines",
    "content": "Give each variant of a union type a common literal field (e.g. status: 'loading' | 'success' | 'error') that TypeScript can use to narrow the type. `type State = {status:'loading'} | {status:'success', data: T} | {status:'error', error: string}`. Inside `if (state.status === 'success')`, TypeScript knows state.data exists — this eliminates whole classes of 'possibly undefined' bugs compared to a single object with optional fields.",
    "collection": "TypeScript",
    "tags": ["typescript", "architecture"],
},
{
    "title": "Generics explained without the jargon",
    "content": "A generic is a placeholder type filled in at the call site, letting one function or type work correctly for many concrete types without losing type safety. `function first<T>(arr: T[]): T` returns the correct element type whether you pass a string[] or a User[] — without generics, you'd either lose type info (returning any) or write a separate function per type.",
    "collection": "TypeScript",
    "tags": ["typescript"],
},
{
    "title": "Utility types: Partial, Pick, Omit in practice",
    "content": "Partial<T> makes every field of T optional — useful for an update function that only needs some fields changed. Pick<T, 'a'|'b'> creates a type with only those keys. Omit<T, 'password'> creates a type with everything except those keys — handy for a 'safe user' type you return from an API that excludes the password hash without redefining the whole interface by hand.",
    "collection": "TypeScript",
    "tags": ["typescript"],
},
{
    "title": "Why 'as' type assertions can hide real bugs",
    "content": "`const user = data as User` tells TypeScript to trust you without any actual runtime check — if data doesn't actually match User's shape, you get a runtime error somewhere downstream with a confusing stack trace, not a compile error where the mistake was made. Prefer validating with a library like zod that both narrows the type AND actually checks the shape at runtime.",
    "collection": "TypeScript",
    "tags": ["typescript"],
},
{
    "title": "strict mode flags worth turning on individually",
    "content": "strictNullChecks alone catches a huge class of 'cannot read property of undefined' bugs by forcing you to handle null/undefined explicitly. noImplicitAny flags any variable TypeScript couldn't infer a type for, which usually means missing type annotations. Turning on the full 'strict: true' at once in an existing large codebase can produce hundreds of errors — enabling flags one at a time makes migration manageable.",
    "collection": "TypeScript",
    "tags": ["typescript"],
},
{
    "title": "Mapped types: building a type from another type's keys",
    "content": "`type ReadonlyUser = { readonly [K in keyof User]: User[K] }` iterates over every key of User and applies readonly to each. This is how Partial, Required, and Readonly are implemented under the hood in TypeScript's standard lib — understanding mapped types lets you write your own transformations, like a type that makes every field nullable.",
    "collection": "TypeScript",
    "tags": ["typescript"],
},
{
    "title": "Type-only imports and why they matter for bundle size",
    "content": "`import type { User } from './types'` tells TypeScript (and bundlers) this import is erased entirely at compile time since it's only used for type checking. Without the `type` keyword, some bundler/transpiler configurations can't tell if an import has side effects and may keep it in the output, or in isolatedModules mode it can cause build errors when mixing type and value imports from the same module.",
    "collection": "TypeScript",
    "tags": ["typescript", "performance"],
},
{
    "title": "Configuring tsconfig.json for a Node backend project",
    "content": "Key settings: 'module': 'NodeNext' and 'moduleResolution': 'NodeNext' to match how Node actually resolves imports at runtime, 'target' set to whatever Node version you deploy to (check supported syntax), and 'outDir' separate from 'rootDir' so compiled JS doesn't mix with source. 'esModuleInterop': true avoids annoying default-import issues with CommonJS packages.",
    "collection": "TypeScript",
    "tags": ["typescript", "node"],
},
{
    "title": "Function overloads vs a single union parameter type",
    "content": "Overload signatures let a function return a different, more specific type depending on which argument shape was passed in — useful when the relationship between input and output type can't be expressed with a single union. For simpler cases where the return type doesn't depend on input shape, a single signature with a union parameter type is less code and easier to maintain.",
    "collection": "TypeScript",
    "tags": ["typescript"],
},
{
    "title": "satisfies operator: validating without widening the type",
    "content": "`const config = {port: 3000} satisfies Config` checks that the object matches the Config shape, while still letting TypeScript infer the most specific literal type for autocomplete purposes (port stays typed as 3000, not widened to number). Using `: Config` instead of satisfies would widen the type and lose that literal specificity, which matters for things like Express route method strings.",
    "collection": "TypeScript",
    "tags": ["typescript"],
},
]

# ============================================================
# SYSTEM DESIGN (12 notes)
# ============================================================
NOTES += [
{
    "title": "Horizontal vs vertical scaling: trade-offs",
    "content": "Vertical scaling (bigger machine — more CPU/RAM) is simpler since the app doesn't need to change, but has a hard ceiling and a single point of failure. Horizontal scaling (more machines) requires the app to be stateless (no in-memory session data tied to one instance) so a load balancer can route any request to any instance, but scales further and survives individual instance failures.",
    "collection": "System Design",
    "tags": ["architecture", "performance"],
},
{
    "title": "Caching strategies: cache-aside vs write-through",
    "content": "Cache-aside (lazy loading): app checks cache first, on a miss reads from DB and populates the cache. Simple, but the first request after invalidation is always slow, and there's a brief window of stale reads. Write-through: every write goes to the cache and DB together, so the cache is never stale — but adds write latency and complexity, and wastes cache space on data that's rarely read.",
    "collection": "System Design",
    "tags": ["architecture", "redis", "performance"],
},
{
    "title": "Load balancing algorithms: round robin vs least connections",
    "content": "Round robin cycles through servers in order regardless of their current load — simple but can overload a server still processing a slow request while sending it more traffic. Least-connections routes each new request to whichever server currently has the fewest active connections, which handles uneven request durations (some requests taking much longer than others) much better.",
    "collection": "System Design",
    "tags": ["architecture", "devops"],
},
{
    "title": "Designing an idempotent API endpoint",
    "content": "An idempotent endpoint produces the same result no matter how many times it's called with the same input — critical for payment or order-creation endpoints where a client retry (due to a timeout) shouldn't create a duplicate charge. Common pattern: client generates a unique idempotency key per logical operation, sent as a header; server stores which keys it has already processed and returns the cached result for a repeat.",
    "collection": "System Design",
    "tags": ["architecture", "security"],
},
{
    "title": "Message queues: decoupling producers from consumers",
    "content": "Instead of a service calling another service directly and waiting for a response, it publishes a message to a queue (RabbitMQ, SQS, Kafka) and moves on. The consuming service processes messages at its own pace. This decouples the two services' uptime and scaling — if the consumer is temporarily down, messages just wait in the queue instead of failing outright.",
    "collection": "System Design",
    "tags": ["architecture"],
},
{
    "title": "CAP theorem in plain terms",
    "content": "In a distributed system experiencing a network Partition, you must choose between Consistency (every read gets the latest write, but might be refused/blocked during the partition) and Availability (every request gets a response, but it might be stale data). You can't have all three simultaneously during an actual partition — Postgres with synchronous replication leans CP, many NoSQL configs default to AP.",
    "collection": "System Design",
    "tags": ["architecture"],
},
{
    "title": "Rate limiting algorithms: token bucket vs fixed window",
    "content": "Fixed window (e.g. 100 requests per minute, resetting on the minute) allows a burst of 200 requests right at the boundary (100 at 0:59, 100 at 1:00). Token bucket refills tokens continuously at a steady rate and each request consumes one — it naturally smooths out bursts while still allowing some burst capacity up to the bucket size, which is why it's the more common choice for production APIs.",
    "collection": "System Design",
    "tags": ["architecture", "performance"],
},
{
    "title": "Database sharding: splitting data across multiple databases",
    "content": "Sharding partitions a large table's data across multiple database instances by a shard key (e.g. user_id range or hash), so no single machine holds the whole dataset. It solves scale problems a single DB can't, but cross-shard queries (joining data that lives on different shards) and rebalancing when adding a new shard are genuinely hard problems — don't shard until vertical scaling and read replicas are actually insufficient.",
    "collection": "System Design",
    "tags": ["architecture", "postgres"],
},
{
    "title": "API Gateway pattern in a microservices architecture",
    "content": "Instead of clients calling each microservice directly (exposing internal architecture and requiring clients to handle service discovery), a single API Gateway sits in front and routes requests to the right internal service. It's also the natural place to centralize auth, rate limiting, and request logging instead of duplicating that logic in every microservice.",
    "collection": "System Design",
    "tags": ["architecture"],
},
{
    "title": "Eventual consistency: what it actually promises",
    "content": "Eventual consistency means that if no new writes happen, all replicas will eventually converge to the same value — but it makes no promise about how long 'eventually' takes. This is acceptable for things like a social media like-count (a few seconds of staleness doesn't matter) but wrong for a bank balance check right after a withdrawal, where you need strong consistency instead.",
    "collection": "System Design",
    "tags": ["architecture"],
},
{
    "title": "GraphQL vs REST: the over-fetching/under-fetching trade-off",
    "content": "A REST endpoint returns a fixed shape, so a mobile client needing only 3 fields still downloads all 20 (over-fetching), while a client needing data from 2 different resources has to make 2 round trips (under-fetching). GraphQL lets the client specify exactly which fields it needs in one request — the trade-off is added complexity on the server (resolver design, N+1 query risks) and harder HTTP-level caching since every query can be shaped differently.",
    "collection": "System Design",
    "tags": ["graphql", "architecture"],
},
{
    "title": "Designing for retries: exponential backoff and jitter",
    "content": "A naive retry-immediately-on-failure strategy can cause a thundering herd — if a downstream service goes down, every client's retry hits it at the same time, right as it's trying to recover. Exponential backoff increases the wait between retries (1s, 2s, 4s, 8s...), and adding random jitter to that wait time spreads retries out so they don't all land on the same instant.",
    "collection": "System Design",
    "tags": ["architecture", "performance"],
},
]

print(f"Total notes: {len(NOTES)}") if __name__ == "__main__" else None
