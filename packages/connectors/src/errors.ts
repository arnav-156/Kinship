export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

export class ConnectorPolicyError extends ConnectorError {
  constructor(message: string) {
    super(message, "CONNECTOR_POLICY_BLOCKED", false);
    this.name = "ConnectorPolicyError";
  }
}
