-- Login por nome de usuário: o e-mail passa a ser opcional e o usuário é único na plataforma.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL,
ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
