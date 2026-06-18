import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { fromKMZ } from "./gpx_util";
import { parsePoisFromKmlFile } from "./poi_util";

const kmlWithWaypoint = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Waypoint 1</name>
      <Point>
        <coordinates>11.57,48.13,0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

describe("KMZ import", () => {
    it("imports waypoints from KMZ even if doc.kml is not at archive root", async () => {
        const zip = new JSZip();
        zip.file("nested/doc.kml", kmlWithWaypoint);
        const kmzData = await zip.generateAsync({ type: "arraybuffer" });

        const gpx = await fromKMZ(kmzData);

        expect(gpx).toContain("<wpt ");
        expect(gpx).toContain("<name>Waypoint 1</name>");
    });

    it("imports POIs from KMZ with non-standard KML filename", async () => {
        const zip = new JSZip();
        zip.file("folder/pois.kml", kmlWithWaypoint);
        const kmzBuffer = await zip.generateAsync({ type: "arraybuffer" });
        const kmzBlob = new Blob([kmzBuffer], { type: "application/vnd.google-earth.kmz" });

        const pois = await parsePoisFromKmlFile(kmzBlob, {
            category: "test-category",
            isPublic: true,
            author: "test-author",
            attributeDefinitions: [],
        });

        expect(pois).toHaveLength(1);
        expect(pois[0].name).toBe("Waypoint 1");
        expect(pois[0].lat).toBe(48.13);
        expect(pois[0].lon).toBe(11.57);
    });
});
