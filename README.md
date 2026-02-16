# Eco-Byproduct VN 🌿

Sàn thương mại điện tử phụ phẩm nông nghiệp & Bản đồ ô nhiễm Việt Nam.

## 🚀 Quick Start

1.  **Clone & Install**
    ```bash
    git clone https://github.com/Homelessman123/Eco-product.git
    cd eco-byproduct-vn
    npm install
    ```

2.  **Environment**
    ```bash
    cp .env.example .env
    # Update .env with your credentials
    ```

3.  **Database Setup**
    ```bash
    npx prisma generate
    npx prisma db push
    npm run db:seed # (Check prisma/seed.ts)
    ```

4.  **Run Dev**
    ```bash
    npm run dev
    ```

## 🔐 Admin Portal

- URL: `/admin/login`
- API prefix: `/api/admin/*`

Set admin env vars in `.env`:

```bash
ADMIN_EMAIL=admin@eco-byproduct.vn
ADMIN_PASSWORD=YourStrongPassword
# Or use bcrypt hash instead:
# ADMIN_PASSWORD_HASH=$2b$12$...
ADMIN_JWT_SECRET=another_long_random_secret
```

### Admin Docker (Railway)

Use `Dockerfile.admin` for an isolated admin frontend deployment:

```bash
docker build -f Dockerfile.admin --build-arg VITE_API_URL=https://your-api.example.com -t eco-admin .
docker run -p 8080:8080 eco-admin
```

## ⚡ Prisma Accelerate (Optional)

After enabling Accelerate in https://console.prisma.io/, set:

- `DATABASE_URL` to the `prisma://...` Accelerate connection string (append `&schema=eco` for CockroachDB)
- `DIRECT_DATABASE_URL` to your direct CockroachDB connection string (must include `&schema=eco`)

Prisma CLI commands (`prisma db push`, migrate, introspection, seed) use `DIRECT_DATABASE_URL` via `prisma.config.ts`.

## 🗺️ Kế Hoạch Triển Khai (Milestones)

### Phase 1: Foundation & Auth (Current) ✅
- [x] Scaffolding Next.js App Router + TypeScript + Tailwind
- [x] Design System (Colors, Typography, UI Components)
- [x] Database Schema (Prisma)
- [x] Authentication UI (Stepper Signup)
- [ ] NextAuth Integration (Backend)

### Phase 2: Marketplace Core (NEXT)
- [ ] Create Listing Form (Seller)
- [ ] Image Upload (S3/R2 Presigned URLs)
- [ ] Listings Feed with Filtering
- [ ] Listing Detail Page

### Phase 3: Pollution Map
- [ ] MapLibre GL JS Integration
- [ ] Markers with Clustering
- [ ] User Permission Logic (Only Owner Can Delete)
- [ ] Realtime Updates

### Phase 4: Commerce
- [ ] Cart System
- [ ] Checkout Flow
- [ ] Stripe Integration

## 🛠️ Tech Stack

-   **Frontend:** Next.js 14, React, TailwindCSS, Framer Motion, Lucide Icons.
-   **Backend:** Next.js Server Actions, Prisma ORM.
-   **Database:** PostgreSQL (Neon).
-   **Maps:** MapLibre GL JS.
-   **Validation:** Zod.

# Eco-product
