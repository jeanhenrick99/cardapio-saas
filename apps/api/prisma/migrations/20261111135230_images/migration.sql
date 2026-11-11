-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Image_restaurantId_idx" ON "Image"("restaurantId");

-- AddForeignKey
ALTER TABLE "Image" ADD CONSTRAINT "Image_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
