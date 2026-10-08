import { describe, expect, it, vi } from "vitest";

import { createLogger } from "./index.js";

describe("createLogger", () => {
  it("writes structured JSON logs", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    createLogger("test", "debug").info("hello", { requestId: "req_1" });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(spy.mock.calls[0]?.[0]))).toMatchObject({
      level: "info",
      message: "hello",
      requestId: "req_1",
      service: "test",
    });

    spy.mockRestore();
  });
});
