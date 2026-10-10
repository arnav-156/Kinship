import { Module } from "@nestjs/common";
import { createModelGateway, type ModelGatewayOptions } from "@relationship/ai";

export const MODEL_GATEWAY = Symbol("MODEL_GATEWAY");

@Module({
  exports: [MODEL_GATEWAY],
  providers: [
    {
      provide: MODEL_GATEWAY,
      useFactory: () => {
        const provider =
          process.env["AI_PROVIDER"] === "openai-compatible" ? "openai-compatible" : "mock";
        const options: ModelGatewayOptions = {
          apiKey: process.env["OPENAI_API_KEY"],
          baseUrl: process.env["OPENAI_BASE_URL"],
          chatModel: process.env["OPENAI_CHAT_MODEL"],
          embeddingModel: process.env["OPENAI_EMBEDDING_MODEL"],
          fallback:
            process.env["AI_FALLBACK_PROVIDER"] === "openai-compatible"
              ? {
                  apiKey: process.env["AI_FALLBACK_API_KEY"],
                  baseUrl: process.env["AI_FALLBACK_BASE_URL"],
                  chatModel: process.env["AI_FALLBACK_CHAT_MODEL"],
                  embeddingModel: process.env["AI_FALLBACK_EMBEDDING_MODEL"],
                  provider: "openai-compatible",
                }
              : undefined,
          provider,
        };

        return createModelGateway(options);
      },
    },
  ],
})
export class AiModule {}
