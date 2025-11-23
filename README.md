# SRE Assignment – Full Observability & CDC Pipeline

This project demonstrates a full local observability environment including:

- TiDB (Unistore mode – lightweight demo DB)
- Application-level CDC (Change Data Capture)
- Kafka event streaming
- Node.js API with structured logging + metrics
- Node.js CDC Consumer with metrics
- Prometheus (metrics scraping)
- Loki + Promtail (log aggregation)
- Grafana (dashboards & log exploration)


---

## Architecture Overview

```
┌──────────┐      ┌──────────┐       ┌──────────────┐
│  Client  │ ---> │   API    │ --->  │  TiDB (SQL)  │
└──────────┘      └────┬─────┘       └──────┬───────┘
                        │  writes            │
                        │                    │
                        ▼                    │
                Sends USER_LOGIN event       │
                    to Kafka topic           │
                        ▼                    │
                ┌──────────────────┐         │
                │     Kafka        │ <───────┘
                └────────┬─────────┘
                         ▼
                ┌──────────────────┐
                │  CDC Consumer    │
                └────────┬─────────┘
                         │
                         │ exposes /metrics
                         ▼
   ┌──────────┐    ┌───────────┐     ┌──────────┐
   │ Promtail │ -> │   Loki     │ --> │ Grafana  │  (Logs)
   └──────────┘    └───────────┘     └──────────┘

   ┌─────────────┐
   │ Prometheus  │  <-- scrapes API + Consumer
   └─────────────┘
```

---

## TiCDC Limitation in This Assignment

**TiCDC DOES NOT work in Unistore mode.**

The official TiCDC requires a full distributed TiDB cluster:
- TiDB
- PD
- TiKV

But here we use **TiDB in Unistore mode**, which does **NOT** support TiCDC.

### Therefore:
✔️ Real TiCDC → Kafka replication is not available here  
✔️ Instead we implemented **Application-Level CDC**

The flow:

1. User logs into the API  
2. API writes to TiDB  
3. API publishes a CDC event (`USER_LOGIN`) to Kafka topic `db-changes`  
4. CDC Consumer reads & logs the events  
5. Prometheus scrapes API + Consumer  
6. Loki/Grafana display logs  


---

## How to Run the Project

### Start all services

```bash
docker compose up -d --build
```

Check containers:

```bash
docker ps
```

---

## Test the System End-to-End

### API health

```bash
curl http://localhost:3000/
```

### Test login → triggers CDC → Kafka → Consumer

```bash
curl -X POST http://localhost:3000/login   -H "Content-Type: application/json"   -d '{"username":"admin","password":"admin"}'
```

### Check CDC Consumer logs

```bash
docker logs cdc-consumer --tail=50
```

You should see the CDC JSON event.

---

## Prometheus

Open Prometheus:

👉 http://localhost:9091

PromQL examples:

```
api_http_request_duration_seconds_count
kafka_messages_consumed_total
```

---

## Grafana

Open Grafana:

http://localhost:3001  

Credentials:  
**User:** admin  
**Password:** admin  

### Add Data Sources

#### Prometheus  
`http://prometheus:9090`

#### Loki  
`http://loki:3100`

---

## Logs in Grafana (Loki)

Example queries:

```
{}
{container="api"}
{container="cdc-consumer"}
```

---

## Prometheus Metrics

### API Metrics  
Endpoint: `http://localhost:3000/metrics`

### CDC Consumer Metrics  
Endpoint: `http://localhost:9100/metrics`

---

## Project Structure

```
.
├── api-fold/
├── consumer/
├── db-fold/
├── observability/
└── docker-compose.yml
```

---

## Clean Up

```bash
docker compose down
docker compose down -v
```

---

## Summary

This project demonstrates:

✔️ Application-Level CDC  
✔️ Kafka Integration  
✔️ Structured Logging (Loki + Grafana)  
✔️ Prometheus Metrics  
✔️ Grafana Dashboards  
✔️ Full Observability Pipeline  


