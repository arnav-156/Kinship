import { Global, Module } from "@nestjs/common";
import { loadConfig } from "@relationship/config";
import { createS3ObjectStorage } from "@relationship/storage";

import { OBJECT_STORAGE } from "./object-storage.token";

export function createConfiguredObjectStorage() {
  const config = loadConfig();
  return createS3ObjectStorage({
    accessKeyId: config.S3_ACCESS_KEY_ID,
    bucket: config.S3_BUCKET,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    region: config.S3_REGION,
    secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  });
}

@Global()
@Module({
  exports: [OBJECT_STORAGE],
  providers: [{ provide: OBJECT_STORAGE, useFactory: createConfiguredObjectStorage }],
})
export class StorageModule {}
