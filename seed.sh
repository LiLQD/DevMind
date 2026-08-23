#!/usr/bin/env fish

# --- CONFIG ---
set API_URL "https://devmind-backend-production.up.railway.app/api"
set EMAIL "test@test.com"
set PASSWORD "123456"

# --- LOGIN ---
echo "🔐 Logging in..."
set TOKEN (curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  | jq -r '.token')

if test -z "$TOKEN"
  echo "❌ Login failed. Check credentials."
  exit 1
end
echo "✅ Token obtained."

# --- HELPER: Get or create collection ---
function get_or_create_collection
  set name $argv[1]
  set existing (curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/collections" | jq -r ".[] | select(.name == \"$name\") | ._id")
  if test -n "$existing"
    echo $existing
    return 0
  end
  set response (curl -s -X POST "$API_URL/collections" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\"}")
  set id (echo $response | jq -r '.collection._id // ._id // empty')
  if test -n "$id"
    echo $id
  else
    echo ""
  end
end

# --- HELPER: Get or create tag ---
function get_or_create_tag
  set name $argv[1]
  set existing (curl -s -H "Authorization: Bearer $TOKEN" "$API_URL/tags" | jq -r ".[] | select(.name == \"$name\") | ._id")
  if test -n "$existing"
    echo $existing
    return 0
  end
  set response (curl -s -X POST "$API_URL/tags" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$name\"}")
  set id (echo $response | jq -r '.tag._id // ._id // empty')
  if test -n "$id"
    echo $id
  else
    echo ""
  end
end

# --- CREATE COLLECTIONS ---
set collection_names Frontend Backend DevOps AI/ML "System Design" Databases Security Mobile
echo "📁 Creating/fetching collections..."
set collection_ids

for name in $collection_names
  set id (get_or_create_collection "$name")
  if test -n "$id"
    set -a collection_ids $id
    echo "  ✅ $name -> $id"
  else
    echo "  ❌ Failed to get/create collection: $name"
  end
  sleep 0.3
end

if test (count $collection_ids) -eq 0
  echo "❌ No collections available. Aborting."
  exit 1
end

# --- CREATE TAGS ---
set tag_names react vue angular node express fastapi docker kubernetes terraform python javascript typescript
echo "🏷️ Creating/fetching tags..."
set tag_ids

for name in $tag_names
  set id (get_or_create_tag "$name")
  if test -n "$id"
    set -a tag_ids $id
    echo "  ✅ $name -> $id"
  else
    echo "  ❌ Failed to get/create tag: $name"
  end
  sleep 0.3
end

if test (count $tag_ids) -eq 0
  echo "❌ No tags available. Aborting."
  exit 1
end

# --- NOTE TITLES (100) ---
set titles \
  "Understanding React Hooks" \
  "Docker Multi-stage Builds" \
  "Async/Await in JavaScript" \
  "Kubernetes Pods Explained" \
  "REST API Best Practices" \
  "Python List Comprehensions" \
  "Git Merge vs Rebase" \
  "MongoDB Indexing Strategies" \
  "JWT Authentication Flow" \
  "CSS Grid Layout" \
  "WebSockets for Real-time Apps" \
  "Machine Learning with TensorFlow" \
  "Design Patterns: Singleton" \
  "Microservices Architecture" \
  "Caching with Redis" \
  "OAuth2 and OpenID Connect" \
  "TypeScript Utility Types" \
  "Next.js App Router" \
  "CI/CD with GitHub Actions" \
  "GraphQL vs REST" \
  "WebAssembly Performance" \
  "Responsive Design Principles" \
  "Error Handling in Node.js" \
  "Database Transactions" \
  "Load Balancing Algorithms" \
  "Event-Driven Architecture" \
  "Testing with Jest" \
  "CSS Flexbox" \
  "Authentication in Next.js" \
  "Database Sharding" \
  "Web Security Headers" \
  "Python Decorators" \
  "Go Concurrency" \
  "Rust Ownership" \
  "Kafka Streaming" \
  "Elasticsearch Queries" \
  "Prometheus Monitoring" \
  "Grafana Dashboards" \
  "Nginx Reverse Proxy" \
  "Serverless Architecture" \
  "Webpack Configuration" \
  "Babel Presets" \
  "ESLint Rules" \
  "Prettier Setup" \
  "Husky Git Hooks" \
  "Docker Compose" \
  "Terraform Infrastructure" \
  "AWS S3 Basics" \
  "PostgreSQL JSONB" \
  "Redis Caching" \
  "RabbitMQ Messaging" \
  "gRPC vs REST" \
  "Protocol Buffers" \
  "Service Mesh Istio" \
  "Helm Charts" \
  "ArgoCD GitOps" \
  "Kubernetes Ingress" \
  "Kubernetes Operators" \
  "WebRTC" \
  "WebAssembly" \
  "Deno vs Node" \
  "Bun Runtime" \
  "Tailwind CSS" \
  "Sass Preprocessor" \
  "PostCSS Plugins" \
  "Vite Build Tool" \
  "SWR Data Fetching" \
  "React Query" \
  "Redux Toolkit" \
  "Zustand State" \
  "Jotai Atoms" \
  "Recoil State" \
  "MobX Observables" \
  "Svelte Framework" \
  "Vue Composition API" \
  "Angular Dependency Injection" \
  "RxJS Observables" \
  "NestJS Framework" \
  "FastAPI Python" \
  "Flask vs Django" \
  "SQLAlchemy ORM" \
  "Prisma ORM" \
  "Sequelize ORM" \
  "Mongoose ODM" \
  "Firebase Realtime DB" \
  "Supabase Auth" \
  "Appwrite Backend" \
  "Strapi CMS" \
  "Sanity Studio" \
  "Netlify Functions" \
  "Cloudflare Workers" \
  "Vercel Edge" \
  "Deno Deploy" \
  "Fly.io Apps" \
  "Render Hosting" \
  "Railway PaaS" \
  "Heroku Dynos" \
  "AWS Lambda" \
  "Google Cloud Run" \
  "Azure Functions" \
  "Cloud Native Computing"

# --- NOTE CONTENTS (100, matching titles) ---
set contents \
  "A deep dive into React Hooks and how they simplify state management." \
  "Using multi-stage Docker builds to create lean production images." \
  "Understanding async/await in JavaScript with examples." \
  "Kubernetes Pods: the smallest deployable unit in K8s." \
  "Best practices for designing RESTful APIs with OpenAPI." \
  "Python list comprehensions: concise and fast." \
  "When to use merge vs rebase in Git." \
  "Indexing strategies to speed up MongoDB queries." \
  "JWT authentication flow with refresh tokens." \
  "Modern CSS layout with Grid and Flexbox." \
  "Real-time WebSocket communication for chat apps." \
  "An overview of machine learning with TensorFlow 2.x." \
  "The Singleton design pattern and its use cases." \
  "Microservices architecture and its benefits." \
  "Caching strategies using Redis and CDN." \
  "OAuth2 and OpenID Connect for secure authentication." \
  "TypeScript utility types: Partial, Required, Pick, Omit." \
  "Next.js App Router: file-based routing and server components." \
  "Automate your CI/CD pipelines with GitHub Actions." \
  "GraphQL vs REST: a comparative analysis." \
  "WebAssembly: near-native performance in the browser." \
  "Responsive design principles for modern web apps." \
  "Error handling patterns in Node.js and Express." \
  "Database transactions and ACID properties." \
  "Load balancing algorithms: round-robin, least-connections." \
  "Event-driven architecture with Kafka and RabbitMQ." \
  "Testing React components with Jest and React Testing Library." \
  "CSS Flexbox: a complete guide." \
  "Authentication and authorization in Next.js with NextAuth." \
  "Database sharding for horizontal scaling." \
  "Security headers to protect your web app (CSP, HSTS)." \
  "Python decorators and their practical uses." \
  "Go concurrency with goroutines and channels." \
  "Rust ownership and borrowing explained." \
  "Kafka streaming: producers, consumers, and topics." \
  "Elasticsearch queries: match, term, bool, aggregations." \
  "Prometheus metrics and alerting." \
  "Grafana dashboards for monitoring your apps." \
  "Setting up Nginx as a reverse proxy and load balancer." \
  "Serverless architecture with AWS Lambda and API Gateway." \
  "Webpack configuration for code splitting and optimization." \
  "Babel presets and plugins for modern JavaScript." \
  "ESLint rules and configuration for code quality." \
  "Prettier setup for consistent code formatting." \
  "Git hooks with Husky for pre-commit checks." \
  "Docker Compose for multi-container apps." \
  "Infrastructure as Code with Terraform." \
  "AWS S3 for file storage and static hosting." \
  "PostgreSQL JSONB for semi-structured data." \
  "Redis caching and TTL management." \
  "RabbitMQ messaging with AMQP." \
  "gRPC vs REST: performance and use cases." \
  "Protocol Buffers for efficient serialization." \
  "Service mesh with Istio for microservices." \
  "Helm charts for Kubernetes package management." \
  "GitOps with ArgoCD and Kubernetes." \
  "Kubernetes Ingress for external traffic." \
  "Kubernetes Operators for complex applications." \
  "WebRTC for peer-to-peer communication." \
  "WebAssembly for performance-critical tasks." \
  "Deno vs Node.js: a comparison." \
  "Bun: a fast JavaScript runtime and toolkit." \
  "Tailwind CSS utility classes." \
  "Sass and SCSS for CSS preprocessing." \
  "PostCSS plugins for autoprefixing and more." \
  "Vite: a faster build tool for modern web projects." \
  "SWR for data fetching in React." \
  "React Query for server-state management." \
  "Redux Toolkit for global state." \
  "Zustand for lightweight state management." \
  "Jotai for atomic state." \
  "Recoil for React state." \
  "MobX for observable state." \
  "Svelte: a reactive framework." \
  "Vue Composition API." \
  "Angular Dependency Injection." \
  "RxJS for reactive programming." \
  "NestJS framework for Node.js." \
  "FastAPI for Python web APIs." \
  "Flask vs Django: choosing the right Python web framework." \
  "SQLAlchemy ORM for Python." \
  "Prisma ORM for Node.js." \
  "Sequelize ORM for Node.js." \
  "Mongoose ODM for MongoDB." \
  "Firebase Realtime Database." \
  "Supabase authentication and database." \
  "Appwrite backend-as-a-service." \
  "Strapi headless CMS." \
  "Sanity Studio for content management." \
  "Netlify Functions for serverless." \
  "Cloudflare Workers at the edge." \
  "Vercel Edge middleware." \
  "Deno Deploy for TypeScript." \
  "Fly.io global app deployment." \
  "Render hosting and services." \
  "Railway PaaS deployment." \
  "Heroku Dynos and add-ons." \
  "AWS Lambda serverless functions." \
  "Google Cloud Run for containers." \
  "Azure Functions in the cloud." \
  "Cloud Native Computing Foundation projects."

# --- GENERATE 100 NOTES ---
echo "📝 Generating 100 notes..."
set count 0

for i in (seq 1 100)
  # Pick random title and content (matching indices)
  set title_index (random 1 (count $titles))
  set title $titles[$title_index]
  set content $contents[$title_index]

  # Pick random collection
  set collection_id $collection_ids[(random 1 (count $collection_ids))]

  # Pick 1-3 random tags
  set num_tags (random 1 3)
  set note_tags ""
  for j in (seq 1 $num_tags)
    set tag_id $tag_ids[(random 1 (count $tag_ids))]
    if test -z "$note_tags"
      set note_tags "\"$tag_id\""
    else
      set note_tags "$note_tags, \"$tag_id\""
    end
  end

  # Build JSON payload
  set payload "{\"title\":\"$title\",\"content\":\"$content\",\"collection\":\"$collection_id\",\"tags\":[$note_tags]}"

  # Send request
  set response (curl -s -X POST "$API_URL/notes" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload")

  set id (echo $response | jq -r '._id // empty')
  if test -n "$id"
    set count (math $count + 1)
    echo -n "."
  else
    # Print error details for debugging
    echo "❌ Failed note $i: $response"
  end

  # Sleep to avoid rate limiting
  sleep 0.2
end

echo ""
echo "🎉 Successfully created $count notes."
