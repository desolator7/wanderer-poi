import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const OSM_RELATION_ID = 148007;
export const OVERPASS_QUERY =
  '[out:json][timeout:120]; rel(148007)->.network; node(r.network)["tourism"="checkpoint"]["checkpoint"~"(^|;)hiking($|;)"]["checkpoint:type"="stamp"]; out meta;';

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const EXPECTED_POINT_COUNT = 223;
const EXPECTED_NUMBER_COUNT = 222;
const DUPLICATE_NUMBER = "069";
const EXPECTED_SEASONS = ["spring;summer;autumn", "winter"];
const POINT_KEYS = ["number", "name", "coordinates", "season", "osm"];
const COORDINATE_KEYS = ["latitude", "longitude"];
const OSM_KEYS = ["type", "id", "version", "timestamp"];

function fail(message) {
  throw new Error(`Invalid OSM stamp data: ${message}`);
}

function assertExactKeys(value, expectedKeys, context) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  if (JSON.stringify(actualKeys) !== JSON.stringify(sortedExpectedKeys)) {
    fail(`${context} has unexpected fields: ${actualKeys.join(", ")}`);
  }
}

function assertIsoTimestamp(value, context) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)
  ) {
    fail(`${context} must be an ISO 8601 UTC timestamp`);
  }

  if (!Number.isFinite(Date.parse(value))) {
    fail(`${context} is not a valid timestamp`);
  }
}

function containsHikingCheckpoint(value) {
  return (
    typeof value === "string" &&
    value.split(";").some((checkpoint) => checkpoint.trim() === "hiking")
  );
}

function parseNumber(tags, nodeId) {
  const refMatch = /^HWN (\d{3})$/u.exec(tags.ref ?? "");
  if (!refMatch) {
    fail(`node ${nodeId} has an invalid or missing ref`);
  }

  const number = refMatch[1];
  const numericNumber = Number(number);
  if (numericNumber < 1 || numericNumber > EXPECTED_NUMBER_COUNT) {
    fail(`node ${nodeId} has out-of-range number ${number}`);
  }

  return number;
}

function neutralizeName(rawName, number, nodeId) {
  if (typeof rawName !== "string") {
    fail(`node ${nodeId} has no name`);
  }

  const nameMatch = /^HWN (\d{3}) - (\S(?:.*\S)?)$/u.exec(rawName);
  if (!nameMatch || nameMatch[1] !== number) {
    fail(`node ${nodeId} name does not match ref HWN ${number}`);
  }

  if (/\p{Cc}/u.test(nameMatch[2])) {
    fail(`node ${nodeId} name contains control characters`);
  }

  return `${number} – ${nameMatch[2]}`;
}

function transformNode(element, osmBaseTimestamp) {
  if (element?.type !== "node") {
    fail(`element ${element?.id ?? "without id"} is not a node`);
  }
  if (!Number.isSafeInteger(element.id) || element.id <= 0) {
    fail("node has an invalid OSM id");
  }
  if (!Number.isSafeInteger(element.version) || element.version <= 0) {
    fail(`node ${element.id} has an invalid OSM version`);
  }
  assertIsoTimestamp(element.timestamp, `node ${element.id} timestamp`);
  if (Date.parse(element.timestamp) > Date.parse(osmBaseTimestamp)) {
    fail(`node ${element.id} timestamp is newer than the OSM base timestamp`);
  }
  if (
    typeof element.lat !== "number" ||
    !Number.isFinite(element.lat) ||
    element.lat < -90 ||
    element.lat > 90
  ) {
    fail(`node ${element.id} has an invalid latitude`);
  }
  if (
    typeof element.lon !== "number" ||
    !Number.isFinite(element.lon) ||
    element.lon < -180 ||
    element.lon > 180
  ) {
    fail(`node ${element.id} has an invalid longitude`);
  }

  const tags = element.tags;
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) {
    fail(`node ${element.id} has no tags`);
  }
  if (
    tags.tourism !== "checkpoint" ||
    tags["checkpoint:type"] !== "stamp" ||
    !containsHikingCheckpoint(tags.checkpoint)
  ) {
    fail(`node ${element.id} does not match the required checkpoint tags`);
  }

  const number = parseNumber(tags, element.id);
  const season = tags.seasonal ?? null;
  if (season !== null && !EXPECTED_SEASONS.includes(season)) {
    fail(`node ${element.id} has unexpected season ${JSON.stringify(season)}`);
  }

  return {
    number,
    name: neutralizeName(tags.name, number, element.id),
    coordinates: {
      latitude: element.lat,
      longitude: element.lon,
    },
    season,
    osm: {
      type: "node",
      id: element.id,
      version: element.version,
      timestamp: element.timestamp,
    },
  };
}

function comparePoints(left, right) {
  if (left.number !== right.number) {
    return left.number < right.number ? -1 : 1;
  }
  if (left.season !== right.season) {
    if (left.season === null) return -1;
    if (right.season === null) return 1;
    return left.season < right.season ? -1 : 1;
  }
  return left.osm.id - right.osm.id;
}

function validatePointSet(points) {
  if (points.length !== EXPECTED_POINT_COUNT) {
    fail(`expected ${EXPECTED_POINT_COUNT} nodes, received ${points.length}`);
  }

  const ids = new Set();
  const names = new Set();
  const pointsByNumber = new Map();

  for (const point of points) {
    assertExactKeys(point, POINT_KEYS, `point ${point.number}`);
    assertExactKeys(
      point.coordinates,
      COORDINATE_KEYS,
      `point ${point.number} coordinates`,
    );
    assertExactKeys(point.osm, OSM_KEYS, `point ${point.number} OSM metadata`);

    if (ids.has(point.osm.id)) {
      fail(`OSM node ${point.osm.id} occurs more than once`);
    }
    ids.add(point.osm.id);

    if (names.has(point.name)) {
      fail(`neutral name ${JSON.stringify(point.name)} occurs more than once`);
    }
    names.add(point.name);

    const group = pointsByNumber.get(point.number) ?? [];
    group.push(point);
    pointsByNumber.set(point.number, group);
  }

  const expectedNumbers = Array.from(
    { length: EXPECTED_NUMBER_COUNT },
    (_, index) => String(index + 1).padStart(3, "0"),
  );
  const actualNumbers = [...pointsByNumber.keys()].sort();
  if (JSON.stringify(actualNumbers) !== JSON.stringify(expectedNumbers)) {
    fail("numbers must cover exactly 001 through 222");
  }

  const duplicateNumbers = [...pointsByNumber]
    .filter(([, group]) => group.length !== 1)
    .map(([number]) => number);
  if (
    duplicateNumbers.length !== 1 ||
    duplicateNumbers[0] !== DUPLICATE_NUMBER
  ) {
    fail(`only number ${DUPLICATE_NUMBER} may occur twice`);
  }

  const duplicateGroup = pointsByNumber.get(DUPLICATE_NUMBER);
  if (duplicateGroup.length !== 2) {
    fail(`number ${DUPLICATE_NUMBER} must occur exactly twice`);
  }
  const actualSeasons = duplicateGroup.map((point) => point.season).sort();
  if (
    JSON.stringify(actualSeasons) !==
    JSON.stringify([...EXPECTED_SEASONS].sort())
  ) {
    fail(
      `number ${DUPLICATE_NUMBER} must use exactly the two expected seasons`,
    );
  }

  const unexpectedSeason = points.find(
    (point) => point.number !== DUPLICATE_NUMBER && point.season !== null,
  );
  if (unexpectedSeason) {
    fail(`only number ${DUPLICATE_NUMBER} may have a season`);
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalPointsJson(points) {
  return `${JSON.stringify(points)}\n`;
}

function currentUtcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
}

export function buildSnapshot(response, retrievedAt = currentUtcTimestamp()) {
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    fail("Overpass response is not an object");
  }
  if (response.remark) {
    fail(`Overpass returned a remark: ${response.remark}`);
  }
  if (!Array.isArray(response.elements)) {
    fail("Overpass response has no elements array");
  }

  const osmBaseTimestamp = response.osm3s?.timestamp_osm_base;
  assertIsoTimestamp(osmBaseTimestamp, "OSM base timestamp");
  assertIsoTimestamp(retrievedAt, "retrieval timestamp");
  if (Date.parse(retrievedAt) < Date.parse(osmBaseTimestamp)) {
    fail("retrieval timestamp predates the OSM base timestamp");
  }

  const points = response.elements
    .map((element) => transformNode(element, osmBaseTimestamp))
    .sort(comparePoints);
  validatePointSet(points);

  return {
    metadata: {
      query: OVERPASS_QUERY,
      relation: OSM_RELATION_ID,
      retrievedAt,
      osmBaseTimestamp,
      transformation:
        "Strictly validated OSM nodes; retained only number, neutralized name, coordinates, season and OSM provenance; sorted by number, season and OSM id.",
      odbl: {
        license: "Open Data Commons Open Database License (ODbL) v1.0",
        attribution: "© OpenStreetMap contributors",
        url: "https://www.openstreetmap.org/copyright",
      },
      entriesSha256: sha256(canonicalPointsJson(points)),
    },
    points,
  };
}

export function serializeSnapshot(snapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

async function fetchOverpass() {
  const body = new URLSearchParams({ data: OVERPASS_QUERY });
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "wanderer-osm-stamp-snapshot/1.0",
        },
        body,
        signal: AbortSignal.timeout(150_000),
      });

      if (!response.ok) {
        throw new Error(
          `Overpass HTTP ${response.status} ${response.statusText}`,
        );
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
      }
    }
  }

  throw lastError;
}

async function writeSnapshot(snapshot) {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const outputDirectory = path.resolve(scriptDirectory, "../static/data");
  const outputPath = path.join(outputDirectory, "osm-stamp-points.json");
  const sidecarPath = `${outputPath}.sha256`;
  const serialized = serializeSnapshot(snapshot);
  const temporaryOutputPath = `${outputPath}.tmp-${process.pid}`;
  const temporarySidecarPath = `${sidecarPath}.tmp-${process.pid}`;

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(temporaryOutputPath, serialized, "utf8");
  await writeFile(
    temporarySidecarPath,
    `${sha256(serialized)}  ${path.basename(outputPath)}\n`,
    "utf8",
  );
  await rename(temporaryOutputPath, outputPath);
  await rename(temporarySidecarPath, sidecarPath);

  return { outputPath, sidecarPath };
}

async function main() {
  const response = await fetchOverpass();
  const snapshot = buildSnapshot(response);
  const { outputPath, sidecarPath } = await writeSnapshot(snapshot);
  console.log(
    `Wrote ${snapshot.points.length} OSM stamp points to ${outputPath}`,
  );
  console.log(`Wrote SHA-256 sidecar to ${sidecarPath}`);
}

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
