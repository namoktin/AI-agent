# 🚀 V2 ULTIMATE SYSTEM - QUICK START GUIDE

## Khởi động server

```bash
npm start
```

## API Endpoints mới

### 1. Multi-Agent Execution (Main)

```bash
POST http://localhost:3000/api/v2/execute
Content-Type: application/json

{
  "task": "Your task here",
  "useCache": true,
  "useGrounding": false
}
```

**Response:**
```json
{
  "success": true,
  "result": "...",
  "qualityScore": 92,
  "stats": {
    "executionTime": "3500ms",
    "agentCalls": 5,
    "averageLatency": "700ms"
  }
}
```

### 2. Fact-Check

```bash
POST http://localhost:3000/api/v2/fact-check
Content-Type: application/json

{
  "claim": "Sao Hỏa có khí quyển giống Trái Đất"
}
```

### 3. Deep Research

```bash
POST http://localhost:3000/api/v2/research
Content-Type: application/json

{
  "topic": "Quantum computing breakthroughs 2024"
}
```

### 4. Performance Benchmark

```bash
POST http://localhost:3000/api/v2/benchmark
```

Chạy toàn bộ benchmark suite và tạo report chi tiết.

### 5. System Stats

```bash
GET http://localhost:3000/api/v2/stats
```

## Testing

```bash
# Quick test
node test-v2-system.js

# Full benchmark
npm run v2:benchmark
```

## Architecture

```
User Request
    ↓
Director (Strategic Analysis)
    ↓
Coordinator (Task Decomposition)
    ↓
Specialists (Parallel Execution)
    ├── Researcher
    ├── Developer
    └── Critic
    ↓
Consensus Mechanism
    ↓
Director (Final Approval)
    ↓
Response (Quality Score 85-100)
```

## Performance Expectations

- **Quality Score:** 85-95% average
- **Latency:** 2-5 seconds (with cache)
- **Success Rate:** 95%+
- **Cost:** ~$0.001-0.005 per request

## Key Features

✅ True multi-agent orchestration
✅ Thinking mode for reasoning
✅ Parallel tool execution
✅ Context caching
✅ Google Search grounding
✅ Adversarial review
✅ Auto-retry & self-healing

---

**Ghi chú:** Đảm bảo GEMINI_API_KEY đã được cấu hình trong .env
