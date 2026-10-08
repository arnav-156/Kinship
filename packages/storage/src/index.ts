export interface StoredObject {
  contentHash?: string;
  contentType: string;
  key: string;
  sizeBytes: number;
}

export interface ObjectStoragePort {
  getObject(key: string): Promise<Uint8Array>;
  putObject(key: string, body: Uint8Array, contentType: string): Promise<StoredObject>;
}
