import { Global, Module } from "@nestjs/common";
import { createPrismaClient } from "@relationship/db";

import { PRISMA_CLIENT } from "./prisma.token";

@Global()
@Module({
  exports: [PRISMA_CLIENT],
  providers: [
    {
      provide: PRISMA_CLIENT,
      useFactory: createPrismaClient,
    },
  ],
})
export class DatabaseModule {}
