import { Module } from "@nestjs/common";

import { AiModule } from "../ai/ai.module";
import { SearchController } from "./search.controller";
import { SearchService } from "./search.service";

@Module({
  controllers: [SearchController],
  imports: [AiModule],
  providers: [SearchService],
})
export class SearchModule {}
