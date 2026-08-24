import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  OVERPASS_QUERY,
  buildSnapshot,
  canonicalPointsJson,
  serializeSnapshot,
  sha256,
} from "../../scripts/generate-osm-stamps.js";

const OSM_BASE_TIMESTAMP = "2026-08-24T10:15:51Z";
const RETRIEVED_AT = "2026-08-24T10:16:00Z";
const EXPECTED_POINT_KEYS = ["coordinates", "name", "number", "osm", "season"];
const EXPECTED_COORDINATE_KEYS = ["latitude", "longitude"];
const EXPECTED_OSM_KEYS = ["id", "timestamp", "type", "version"];

function makeNode(number, overrides = {}) {
  const paddedNumber = String(number).padStart(3, "0");
  const suffix = number === 36 ? "Peterstein" : `Test point ${paddedNumber}`;

  return {
    type: "node",
    id: 1_000_000 + number,
    lat: 51 + number / 10_000,
    lon: 10 + number / 10_000,
    version: 2,
    timestamp: "2026-08-23T09:00:00Z",
    tags: {
      tourism: "checkpoint",
      checkpoint: "hiking",
      "checkpoint:type": "stamp",
      ref: `HWN ${paddedNumber}`,
      name: `HWN ${paddedNumber} - ${suffix}`,
      operator: "must not be copied",
      website: "https://example.invalid/must-not-be-copied",
      description: "must not be copied",
      note: "must not be copied",
      image: "https://example.invalid/must-not-be-copied.jpg",
    },
    ...overrides,
  };
}

function makeValidResponse() {
  const elements = Array.from({ length: 222 }, (_, index) =>
    makeNode(index + 1),
  );
  elements[68] = makeNode(69, {
    id: 2_000_069,
    tags: {
      ...elements[68].tags,
      name: "HWN 069 - Sonnenklippe Sommer",
      seasonal: "spring;summer;autumn",
    },
  });
  elements.push(
    makeNode(69, {
      id: 3_000_069,
      tags: {
        ...elements[68].tags,
        name: "HWN 069 - Sonnenklippe Winter",
        seasonal: "winter",
      },
    }),
  );

  return {
    version: 0.6,
    osm3s: {
      timestamp_osm_base: OSM_BASE_TIMESTAMP,
      copyright: "OpenStreetMap data under ODbL",
    },
    elements: elements.reverse(),
  };
}

function assertPointShape(point) {
  expect(Object.keys(point).sort()).toEqual(EXPECTED_POINT_KEYS);
  expect(Object.keys(point.coordinates).sort()).toEqual(
    EXPECTED_COORDINATE_KEYS,
  );
  expect(Object.keys(point.osm).sort()).toEqual(EXPECTED_OSM_KEYS);
}

describe("OSM stamp snapshot generator", () => {
  it("strictly transforms, strips and deterministically sorts 223 OSM nodes", () => {
    const snapshot = buildSnapshot(makeValidResponse(), RETRIEVED_AT);

    expect(snapshot.points).toHaveLength(223);
    expect(new Set(snapshot.points.map((point) => point.number)).size).toBe(
      222,
    );
    expect(snapshot.points[35].name).toBe("036 – Peterstein");
    expect(snapshot.points[68].season).toBe("spring;summer;autumn");
    expect(snapshot.points[69].season).toBe("winter");
    expect(snapshot.points.map((point) => point.number)).toEqual(
      [...snapshot.points.map((point) => point.number)].sort(),
    );
    snapshot.points.forEach(assertPointShape);

    const serializedPoints = JSON.stringify(snapshot.points);
    expect(serializedPoints).not.toContain("operator");
    expect(serializedPoints).not.toContain("website");
    expect(serializedPoints).not.toContain("description");
    expect(serializedPoints).not.toContain("note");
    expect(serializedPoints).not.toContain("image");
    expect(serializedPoints).not.toContain("must-not-be-copied");
    expect(snapshot.metadata.entriesSha256).toBe(
      sha256(canonicalPointsJson(snapshot.points)),
    );
  });

  it("rejects an incomplete relation result", () => {
    const response = makeValidResponse();
    response.elements.pop();

    expect(() => buildSnapshot(response, RETRIEVED_AT)).toThrow(
      "expected 223 nodes, received 222",
    );
  });

  it("rejects a second duplicate number", () => {
    const response = makeValidResponse();
    const point070 = response.elements.find(
      (element) => element.tags.ref === "HWN 070",
    );
    point070.tags = {
      ...point070.tags,
      ref: "HWN 071",
      name: "HWN 071 - Unexpected duplicate",
    };

    expect(() => buildSnapshot(response, RETRIEVED_AT)).toThrow(
      "numbers must cover exactly 001 through 222",
    );
  });

  it("rejects missing and unexpected season assignments", () => {
    const missingSeason = makeValidResponse();
    delete missingSeason.elements.find((element) => element.id === 2_000_069)
      .tags.seasonal;
    expect(() => buildSnapshot(missingSeason, RETRIEVED_AT)).toThrow(
      "must use exactly the two expected seasons",
    );

    const unexpectedSeason = makeValidResponse();
    unexpectedSeason.elements.find(
      (element) => element.tags.ref === "HWN 070",
    ).tags.seasonal = "winter";
    expect(() => buildSnapshot(unexpectedSeason, RETRIEVED_AT)).toThrow(
      "only number 069 may have a season",
    );
  });

  it("rejects absent provenance and malformed names or coordinates", () => {
    const missingVersion = makeValidResponse();
    delete missingVersion.elements[0].version;
    expect(() => buildSnapshot(missingVersion, RETRIEVED_AT)).toThrow(
      "invalid OSM version",
    );

    const malformedName = makeValidResponse();
    malformedName.elements[0].tags.name = "Unbranded but untraceable";
    expect(() => buildSnapshot(malformedName, RETRIEVED_AT)).toThrow(
      "name does not match ref",
    );

    const malformedCoordinate = makeValidResponse();
    malformedCoordinate.elements[0].lat = Number.NaN;
    expect(() => buildSnapshot(malformedCoordinate, RETRIEVED_AT)).toThrow(
      "invalid latitude",
    );
  });
});

describe("committed OSM stamp snapshot", () => {
  it("contains only the validated public schema and matching SHA-256 values", async () => {
    const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
    const snapshotPath = path.resolve(
      scriptDirectory,
      "../../static/data/osm-stamp-points.json",
    );
    const sidecarPath = `${snapshotPath}.sha256`;
    const serialized = await readFile(snapshotPath, "utf8");
    const snapshot = JSON.parse(serialized);
    const sidecar = await readFile(sidecarPath, "utf8");

    expect(Object.keys(snapshot).sort()).toEqual(["metadata", "points"]);
    expect(snapshot.metadata.query).toBe(OVERPASS_QUERY);
    expect(snapshot.metadata.relation).toBe(148007);
    expect(snapshot.metadata.odbl.license).toContain("ODbL");
    expect(snapshot.metadata.odbl.attribution).toBe(
      "© OpenStreetMap contributors",
    );
    expect(snapshot.metadata.entriesSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(snapshot.metadata.entriesSha256).toBe(
      sha256(canonicalPointsJson(snapshot.points)),
    );
    expect(sidecar).toBe(
      `${createHash("sha256").update(serialized).digest("hex")}  osm-stamp-points.json\n`,
    );
    expect(serialized).toBe(serializeSnapshot(snapshot));

    expect(snapshot.points).toHaveLength(223);
    expect(new Set(snapshot.points.map((point) => point.number)).size).toBe(
      222,
    );
    expect(
      snapshot.points
        .filter((point) => point.number === "069")
        .map((point) => point.season),
    ).toEqual(["spring;summer;autumn", "winter"]);
    expect(
      snapshot.points.filter(
        (point) => point.number !== "069" && point.season !== null,
      ),
    ).toEqual([]);
    snapshot.points.forEach((point) => {
      assertPointShape(point);
      expect(point.name.startsWith(`${point.number} – `)).toBe(true);
      expect(point.osm.type).toBe("node");
      expect(Number.isSafeInteger(point.osm.id)).toBe(true);
      expect(point.osm.version).toBeGreaterThan(0);
      expect(point.osm.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u,
      );
      expect(Number.isFinite(point.coordinates.latitude)).toBe(true);
      expect(Number.isFinite(point.coordinates.longitude)).toBe(true);
    });
  });
});
