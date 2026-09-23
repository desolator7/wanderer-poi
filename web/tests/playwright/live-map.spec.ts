import { expect, test, type Page } from "@playwright/test";

test.use({
    baseURL: process.env.LIVE_MAP_TEST_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
    permissions: ["geolocation"],
    locale: "de-DE",
    hasTouch: true,
});

async function loadLiveMap(page: Page) {
    await page.route(/^https:\/\//, (route) => route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e8ede4" } }] }),
    }));
    await page.addInitScript(() => {
        const points = [
            [10.7, 300, "2026-09-23T08:00:00Z"],
            [10.71, 550, "2026-09-23T08:05:00Z"],
            [10.72, 400, "2026-09-23T08:15:00Z"],
        ];
        localStorage.setItem("wanderer-pwa-live-route", JSON.stringify({
            version: 2,
            trailId: "live-test-route",
            sourcePath: "/trail/edit/live-test-route",
            zoomPreset: "medium",
            offlineMap: { profileId: "opentopomap-route-v1", routeFingerprint: "a".repeat(64) },
            trail: {
                name: "Testwanderung zum Brocken",
                plannedDurationSeconds: 7200,
                gpxData: `<gpx version="1.1"><trk><trkseg>${points.map(([lon, ele, time]) => `<trkpt lat="51.8" lon="${lon}"><ele>${ele}</ele><time>${time}</time></trkpt>`).join("")}</trkseg></trk></gpx>`,
            },
        }));
        Object.defineProperty(navigator, "standalone", { value: true });
        let latest = { latitude: 51.8, longitude: 10.71, accuracy: 5 };
        const watchers = new Map<number, { success: PositionCallback; error?: PositionErrorCallback | null }>();
        let nextId = 0;
        const position = () => ({
            coords: { ...latest, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
            timestamp: Date.now(),
        }) as GeolocationPosition;
        Object.defineProperty(navigator, "geolocation", { value: {
            getCurrentPosition(success: PositionCallback) { setTimeout(() => success(position()), 0); },
            watchPosition(success: PositionCallback, error?: PositionErrorCallback) {
                const id = ++nextId;
                watchers.set(id, { success, error });
                setTimeout(() => watchers.has(id) && success(position()), 0);
                return id;
            },
            clearWatch(id: number) { watchers.delete(id); },
        } });
        (window as any).liveMapTest = {
            move(latitude: number, longitude: number, accuracy = 5) {
                latest = { latitude, longitude, accuracy };
                watchers.forEach(({ success }) => success(position()));
            },
            fail(code: number) {
                watchers.forEach(({ error }) => error?.({ code, message: "Test GPS failure" } as GeolocationPositionError));
            },
        };
    });
    await page.goto("/live");
    await expect(page.getByText("Auf der Route", { exact: true })).toBeVisible();
    await expect(page.getByText("1 h 20 min", { exact: true })).toBeVisible();
}

async function verifyControlLayout(page: Page) {
    const layout = await page.evaluate(() => {
        const panel = document.querySelector(".progress-panel")!.getBoundingClientRect();
        const controls = [...document.querySelectorAll(".maplibregl-ctrl-top-right > *")].map((el) => el.getBoundingClientRect());
        const scale = document.querySelector(".maplibregl-ctrl-scale")!.getBoundingClientRect();
        const overlay = document.querySelector(".live-overlay")!.getBoundingClientRect();
        return {
            controlsClear: controls.every((control) => control.left >= panel.right),
            scaleClear: scale.top >= overlay.bottom,
            withinViewport: panel.left >= 0 && panel.right <= innerWidth,
            pageOverflow: document.documentElement.scrollWidth > innerWidth,
        };
    });
    expect(layout).toEqual({ controlsClear: true, scaleClear: true, withinViewport: true, pageOverflow: false });
}

for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    test(`live information and map controls fit ${viewport.width}×${viewport.height}`, async ({ page }) => {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setViewportSize(viewport);
        await loadLiveMap(page);
        await verifyControlLayout(page);
        await expect(page.getByRole("button", { name: "Livemodus beenden" })).toHaveText("");
        await expect(page.locator(".progress-panel")).not.toContainText("Livemodus");
        const height = (await page.locator(".progress-panel").boundingBox())!.height;
        await page.screenshot({ path: test.info().outputPath("metrics.png") });
        await page.getByRole("button", { name: "Höhenprofil", exact: true }).click();
        await expect(page.getByRole("button", { name: "Höhenprofil", exact: true })).toHaveAttribute("aria-pressed", "true");
        await expect.poll(() => page.locator(".pages").evaluate((element) => element.scrollLeft / element.clientWidth)).toBeCloseTo(1, 2);
        await expect(page.locator(".position-dot")).toBeVisible();
        expect((await page.locator(".progress-panel").boundingBox())!.height).toBe(height);
        await page.screenshot({ path: test.info().outputPath("profile.png") });
        await page.getByRole("button", { name: "Höhenprofil", exact: true }).press("ArrowLeft");
        await expect(page.getByRole("button", { name: "Kennzahlen", exact: true })).toHaveAttribute("aria-pressed", "true");
        await page.getByRole("button", { name: "toggle style switcher" }).click();
        await expect(page.getByRole("button", { name: "close style switcher" })).toBeVisible();
        const close = page.getByRole("button", { name: "close style switcher" });
        await close.click();
        await page.addStyleTag({ content: ".live-shell { --live-top: 47px; --live-left: 20px; --live-right: 20px; }" });
        await verifyControlLayout(page);
        expect(errors).toEqual([]);
    });
}

test("keeps the last valid progress and resumes after GPS failures", async ({ page }) => {
    await loadLiveMap(page);
    await page.evaluate(() => (window as any).liveMapTest.move(51.81, 10.71));
    await expect(page.getByText("Außerhalb der Route · Letzter Stand")).toBeVisible();
    await expect(page.getByText("1 h 20 min", { exact: true })).toBeVisible();
    await page.evaluate(() => (window as any).liveMapTest.move(51.8, 10.715, 150));
    await expect(page.getByText("GPS-Signal zu ungenau · Letzter Stand")).toBeVisible();
    await page.evaluate(() => (window as any).liveMapTest.fail(2));
    await expect(page.getByText("Standort nicht verfügbar · Letzter Stand")).toBeVisible();
    await page.evaluate(() => (window as any).liveMapTest.move(51.8, 10.715));
    await expect(page.getByText("Auf der Route", { exact: true })).toBeVisible();
    await expect(page.getByText("0 h 40 min", { exact: true })).toBeVisible();
    await page.clock.install();
    await page.clock.fastForward(31_000);
    await expect(page.getByText("Kein aktuelles GPS-Signal · Letzter Stand")).toBeVisible();
    await page.evaluate(() => (window as any).liveMapTest.fail(1));
    await expect(page.getByText("Standortfreigabe erforderlich · Letzter Stand")).toBeVisible();
});

test("retains profile selection and progress when rebuilding the map", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadLiveMap(page);
    await page.getByRole("button", { name: "Höhenprofil", exact: true }).click();
    await page.getByRole("button", { name: /Weit \(Offline\)/ }).click();
    await expect(page.getByRole("button", { name: "Höhenprofil", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".position-dot")).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText("Offline", { exact: true })).toBeVisible();
    await page.evaluate(() => (window as any).liveMapTest.move(51.8, 10.715));
    await page.getByRole("button", { name: "Kennzahlen", exact: true }).click();
    await expect(page.getByText("0 h 40 min", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Höhenprofil", exact: true }).click();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole("button", { name: "Höhenprofil", exact: true })).toHaveAttribute("aria-pressed", "true");
    await verifyControlLayout(page);
    // The dev server has no installed offline shell; serve its actual static file.
    await page.route("**/pwa-start.html", (route) => route.fulfill({ path: "static/pwa-start.html", contentType: "text/html" }));
    await page.getByRole("button", { name: "Livemodus beenden" }).click();
    await expect(page).toHaveURL(/pwa-start\.html$/);
    expect(await page.evaluate(() => localStorage.getItem("wanderer-pwa-live-route-recovery"))).toBe("1");
});

test("switches pages with a horizontal touch gesture", async ({ page, context }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadLiveMap(page);
    const viewport = (await page.locator(".pages").boundingBox())!;
    const session = await context.newCDPSession(page);
    const x = viewport.x + viewport.width - 20;
    const y = viewport.y + viewport.height / 2;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
        await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - (viewport.width - 40) * step / 8, y }] });
        await page.waitForTimeout(20);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.getByRole("button", { name: "Höhenprofil", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".position-dot")).toBeVisible();
});
