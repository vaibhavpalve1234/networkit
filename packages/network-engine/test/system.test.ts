import assert from "node:assert/strict";
import test from "node:test";
import { hostsInCidr } from "../src/system";

test("enumerates usable hosts for a bounded CIDR", () => {
  assert.deepEqual(hostsInCidr("192.168.1.0/30"), ["192.168.1.1", "192.168.1.2"]);
});

test("refuses a subnet that exceeds the active discovery ceiling", () => {
  assert.throws(() => hostsInCidr("10.0.0.0/8"), /limit is 1024/);
});
