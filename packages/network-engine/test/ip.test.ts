import assert from "node:assert/strict";
import test from "node:test";
import { assertPrivateTarget, cidrFromAddressAndNetmask, isPrivateIpv4 } from "../src/ip";

test("recognizes RFC1918 IPv4 ranges only", () => {
  assert.equal(isPrivateIpv4("10.1.2.3"), true);
  assert.equal(isPrivateIpv4("172.16.0.1"), true);
  assert.equal(isPrivateIpv4("172.31.255.255"), true);
  assert.equal(isPrivateIpv4("172.32.0.1"), false);
  assert.equal(isPrivateIpv4("192.168.1.1"), true);
  assert.equal(isPrivateIpv4("8.8.8.8"), false);
});

test("derives a network CIDR from an address and netmask", () => {
  assert.equal(cidrFromAddressAndNetmask("192.168.4.12", "255.255.255.0"), "192.168.4.0/24");
  assert.equal(cidrFromAddressAndNetmask("10.4.9.2", "255.0.0.0"), "10.0.0.0/8");
});

test("blocks public scan targets", () => {
  assert.throws(() => assertPrivateTarget("1.1.1.1"), /private IPv4/);
  assert.doesNotThrow(() => assertPrivateTarget("192.168.1.22"));
});
