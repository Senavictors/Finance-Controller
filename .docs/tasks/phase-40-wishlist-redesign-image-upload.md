# Task: Phase 40 — Wishlist Redesign + Image Upload

## Status

- [x] Todo
- [x] In Progress
- [x] Done

## Context

The `/wishlist` page displayed items as text-only cards grouped by status (Monitorando, Desejado, Comprado, etc.). The redesign aimed to make the product image the visual centerpiece of each card, allow users to upload their own product photos, compact the card layout, and flatten the list into a single unsectioned grid.

## Objective

Redesign the wishlist cards to feature a product image area at the top, implement an image upload endpoint with format and size validation, add the `imageUrl` field to the database and all application layers, and remove status-based sectioning in favor of a flat grid layout.

## Scope

### Database
- Added `imageUrl String? @map("image_url")` to `WishlistItem` model in `prisma/schema.prisma`
- Applied via `prisma db push` + `prisma generate`

### Backend
- `src/server/modules/finance/application/wishlist/types.ts` — added `imageUrl: string | null` to `WishlistListItem`
- `src/server/modules/finance/application/wishlist/use-cases.ts` — `imageUrl` mapped in `toWishlistListItem`, passed in `createWishlistItem` and `updateWishlistItem`
- `src/server/modules/finance/http/schemas.ts` — `imageUrl` added as optional nullable field to `wishlistItemBaseSchema`
- `src/app/api/wishlist/upload/route.ts` (**new**) — `POST /api/wishlist/upload` multipart endpoint; validates MIME type (JPEG, PNG, WebP, AVIF) and max size (5 MB); writes to `public/uploads/wishlist/`; returns `{ url: string }`

### Frontend
- `src/app/(app)/wishlist/wishlist-card.tsx` — redesigned with `aspect-video` image area at top, compact padding/fonts/badges, flat action buttons (`h-7`), `ring` accent for purchased items, hover overlay with edit button inside image
- `src/app/(app)/wishlist/wishlist-form.tsx` — image upload section above product name: click-to-upload placeholder, local preview via `URL.createObjectURL`, Trocar/Remover buttons on hover, client-side 5 MB validation, upload to `/api/wishlist/upload` before main PATCH/POST, fixed React async event bug (capture `e.currentTarget` before first `await`)
- `src/app/(app)/wishlist/page.tsx` — removed status-based sectioning; all items rendered in a single flat grid (`sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`)

### Config
- `next.config.ts` — added `images.localPatterns` for `/uploads/wishlist/**`
- `public/uploads/wishlist/.gitkeep` — directory tracked in git

## Out of Scope

- Orphan image cleanup (files from deleted items remain on disk — post-MVP)
- CDN/Vercel Blob migration (local filesystem sufficient for personal use MVP)
- Image cropping or resizing server-side

## Accepted Formats & Constraints

- Formats: JPG, PNG, WebP, AVIF
- Max size: 5 MB
- Display ratio: `aspect-video` (16:9) with `object-cover`
