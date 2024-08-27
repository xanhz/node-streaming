-- CreateEnum
CREATE TYPE "StreamStatus" AS ENUM ('Pending', 'Publishing', 'Closed');

-- CreateTable
CREATE TABLE "streams" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "server_url" TEXT NOT NULL,
    "manifest_url" TEXT,
    "status" "StreamStatus" NOT NULL DEFAULT 'Pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "streams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "streams_name_key" ON "streams"("name");
