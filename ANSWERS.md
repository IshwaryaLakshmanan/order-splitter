# Technical Challenge - Answers

## 1. What was your approach (thought process) to tackling this project?

I started by breaking down the problem into two clear concerns: **allocation logic** (splitting money across stocks) and **market awareness** (determining when orders execute). Keeping these separate made it easier to build and maintain.

**Building with Production in Mind:**
Before writing code, I sketched the domain model with operational constraints:
- Order as an aggregate containing allocations—supports idempotent retries
- Market rules as a separate policy—reusable and testable without external dependencies
- Repository pattern for data access—allows switching from in-memory to PostgreSQL later
- Health checks and graceful shutdown from day one—operations teams need these before production

**Technology Choices:**
- **NestJS** for modular structure without overhead—dependency injection scales well
- **Decimal.js** over JavaScript floats because financial systems need precision—rounding errors compound quickly
- **In-memory repository with PostgreSQL interface pre-designed**—makes migration painless
- **Node.js timezone handling via Date APIs**—relies on the OS, stays current with DST rules

**Test-Driven Architecture:**
I wrote tests for the hardest parts first (order splitting precision, timezone edge cases):
- "What if weights don't sum to exactly 1.0?" → Led to 0.0001 tolerance
- "What about DST transitions?" → Forced timezone strategy
- "How do we retry safely?" → UUID-based idempotency from the start
- "What breaks if the database is down?" → Circuit breaker pattern built in

This exposed operational concerns early, before they became production issues.

## 2. What assumptions did you make?

**Market Assumptions:**
- Trading hours: 9:30 AM - 4:00 PM ET (inclusive)—orders at 4:00 PM execute today; after 4:00 PM defer to next business day
- Market closed weekends (Saturday & Sunday)
- Fixed US market holidays for 2024-2026 (New Year's, MLK Day, Presidents Day, Good Friday, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, Christmas)
- All operations in Eastern Time (America/New_York)
- Prices are static within a request (no real-time feeds)

**Portfolio Constraints:**
- Weights must sum to 1.0 ± 0.0001 tolerance
- Minimum total amount: $0.01
- No maximum portfolio size
- Duplicate symbols not allowed
- Fractional shares permitted with 3 decimal precision (configurable)

**Pricing Model:**
- Fixed default price: $100 per share (configurable via environment)
- Optional price override per portfolio item
- Decimal.js for all financial math to avoid float errors

**Order Splitting Logic:**
- Remainder assigned to last portfolio item—ensures sum equals total exactly
- Amounts rounded to cents, last item absorbs remainder
- Execution date always next business day (skips weekends/holidays)
- Share quantity precision: 3 decimal places (configurable)

**System Assumptions:**
- Single-threaded execution (no concurrency needed yet)
- Data loss acceptable on restart (in-memory storage)
- Idempotency via UUIDs
- Small request volumes (no caching/scaling infrastructure)

**API Design:**
- REST with class-validator for input validation
- Synchronous request/response (no async job processing)
- JSON format with Swagger documentation


## 3. What architectural challenges did you face when creating your solution?

**The Rounding Problem**

When I started building the order splitter, I quickly realized that splitting amounts across portfolios is trickier than it looks. Split $1000 into three parts at 33.33%, 33.33%, and 33.34%—the math gives you $333.30, $333.30, and $333.40, but that adds up to $1000.00, so it worked out. But what if I split $100 three ways at equal weights? You get $33.33 + $33.33 + $33.33 = $99.99. The penny's gone.

I could round up, round down, or distribute the error across all items. But financial systems can't tolerate these silent errors—they compound over time. I went with assigning the remainder to the last item in the portfolio. It's not elegant, but it's honest: one allocation absorbs the rounding error, making it visible. When you scale this to millions of orders, that one-cent difference is traceable and auditable. I used Decimal.js throughout to avoid floating-point precision issues entirely.

**Timezone Complexity**

I knew timezones would be messy, but I underestimated how messy. The market closes at 4:00 PM Eastern Time. Sounds simple until you realize:
- Your server might be in UTC
- Brokers operate in ET/PT
- DST transitions happen twice a year
- A single logic error means orders execute on closed markets

I looked at timezone libraries, but they all felt like overkill. Every one I looked at eventually becomes unmaintained. Instead, I delegated to Node.js: `Date.toLocaleString('en-US', { timeZone: 'America/New_York' })`. This uses the OS timezone database, which the system vendor (Microsoft, Linux) keeps current. I'm trading control for maintainability—I don't want to manage timezone code that breaks when legislators change DST rules.

**Repository Design for Migration**

I started with an in-memory repository because it's fast for development. But I knew production would eventually need PostgreSQL. The trap is building everything tightly coupled to in-memory behavior—using methods like `.clear()` in tests, or depending on garbage collection for cleanup.

So I defined a strict `OrderRepository` interface with only production methods: `save()`, `findById()`, `findAll()`, `delete()`. Test utilities that don't exist in production (like `clear()`) are explicitly cast to `any`, making it obvious when tests cheat. This way, when it's time to swap in PostgreSQL, the transition is clean. The service layer doesn't know or care which storage backend is behind the interface.

**Separating Validation Concerns**

Portfolio validation was surprisingly tricky to get right. I needed two types of checks:
1. Structural validation: is this even an array? Are the items objects with the right properties?
2. Business logic validation: do the weights sum to 1.0? Are there duplicate symbols?

My first instinct was to put everything in the DTO with class-validator decorators. But then I realized: if I need to change the weight tolerance from 0.0001 to 0.001, I'd have to update the request DTOs. That couples domain rules to the HTTP layer, which feels wrong.

I split it: DTOs handle structure (is it an array? is each item an object?), and the service layer handles business rules (do weights sum correctly? any duplicates?). That way, if I later add a CLI tool or a GraphQL endpoint, they can reuse the same validation logic without reimplementing it.

**Testing Rate Limiting Without Flakiness**

I added a throttle guard to prevent abuse. The problem: my integration tests run fast, and running 10 orders in rapid succession hits the rate limit. I could disable the guard in tests, but then I'm not really testing the production behavior.

Instead, I kept the guard enabled and added realistic delays (150ms) between requests in the tests. It makes the tests slower, but they're honest—they prove the system works under realistic conditions, not just in the lab. Rate limiting gets tested separately in isolation where I can control time. This prevents the common trap where flaky tests make teams ignore test failures, and bugs slip to production.


## 4. If you were to migrate your code from its current standalone format to a fully functional production environment, what are some changes and controls you would put in place?

### Data Integrity & Audit

- **Event sourcing** for order lifecycle (OrderCreated, OrderExecuted, OrderCancelled)
- **Immutable audit logs**—who created/modified what, when
- **Database constraints** (foreign keys, unique indexes) at schema level
- **Soft deletes** instead of hard deletes—preserve data for compliance

### Operational Reliability

- **Circuit breaker** for external services—fail fast if third-party APIs are down
- **Retry logic with exponential backoff** for transient failures
- **Dead letter queues** for failed orders—operators can investigate and retry
- **Canary deployments**—roll out to 10% of traffic first, monitor for issues

### Observability & Monitoring

- **Structured logging** (JSON format)—filter by order ID, user, error type
- **Distributed tracing** with OpenTelemetry—track requests across services
- **Business metrics** (orders/min, latency, error rate)—separate from system metrics
- **Alerting** on SLOs (e.g., "execution latency < 500ms 99% of the time")

### Security & Compliance

- **OAuth 2.0** for partner integrations—industry-standard auth
- **Rate limiting per partner**—prevent one bad actor from degrading service
- **Data encryption at rest** for sensitive fields
- **Regular security audits** (penetration testing, dependency scanning)
- **Regulatory compliance checks** (SOX/FINRA if handling regulated assets)

### Scaling

- **Horizontal scaling**—stateless services behind load balancer
- **Read replicas for analytics**—separate reads from writes
- **Caching layer (Redis)** for market hours, price lookups
- **Message queue (Kafka)** for order processing—decouple API from execution

## 5. If you've used LLMs to solve the challenge, describe how and where you've used it and how did it help you in tackling the challenge?

I used Copilot and ChatGPT strategically for development assistance while maintaining full ownership of architectural decisions.

**Portfolio Validation Approach:**
Discussed with LLMs whether to use class-validator alone or separate structural validation from business logic. This confirmed layering was the right pattern—DTOs for structure, service layer for business rules. Enables future framework changes without touching domain code.

**Edge Case Brainstorming:**
- Copilot identified timezone edge cases (DST transitions, leap seconds)
- ChatGPT suggested financial edge cases (rounding drift, precision limits)
- I implemented these systematically in the test suite

**Timezone Strategy Validation:**
For market hours calculation with DST, used LLMs to confirm that delegating to Node.js Date APIs was better than external libraries. Eliminated unnecessary dependencies while keeping logic maintainable.

**NestJS Patterns:**
Copilot validated:
- Repository interface design (production methods only)
- Interceptor patterns for logging and error handling
- TypeScript interface structure
- Configuration management

**Documentation & Scaffolding:**
- LLMs generated JSON payload examples
- Structured README with clear sections
- Created standard boilerplate (DTOs, service templates, modules)
- Formatted code examples for readability

This reduced setup time without affecting core architectural decisions—the algorithms, validations, and system design were deliberate choices based on the problem requirements.

---

## Summary

Pragmatic engineering shaped by real production experience. Every architectural choice trades simplicity for maintainability. LLMs helped validate decisions and accelerate scaffolding; all architectural thinking came from deliberate analysis of the problem. I own every decision in this codebase.