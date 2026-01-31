# Order Splitter API – Robo-Advisor

A production-oriented **Node.js + TypeScript + NestJS** API that accepts a model portfolio and returns a precise, deterministic split of investment orders across stocks, with built-in support for authentication, idempotency, rate limiting, and testability.

---

## Getting Started

### Prerequisites
- Node.js v18+
- npm

### Installation

```bash
npm install
```
### Environment Setup

```bash
cp .env.sample .env
```
### Run the Application

```bash
npm run start
```

For development:

```bash
npm run start:dev
```

For Testing:

```bash
npm run test
```

Application URL:

```
http://localhost:3000
```

Swagger API Docs:

```
http://localhost:3000/api
```

---

## What This API Does

The Order Splitter API enables:

- Accurate financial order splitting based on portfolio weights
- Precision-safe calculations using Decimal.js
- Market-aware execution date determination
- Secure, idempotent, and rate-limited APIs
- Event-driven extensibility using Kafka
- Scalable architecture for production environments

---

## System Architecture (Simplified)

```
Client / Partner System
        │
        ▼
   Orders API (NestJS)
        │
 ┌──────┼─────────┐
 │      │         │
Auth  Idempotency  Rate Limiter
 │      │         │
 ▼      ▼         ▼
Order Splitter Domain Logic
        │
   Repository Layer
 (In-Memory / PostgreSQL)
```

---
## Features & Capabilities

- **Authentication:** JWT-based authentication with Bearer token enforcement on protected endpoints for a security reasons
- **Database & Persistence:** In-memory repository for fast iteration and testing; abstraction ready for PostgreSQL integration
- **Idempotency:** `Idempotency-Key` support to prevent duplicate order creation with safe retry behavior for clients
- **Rate Limiting:** Backend throttle guard to prevent abuse and spamming
- **API Documentation:** Swagger / OpenAPI documentation for all endpoints
- **Testing:** Unit tests for core domain logic, integration tests for API flows, and coverage reporting via Jest
- **Portfolio-based Order Splitting:** Weight-based allocation with precision handling using Decimal.js
- **Rounding Strategy:** Ensures total amount consistency across split orders
- **Market-aware Execution:** Dynamic execution date calculation based on market conditions
- **Configurable Pricing:** Fixed price strategy with override capabilities
- **Centralized Validation & Error Handling:** Comprehensive request validation and standardized error responses
- **Performance Logging:** Response time tracking and performance interceptor
- **Modular Architecture:** NestJS framework with domain-driven layering (Controller → Service → Domain → Repository)
- **Clean Separation of Concerns:** Well-organized codebase ready for production scaling

---

## API Endpoints

### 1. Authentication

**POST** `v1/auth/login`

Headers:
```
Authorization: Basic base64(username:password)
```

Request with curl:
```bash
curl -X POST http://localhost:3000/v1/auth/token \
  -H "Authorization: Basic dXNlcjEyMzpUZXN0QDEyMw=="
```
Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 86400,
  "grant_type": "client_credentials"
}
```

### 2. Split Order

**POST** `/v1/orders/split`

Headers:
```
Authorization: Bearer <token>
Idempotency-Key: <unique-key> Optional
```

Request:

```json
{
  "orderType": "BUY",
  "totalAmount": 1000,
  "portfolioName": "Growth Portfolio",
  "modelPortfolio": [
    { "symbol": "AAPL", "weight": 0.5 },
    { "symbol": "MSFT", "weight": 0.3 },
    { "symbol": "TSLA", "weight": 0.2 }
  ]
}
```

Response:

```json
{
  "id": "86a46b1e-bdef-440e-bcf1-84b59563abd1",
  "orderType": "BUY",
  "status": "Created",
  "portfolioName": "Growth Portfolio",
  "executionDate": "2026-01-30",
  "createdAt": "2026-01-30T18:36:28.685Z",
  "orders": [
    {
      "symbol": "AAPL",
      "amount": 500,
      "price": 100,
      "quantity": 5
    },
    {
      "symbol": "MSFT",
      "amount": 300,
      "price": 100,
      "quantity": 3
    },
    {
      "symbol": "TSLA",
      "amount": 200,
      "price": 100,
      "quantity": 2
    }
  ],
  "meta": {
    "splitTimeMs": 18,
    "totalAmount": 1000,
    "precision": 3
  }
}
```

### curl Example

```bash
curl -X POST http://localhost:3000/v1/orders/split   -H "Authorization: Bearer <token>"   -H "Idempotency-Key: req-advanced-001"   -H "Content-Type: application/json"   -d '{
    "orderType": "BUY",
    "totalAmount": 1000,
    "portfolioName": "Growth Portfolio",
    "modelPortfolio": [
      { "symbol": "AAPL", "weight": 0.5 },
      { "symbol": "MSFT", "weight": 0.3 },
      { "symbol": "TSLA", "weight": 0.2 }
    ]
  }'
```

### 3. Advanced Example – SELL Order

```bash
curl -X POST http://localhost:3000/v1/orders/split   -H "Authorization: Bearer <token>" -H "Idempotency-Key: req-advanced-002"  -H "Content-Type: application/json"   -d '{
    "orderType": "SELL",
    "totalAmount": 500,
    "portfolioName": "Growth Portfolio",
    "modelPortfolio": [
      { "symbol": "AAPL", "weight": 0.7 },
      { "symbol": "TSLA", "weight": 0.3 }
    ]
  }'
```

---

### 4. Get Order History

**GET** `/v1/orders`

```bash
curl -X GET http://localhost:3000/v1/orders   -H "Authorization: Bearer <token>"
```

Get orders by order type:
```bash
curl -X GET "http://localhost:3000/v1/orders?orderType=BUY" \
  -H "Authorization: Bearer <token>"
```

Get orders by portfolio name:
```bash
curl -X GET "http://localhost:3000/v1/orders?portfolioName=Growth%20Portfolio" \
  -H "Authorization: Bearer <token>"
```

Combined filters (order type + portfolio + date range + pagination):
```bash
curl -X GET "http://localhost:3000/v1/orders?orderType=SELL&portfolioName=Income%20Portfolio&startDate=2026-01-01&endDate=2026-01-31&limit=50&offset=0" \
  -H "Authorization: Bearer <token>"
```

---
### 5. Get Order Metrics

**GET** `/v1/orders/metrics`

```bash
curl -X GET http://localhost:3000/v1/orders/metrics \
  -H "Authorization: Bearer <token>"
```

Response:
```json
{
  "totalOrders": 15,
  "totalAmount": 25000.50,
  "averageOrderSize": 1666.70,
  "buyOrders": 10,
  "sellOrders": 5,
  "computedAt": "2026-01-31T10:30:00.000Z"
}
```
---

## Testing & Coverage

```bash
npm run test
npm run test:cov
npm run test:watch
```

### Coverage Focus

- Order splitting algorithm
- Precision & rounding rules
- Idempotency behavior
- Authentication & authorization flows
- API contract validation
- Error handling scenarios

---

## Production Readiness Highlights

### Already Implemented

- JWT Authentication
- Idempotency mechanism
- Rate limiting guard
- Swagger documentation
- Modular architecture
- Domain-driven design
- Unit & integration tests

### Planned Improvements

- PostgreSQL persistence layer
- Redis-based idempotency store
- OAuth2 / OIDC authentication
- Observability (Prometheus, OpenTelemetry)
- Full Kafka-based async workflows
- CI/CD pipelines & containerization
- Horizontal scaling & caching

---

## Why This Design

This architecture ensures:

- Financial accuracy (Decimal.js over floating-point arithmetic)
- Safe retries (idempotency)
- Secure APIs (JWT + rate limiting)
- Testability (isolated domain logic)
- Scalability (repository abstraction + modular design)

The codebase is structured to evolve from a lightweight service into a production-grade robo-advisor backend.

---
