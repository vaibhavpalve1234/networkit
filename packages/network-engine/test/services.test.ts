import assert from "node:assert/strict";
import test from "node:test";
import { serviceForPort } from "../src/services";

test("maps recognized service ports without guessing unknown ports", () => {
  assert.equal(serviceForPort(23), "telnet");
  assert.equal(serviceForPort(554), "rtsp");
  assert.equal(serviceForPort(49999), "unknown");
});
