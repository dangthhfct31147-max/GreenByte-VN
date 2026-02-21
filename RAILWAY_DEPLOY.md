# =============================================================================
# RAILWAY DEPLOYMENT GUIDE - Eco-product
# =============================================================================

## 📋 Tổng quan
Dự án được cấu hình với **Docker** (Multi-stage build) để tối ưu cho Railway.

## 🚀 Các bước Deploy

### Bước 1: Tạo dự án
1. Chọn **New Project** -> **Deploy from GitHub repo**.
2. Chọn repo `Eco-product`.

### Bước 2: Cấu hình Variables (Quan trọng)
Vào tab **Variables** và set các giá trị sau:

#### Biến bắt buộc

| Variable | Giá trị mẫu | Mô tả |
|----------|-------------|-------|
| `NODE_ENV` | `production` | Bắt buộc |
| `DATABASE_URL` | `postgresql://...?schema=eco` | Connection string (phải có `?schema=eco`) |
| `JWT_SECRET` | `openssl rand -hex 48` | Chuỗi ngẫu nhiên ≥32 ký tự |
| `FRONTEND_ORIGIN` | `https://eco-product.up.railway.app` | Domain public của app |

#### Biến blockchain (optional)

| Variable | Giá trị mẫu | Mô tả |
|----------|-------------|-------|
| `POLYGON_RPC_URL` | `https://rpc-amoy.polygon.technology` | RPC endpoint |
| `DEPLOYER_PRIVATE_KEY` | `e5e1d736...` | Private key (64 hex chars, KHÔNG có 0x) |
| `BYPRODUCT_REGISTRY_ADDRESS` | `0x93C9e815...` | Contract address |
| `ESCROW_CONTRACT_ADDRESS` | `0xAd6F80...` | Contract address |
| `GREEN_TOKEN_ADDRESS` | `0x36E456...` | Contract address |
| `CHAIN_ID` | `80002` | Amoy: 80002, Polygon Mainnet: 137 |

#### Biến IPFS (optional)

| Variable | Giá trị mẫu | Mô tả |
|----------|-------------|-------|
| `PINATA_API_KEY` | `9f8b54aa...` | Pinata API key |
| `PINATA_SECRET_KEY` | `b8570d7c...` | Pinata secret |
| `PINATA_GATEWAY_URL` | `https://gateway.pinata.cloud/ipfs/` | IPFS gateway |

### Bước 3: Database & Redis (Khuyên dùng)
1. **PostgreSQL**: Trong Railway, bấm **New** -> **Database** -> **Add PostgreSQL**. Lấy `CONNECTION_URL` gán vào `DATABASE_URL`.
2. **Redis**: Bấm **New** -> **Database** -> **Add Redis**. Railway sẽ tự động tạo biến `REDIS_URL`.

### Bước 4.1: Deploy Backend Service
1. Tạo Service mới: **New** -> **GitHub Repo** -> Chọn `Eco-product`.
2. Vào **Settings** -> **Build** -> **Dockerfile Path** -> Nhập `Dockerfile.backend`.
3. Vào **Variables**: Thêm các biến như hướng dẫn ở bước 2.
4. Đợi build xong, vào **Settings** -> **Networking** -> **Generate Domain**.

### Bước 4.2: Deploy Frontend Service
1. Tạo thêm Service mới: **New** -> **GitHub Repo** -> Chọn `Eco-product`.
2. Vào **Settings** -> **Build** -> **Dockerfile Path** -> Nhập `Dockerfile.frontend`.
3. Vào **Variables**:
   - `VITE_API_URL`: `https://eco-backend.up.railway.app` (Domain backend).
4. Vào **Settings** -> **Networking** -> **Generate Domain**.

### Deploy All-in-One (Alternative)
Nếu muốn deploy 1 service duy nhất (backend phục vụ cả frontend):
1. Dùng `Dockerfile` (không phải `Dockerfile.backend` hay `Dockerfile.frontend`).
2. Set tất cả biến cần thiết.
3. Frontend và API cùng chạy trên 1 domain.

## 🔒 Security Features (Tự động)
- ✅ Helmet security headers (CSP, HSTS, X-Frame-Options)
- ✅ CORS với whitelist domain
- ✅ CSRF protection cho state-changing requests
- ✅ Rate limiting: 300/min baseline, 30/min auth, 15/min blockchain, 60/min green-index
- ✅ Response compression (gzip)
- ✅ Non-root Docker user + dumb-init
- ✅ Health check endpoint (`/api/health`)

## Troubleshooting
- **Frontend không gọi được API?** Kiểm tra `VITE_API_URL` = domain backend (không có `/` cuối).
- **CORS Error?** `FRONTEND_ORIGIN` ở Backend = domain Frontend.
- **Prisma lỗi?** Kiểm tra `DATABASE_URL` đã có `?schema=eco` chưa.
- **Blockchain lỗi?** Kiểm tra 3 contract addresses đều có prefix `0x` và đúng 42 ký tự.
