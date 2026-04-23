<script lang="ts">
    import { env } from "$env/dynamic/public";
    import Button from "$lib/components/base/button.svelte";
    import Datepicker from "$lib/components/base/datepicker.svelte";
    import Select from "$lib/components/base/select.svelte";
    import TextField from "$lib/components/base/text_field.svelte";
    import Toggle from "$lib/components/base/toggle.svelte";
    import ListSearchModal from "$lib/components/list/list_search_modal.svelte";
    import SummitLogCard from "$lib/components/summit_log/summit_log_card.svelte";
    import SummitLogModal from "$lib/components/summit_log/summit_log_modal.svelte";
    import MapWithElevationMaplibre from "$lib/components/trail/map_with_elevation_maplibre.svelte";
    import PhotoPicker from "$lib/components/trail/photo_picker.svelte";
    import WaypointCard from "$lib/components/waypoint/waypoint_card.svelte";
    import WaypointModal from "$lib/components/waypoint/waypoint_modal.svelte";
    import { SummitLogCreateSchema } from "$lib/models/api/summit_log_schema.js";
    import { TrailCreateSchema } from "$lib/models/api/trail_schema.js";
    import { WaypointCreateSchema } from "$lib/models/api/waypoint_schema.js";
    import GPX from "$lib/models/gpx/gpx";
    import GPXWaypoint from "$lib/models/gpx/waypoint";
    import type { List } from "$lib/models/list";
    import { SummitLog } from "$lib/models/summit_log";
    import { Trail } from "$lib/models/trail";
    import type { RoutingOptions, ValhallaAnchor } from "$lib/models/valhalla";
    import { Waypoint } from "$lib/models/waypoint";
    import { categories } from "$lib/stores/category_store";
    import {
        lists_add_trail,
        lists_remove_trail,
    } from "$lib/stores/list_store";
    import { summitLog } from "$lib/stores/summit_log_store";
    import { show_toast } from "$lib/stores/toast_store.svelte.js";
    import {
        trail,
        trails_create,
        trails_update,
    } from "$lib/stores/trail_store.js";
    import {
        valhallaStore,
        calculateRouteBetween,
        clearAnchors,
        clearRoute,
        deleteFromRoute,
        editRoute,
        insertIntoRoute,
        normalizeRouteTime,
        recalculateHeight,
        resetRoute,
        reverseRoute,
        setRoute,
        splitSegment,
        undo,
        redo,
        clearUndoRedoStack,
    } from "$lib/stores/valhalla_store.svelte.js";
    import { waypoint } from "$lib/stores/waypoint_store";
    import { getFileURL } from "$lib/util/file_util";
    import {
        formatDistance,
        formatElevation,
        formatTimeHHMM,
    } from "$lib/util/format_util";
    import { cropGPX, fromFile, gpx2trail } from "$lib/util/gpx_util";

    import { page } from "$app/state";
    import emptyStateTrailDark from "$lib/assets/svgs/empty_states/empty_state_trail_dark.svg";
    import emptyStateTrailLight from "$lib/assets/svgs/empty_states/empty_state_trail_light.svg";
    import Combobox, {
        type ComboboxItem,
    } from "$lib/components/base/combobox.svelte";
    import type { DropdownItem } from "$lib/components/base/dropdown.svelte";
    import Editor from "$lib/components/base/editor.svelte";
    import Search, {
        type SearchItem,
    } from "$lib/components/base/search.svelte";
    import PoiFilterPanel from "$lib/components/poi/poi_filter_panel.svelte";
    import RouteEditor from "$lib/components/trail/route_editor.svelte";
    import { TagCreateSchema } from "$lib/models/api/tag_schema.js";
    import { convertDMSToDD, haversineDistance } from "$lib/models/gpx/utils.js";
    import { Tag } from "$lib/models/tag.js";
    import { Poi } from "$lib/models/poi";
    import {
        searchLocationReverse,
        searchLocationReverseFeature,
        searchLocations,
    } from "$lib/stores/search_store.js";
    import { tags_index } from "$lib/stores/tag_store.js";
    import { theme } from "$lib/stores/theme_store.js";
    import { currentUser } from "$lib/stores/user_store.js";
    import { getIconForLocation } from "$lib/util/icon_util.js";
    import {
        createAnchorMarker,
        FontawesomeMarker,
    } from "$lib/util/maplibre_util";
    import {
        createWaypointFromTap,
        getRoutingRoleByIndex,
        getWaypointInsertIndexByNearestSegment,
        simplifyPolylinePoints,
    } from "$lib/util/waypoint_routing";
    import EXIF from "$lib/vendor/exif-js/exif.js";
    import { validator } from "@felte/validator-zod";
    import cryptoRandomString from "crypto-random-string";
    import { createForm } from "felte";
    import * as M from "maplibre-gl";
    import { onDestroy, onMount, tick, untrack } from "svelte";
    import { _ } from "svelte-i18n";
    import { get } from "svelte/store";
    import { backInOut } from "svelte/easing";
    import { fly, slide } from "svelte/transition";
    import { z } from "zod";
    import Track from "$lib/models/gpx/track.js";
    import TrackSegment from "$lib/models/gpx/track-segment.js";

    let { data } = $props();

    let map: M.Map | undefined = $state();
    let mapTrail: Trail[] = $state([]);
    let lists = $state(untrack(() => data.lists));

    let waypointModal: WaypointModal;
    let summitLogModal: SummitLogModal;
    let listSelectModal: ListSearchModal;

    let loading = $state(false);

    let editingBasicInfo: boolean = $state(false);

    let photoFiles: File[] = $state([]);

    let gpxFile: File | Blob | null = null;

    let drawingActive = $state(false);
    let overwriteGPX = false;
    let draggingMarker = false;
    let snapImportedRouteToValhalla = $state(false);

    let searchDropdownItems: SearchItem[] = $state([]);

    let cropStartMarker: FontawesomeMarker;
    let cropEndMarker: FontawesomeMarker;
    let routePlannerPois: Poi[] = $state(untrack(() => data.pois));
    let includePublicPois = $state(true);
    let includeOwnPois = $state(true);
    let selectedPoiCategoryIds = $state(
        data.poiCategories.map((category) => category.id!),
    );
    let filteredRoutePlannerPois = $derived(
        routePlannerPois.filter((poi) => {
            if (!selectedPoiCategoryIds.includes(poi.category)) {
                return false;
            }
            if (!includePublicPois && poi.public) {
                return false;
            }
            if (!includeOwnPois && poi.author === page.data.user?.id) {
                return false;
            }
            return true;
        }),
    );

    let croppedGPX: GPX | null = null;

    const ClientTrailCreateSchema = TrailCreateSchema.extend({
        expand: z
            .object({
                gpx_data: z.string().optional(),
                summit_logs_via_trail: z
                    .array(SummitLogCreateSchema)
                    .optional(),
                waypoints_via_trail: z
                    .array(
                        WaypointCreateSchema.extend({
                            marker: z.any().optional(),
                            connectionMode: z
                                .enum(["snap", "straight", "original-kml"])
                                .optional(),
                        }),
                    )
                    .optional(),
                tags: z.array(TagCreateSchema).optional(),
            })
            .optional(),
    });

    let routingOptions: RoutingOptions = $state({
        autoRouting: true,
        modeOfTransport: "pedestrian",
        pedestrianOptions: {
            max_hiking_difficulty: 3,
            walking_speed: 5.1,
            use_hills: 1,
            use_tracks: 1,
            walkway_factor: 0.7,
            sidewalk_factor: 1,
            shortest: true,
        },
        bicycleOptions: {
            bicycle_type: "Mountain",
            cycling_speed: 16,
            use_roads: 0,
            use_hills: 0.8,
            avoid_bad_surfaces: 0,
            shortest: true,
        },
    });
    let mapWaypointPopup: M.Popup | null = $state(null);
    let pendingWaypointInsertIndex: number | null = null;
    let importedOriginalRoute: GPX | null = $state(null);
    let importedOriginalSegments: GPXWaypoint[][] = $state([]);
    let waypointRecalcDebounceTimeout: ReturnType<typeof setTimeout> | null =
        null;
    let waypointRecalcInFlight = false;
    let queuedWaypointRecalcOptions: { showSuccessToast?: boolean } | null =
        null;
    const waypointRecalcDebounceMs = 250;
    const originalKmlImportSimplifyOptions = {
        toleranceMeters: 8,
        maxPoints: 150,
    };
    const valhallaSnapImportSimplifyOptions = {
        toleranceMeters: 90,
        maxPoints: 35,
        minDistanceMeters: 120,
    };

    let savedAtLeastOnce = $state(false);

    let tagItems: ComboboxItem[] = $state([]);
    type RouteSegmentEndpoint = { lat: number; lon: number };
    type WaypointConnectionMode = "snap" | "straight" | "original-kml";
    type LoopConnectionMode = "none" | "snap" | "straight";

    const getInitialFormValues = () => ({
        ...data.trail,
        public: data.trail.id
            ? data.trail.public
            : page.data.settings?.privacy?.trails === "public",
        category:
            data.trail.category ||
            page.data.settings?.category ||
            $categories[0].id,
    });

    let loopConnectionMode: LoopConnectionMode = $state("none");

    const {
        form,
        errors,
        data: formData,
        setFields,
    } = createForm<z.infer<typeof ClientTrailCreateSchema>>({
        initialValues: getInitialFormValues(),
        extend: validator({
            schema: ClientTrailCreateSchema,
        }),
        onSubmit: async (form) => {
            loading = true;
            try {
                const htmlForm = document.getElementById(
                    "trail-form",
                ) as HTMLFormElement;
                const formData = new FormData(htmlForm);
                if (!formData.get("public")) {
                    form.public = false;
                }
                form.photos = form.photos.filter(
                    (p) => !p.startsWith("data:image/svg+xml;base64"),
                );

                if (!form.photos?.length && !photoFiles.length) {
                    const canvas = document.querySelector(
                        "#map .maplibregl-canvas",
                    ) as HTMLCanvasElement;

                    const dataURL = canvas.toDataURL("image/webp", 0.3);
                    const response = await fetch(dataURL);
                    const blob = await response.blob();
                    photoFiles = [new File([blob], "route")];
                }

                form.expand!.gpx_data = valhallaStore.route.toString();
                if (form.expand!.gpx_data && overwriteGPX) {
                    gpxFile = new Blob([form.expand!.gpx_data], {
                        type: "text/xml",
                    });
                }

                if (
                    (!form.lat || !form.lon) &&
                    valhallaStore.route.trk?.at(0)?.trkseg?.at(0)?.trkpt?.at(0)
                ) {
                    form.lat = valhallaStore.route.trk
                        ?.at(0)
                        ?.trkseg?.at(0)
                        ?.trkpt?.at(0)?.$.lat;
                    form.lon = valhallaStore.route.trk
                        ?.at(0)
                        ?.trkseg?.at(0)
                        ?.trkpt?.at(0)?.$.lon;
                }

                if (page.params.id === "new" && !savedAtLeastOnce) {
                    const createdTrail = await trails_create(
                        form as Trail,
                        photoFiles,
                        gpxFile,
                    );
                    setFields(createdTrail);
                    trail.set(createdTrail);
                } else {
                    const updatedTrail = await trails_update(
                        $trail,
                        form as Trail,
                        photoFiles,
                        gpxFile,
                    );
                    setFields(updatedTrail);
                }
                photoFiles = [];

                savedAtLeastOnce = true;
                show_toast({
                    type: "success",
                    icon: "check",
                    text: $_("trail-saved-successfully"),
                });
            } catch (e) {
                console.error(e);

                show_toast({
                    type: "error",
                    icon: "close",
                    text: $_("error-saving-trail"),
                });
            } finally {
                loading = false;
            }
        },
    });

    onMount(async () => {
        clearAnchors();
        clearRoute();
        clearUndoRedoStack();

        if ($formData.expand!.gpx_data) {
            $formData.id ??= cryptoRandomString({ length: 15 });
            const gpx = GPX.parse($formData.expand!.gpx_data);
            if (!(gpx instanceof Error)) {
                if (gpx.rte && !gpx.trk) {
                    gpx.trk = [
                        new Track({
                            trkseg: [
                                new TrackSegment({
                                    trkpt: gpx.rte?.at(0)?.rtept,
                                }),
                            ],
                        }),
                    ];
                    gpx.rte = undefined;
                }

                setRoute(gpx);
                loopConnectionMode = inferLoopConnectionModeFromRoute(
                    gpx,
                    $formData.expand!.waypoints_via_trail ?? [],
                );
                if (isLoopRouteActive()) {
                    addAnchorsForWaypoints(
                        $formData.expand!.waypoints_via_trail ?? [],
                    );
                } else {
                    initRouteAnchors(gpx);
                }

                updateTrailOnMap();
            }
        }
    });

    function openFileBrowser() {
        document.getElementById("fileInput")!.click();
    }

    async function handleFileSelection() {
        const selectedFile = (
            document.getElementById("fileInput") as HTMLInputElement
        ).files?.[0];

        if (!selectedFile) {
            return;
        }

        clearWaypoints();
        clearAnchors();
        clearUndoRedoStack();
        clearRoute();
        mapTrail = [];
        drawingActive = false;
        overwriteGPX = false;
        loopConnectionMode = "none";

        const { gpxData, gpxFile: file } = await fromFile(selectedFile);
        gpxFile = file;

        try {
            const prevId = $formData.id;
            const parseResult = await gpx2trail(gpxData, selectedFile.name);
            setFields(parseResult.trail);
            $formData.id = prevId ?? cryptoRandomString({ length: 15 });
            $formData.expand!.gpx_data = gpxData;

            setFields(
                "category",
                page.data.settings.category || $categories[0].id,
            );
            setFields(
                "public",
                page.data.settings?.privacy?.trails === "public",
            );

            // const log = new SummitLog(parseResult.trail.date as string, {
            //     distance: $formData.distance,
            //     elevation_gain: $formData.elevation_gain,
            //     elevation_loss: $formData.elevation_loss,
            //     duration: $formData.duration
            //         ? $formData.duration * 60
            //         : undefined,
            // });

            // log.expand!.gpx_data = gpxData;
            // const blob = new Blob([gpxData], { type: selectedFile.type });
            // log._gpx = new File([blob], selectedFile.name, {
            //     type: selectedFile.type,
            // });

            // $formData.expand!.summit_logs?.push(log);

            if (parseResult.gpx.rte?.length && !parseResult.gpx.trk) {
                parseResult.gpx.trk = [
                    new Track({
                        trkseg: [
                            new TrackSegment({
                                trkpt: parseResult.gpx.rte?.at(0)?.rtept,
                            }),
                        ],
                    }),
                ];
                parseResult.gpx.rte = undefined;
            }
            setRoute(parseResult.gpx);
            initRouteAnchors(parseResult.gpx);
            if (/\.(kml|kmz)$/i.test(selectedFile.name)) {
                const parsedOriginalRoute = GPX.parse(parseResult.gpx.toString());
                importedOriginalRoute =
                    parsedOriginalRoute instanceof Error
                        ? null
                        : parsedOriginalRoute;
                importedOriginalSegments =
                    parsedOriginalRoute instanceof Error
                        ? []
                        : buildOriginalSegmentsFromGPX(
                              parsedOriginalRoute,
                              snapImportedRouteToValhalla,
                          );
            } else {
                importedOriginalRoute = null;
                importedOriginalSegments = [];
            }

            const importedRouteWaypoints = buildRouteWaypointsFromOriginalSegments(
                importedOriginalSegments,
                snapImportedRouteToValhalla,
            );
            $formData.expand!.waypoints_via_trail = importedRouteWaypoints.length
                ? importedRouteWaypoints
                : (parseResult.trail.expand?.waypoints_via_trail ?? []).map(
                      (waypoint, index) => ({
                          ...waypoint,
                          connectionMode:
                              index === 0
                                  ? waypoint.connectionMode
                                  : waypoint.connectionMode ?? "snap",
                      }),
                  );
            syncWaypointIconsWithRoutingRole();
            if (
                snapImportedRouteToValhalla &&
                env.PUBLIC_VALHALLA_URL &&
                ($formData.expand!.waypoints_via_trail?.length ?? 0) > 1
            ) {
                const recalculated = await recalculateRouteFromWaypoints({
                    showSuccessToast: false,
                });
                if (!recalculated) {
                    setRoute(parseResult.gpx);
                    clearAnchors();
                    initRouteAnchors(parseResult.gpx);
                    updateTrailOnMap();
                }
            } else {
                updateTrailOnMap();
            }
        } catch (e) {
            console.error(e);

            show_toast({
                icon: "close",
                type: "error",
                text: $_("error-reading-file"),
            });
            return;
        }
        const r = await searchLocationReverse($formData.lat!, $formData.lon!);

        if (r) {
            setFields("location", r);
        }
    }

    function clearWaypoints() {
        for (const waypoint of $formData.expand!.waypoints_via_trail ?? []) {
            waypoint.marker?.remove();
        }
        $formData.expand!.waypoints_via_trail = [];
        loopConnectionMode = "none";
    }

    function buildOriginalSegmentsFromGPX(
        gpx: GPX | null,
        snapToValhalla: boolean,
    ): GPXWaypoint[][] {
        if (!gpx) {
            return [];
        }
        const segments: GPXWaypoint[][] = [];
        const simplifyOptions = snapToValhalla
            ? valhallaSnapImportSimplifyOptions
            : originalKmlImportSimplifyOptions;

        for (const track of gpx.trk ?? []) {
            for (const trkseg of track.trkseg ?? []) {
                const points = trkseg.trkpt ?? [];
                const segmentPoints = points.flatMap((point) =>
                    typeof point.$.lat === "number" &&
                    typeof point.$.lon === "number"
                        ? [{ lat: point.$.lat, lon: point.$.lon }]
                        : [],
                );
                const simplifiedPoints = pruneImportedRouteControlPoints(
                    simplifyPolylinePoints(segmentPoints, simplifyOptions),
                    simplifyOptions,
                );

                for (let i = 1; i < simplifiedPoints.length; i++) {
                    const start = simplifiedPoints[i - 1];
                    const end = simplifiedPoints[i];
                    segments.push([
                        new GPXWaypoint({
                            $: { lat: start.lat, lon: start.lon },
                        }),
                        new GPXWaypoint({
                            $: { lat: end.lat, lon: end.lon },
                        }),
                    ]);
                }
            }
        }
        return segments;
    }

    function pruneImportedRouteControlPoints(
        points: { lat: number; lon: number }[],
        options: {
            maxPoints: number;
            minDistanceMeters?: number;
        },
    ) {
        if (points.length <= 2 || !options.minDistanceMeters) {
            return points;
        }

        const pruned = [points[0]];
        for (let i = 1; i < points.length - 1; i++) {
            const previous = pruned[pruned.length - 1];
            const current = points[i];
            const distance = haversineDistance(
                previous.lat,
                previous.lon,
                current.lat,
                current.lon,
            );

            if (distance >= options.minDistanceMeters) {
                pruned.push(current);
            }
        }
        pruned.push(points[points.length - 1]);

        if (pruned.length <= options.maxPoints) {
            return pruned;
        }

        const sampled: { lat: number; lon: number }[] = [];
        const step = (pruned.length - 1) / (options.maxPoints - 1);
        for (let i = 0; i < options.maxPoints; i++) {
            sampled.push(pruned[Math.round(i * step)]);
        }

        return sampled.filter(
            (point, index) =>
                index === 0 ||
                point.lat !== sampled[index - 1].lat ||
                point.lon !== sampled[index - 1].lon,
        );
    }

    function buildRouteWaypointsFromOriginalSegments(
        segments: GPXWaypoint[][],
        snapToValhalla: boolean,
    ): Waypoint[] {
        if (!segments.length) {
            return [];
        }
        const routeWaypoints: Waypoint[] = [];
        const firstPoint = segments[0][0];
        const firstLat = firstPoint.$.lat!;
        const firstLon = firstPoint.$.lon!;
        routeWaypoints.push(
            new Waypoint(firstLat, firstLon, {
                id: cryptoRandomString({ length: 15 }),
                name: getWaypointCoordinateName(firstLat, firstLon),
                icon: "play",
            }),
        );
        for (let i = 0; i < segments.length; i++) {
            const endPoint = segments[i][segments[i].length - 1];
            const endLat = endPoint.$.lat!;
            const endLon = endPoint.$.lon!;
            routeWaypoints.push(
                new Waypoint(endLat, endLon, {
                    id: cryptoRandomString({ length: 15 }),
                    name: getWaypointCoordinateName(endLat, endLon),
                    icon: i === segments.length - 1 ? "flag-checkered" : "circle",
                    connectionMode: snapToValhalla ? "snap" : "original-kml",
                }),
            );
        }
        return routeWaypoints;
    }

    function normalizeWaypointConnectionModes(waypoints: Waypoint[]) {
        for (let i = 0; i < waypoints.length; i++) {
            waypoints[i].connectionMode =
                i === 0 ? undefined : waypoints[i].connectionMode ?? "snap";
        }
    }

    function isLoopRouteActive() {
        return (
            loopConnectionMode !== "none" &&
            ($formData.expand!.waypoints_via_trail?.length ?? 0) > 1
        );
    }

    function waypointModeToLoopMode(
        mode?: WaypointConnectionMode,
    ): LoopConnectionMode {
        if (mode === "straight") {
            return "straight";
        }

        return "snap";
    }

    function normalizeLoopConnectionMode() {
        if (($formData.expand!.waypoints_via_trail?.length ?? 0) < 2) {
            loopConnectionMode = "none";
        }
    }

    function inferLoopConnectionModeFromRoute(
        gpx: GPX,
        waypoints: Waypoint[],
    ): LoopConnectionMode {
        const segments = gpx.trk?.at(0)?.trkseg ?? [];
        if (waypoints.length < 2 || segments.length < waypoints.length) {
            return "none";
        }

        const firstSegmentPoints = segments[0]?.trkpt ?? [];
        const closingSegmentPoints = segments.at(-1)?.trkpt ?? [];
        const routeStart = firstSegmentPoints[0];
        const routeEnd = closingSegmentPoints.at(-1);
        const startWaypoint = waypoints[0];

        if (!routeStart || !routeEnd) {
            return "none";
        }

        const routeStartsAtFirstWaypoint =
            haversineDistance(
                routeStart.$.lat!,
                routeStart.$.lon!,
                startWaypoint.lat,
                startWaypoint.lon,
            ) < 5;
        const routeClosesAtFirstWaypoint =
            haversineDistance(
                routeEnd.$.lat!,
                routeEnd.$.lon!,
                startWaypoint.lat,
                startWaypoint.lon,
            ) < 5;

        if (!routeStartsAtFirstWaypoint || !routeClosesAtFirstWaypoint) {
            return "none";
        }

        return closingSegmentPoints.length <= 2 ? "straight" : "snap";
    }

    async function updateLoopConnectionMode(value: LoopConnectionMode) {
        loopConnectionMode = value;
        await recalculateRouteFromWaypoints({ showSuccessToast: false });
    }

    function addAnchorsForWaypoints(
        waypoints: Waypoint[],
        addToMap: boolean = false,
    ) {
        for (let i = 0; i < waypoints.length; i++) {
            const waypoint = waypoints[i];
            addAnchor(waypoint.lat, waypoint.lon, i, addToMap);
        }
    }

    function snapSegmentToWaypoint(waypoints: Waypoint[], toIndex: number) {
        if (toIndex > 0 && toIndex < waypoints.length) {
            waypoints[toIndex].connectionMode = "snap";
        }
    }

    function snapSegmentsAroundWaypoint(
        waypoints: Waypoint[],
        waypointIndex: number,
    ) {
        snapSegmentToWaypoint(waypoints, waypointIndex);
        snapSegmentToWaypoint(waypoints, waypointIndex + 1);
    }

    function snapSegmentsForInsertedWaypoint(
        waypoints: Waypoint[],
        insertIndex: number,
    ) {
        snapSegmentToWaypoint(waypoints, insertIndex);
        snapSegmentToWaypoint(waypoints, insertIndex + 1);
    }

    function snapSegmentRange(
        waypoints: Waypoint[],
        startSegment: number,
        endSegment: number,
    ) {
        for (
            let segmentIndex = startSegment;
            segmentIndex <= endSegment;
            segmentIndex++
        ) {
            snapSegmentToWaypoint(waypoints, segmentIndex + 1);
        }
    }

    function initRouteAnchors(gpx: GPX, addToMap: boolean = false) {
        const segments = gpx.trk?.at(0)?.trkseg ?? [];

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const points = segment.trkpt ?? [];

            if (points.length > 0) {
                addAnchor(
                    points[0].$.lat!,
                    points[0].$.lon!,
                    valhallaStore.anchors.length,
                    addToMap,
                );
            }
            if (i == segments.length - 1) {
                addAnchor(
                    points[points.length - 1].$.lat!,
                    points[points.length - 1].$.lon!,
                    valhallaStore.anchors.length,
                    addToMap,
                );
            }
        }
    }

    function openMarkerPopup(waypoint: Waypoint) {
        waypoint.marker?.togglePopup();
    }

    async function setWaypointAsLoopStart(index: number) {
        const waypoints = $formData.expand!.waypoints_via_trail ?? [];
        if (!isLoopRouteActive() || index < 0 || index >= waypoints.length) {
            return;
        }

        if (index === 0) {
            syncWaypointIconsWithRoutingRole();
            return;
        }

        const previousWaypoints = [...waypoints];
        const previousLoopConnectionMode = loopConnectionMode;
        const rotatedWaypoints = [
            ...previousWaypoints.slice(index),
            ...previousWaypoints.slice(0, index),
        ];

        for (let i = 0; i < rotatedWaypoints.length; i++) {
            const originalIndex = (index + i) % previousWaypoints.length;
            if (i === 0) {
                rotatedWaypoints[i].connectionMode = undefined;
            } else if (originalIndex === 0) {
                rotatedWaypoints[i].connectionMode =
                    previousLoopConnectionMode === "straight"
                        ? "straight"
                        : "snap";
            } else {
                rotatedWaypoints[i].connectionMode =
                    previousWaypoints[originalIndex].connectionMode ?? "snap";
            }
        }

        loopConnectionMode = waypointModeToLoopMode(
            previousWaypoints[index].connectionMode,
        );
        importedOriginalSegments = Array.from(
            { length: rotatedWaypoints.length - 1 },
            (_, offset) => {
                const originalIndex =
                    (index + offset + 1) % previousWaypoints.length;
                return originalIndex === 0
                    ? []
                    : cloneRouteSegment(
                          importedOriginalSegments[originalIndex - 1] ?? [],
                      );
            },
        );

        $formData.expand!.waypoints_via_trail = rotatedWaypoints;
        syncWaypointIconsWithRoutingRole();
        await recalculateRouteFromWaypoints({ showSuccessToast: false });
    }

    function handleWaypointMenuClick(
        currentWaypoint: Waypoint,
        index: number,
        item: DropdownItem,
    ) {
        if (item.value === "edit") {
            waypoint.set(currentWaypoint);
            waypointModal.openModal();
        } else if (item.value === "delete") {
            currentWaypoint.marker?.remove();
            deleteWaypoint(index);
        } else if (item.value === "set-as-start") {
            void setWaypointAsLoopStart(index);
        }
    }

    function deleteWaypoint(index: number) {
        const waypoints = [...($formData.expand!.waypoints_via_trail ?? [])];
        const wasLoopRouteActive = isLoopRouteActive();
        const previousWaypointCount = waypoints.length;
        waypoints.splice(index, 1);

        normalizeWaypointConnectionModes(waypoints);
        $formData.expand!.waypoints_via_trail = waypoints;
        syncWaypointIconsWithRoutingRole();
        normalizeLoopConnectionMode();

        if (wasLoopRouteActive) {
            void recalculateRouteFromWaypoints({ showSuccessToast: false });
            return;
        }

        void deleteWaypointWithSegmentMerge(index, previousWaypointCount);
    }

    async function moveWaypoint(fromIndex: number, toIndex: number) {
        const waypoints = $formData.expand!.waypoints_via_trail ?? [];
        if (
            toIndex < 0 ||
            toIndex >= waypoints.length ||
            fromIndex < 0 ||
            fromIndex >= waypoints.length
        ) {
            return;
        }

        const [movedWaypoint] = waypoints.splice(fromIndex, 1);
        waypoints.splice(toIndex, 0, movedWaypoint);
        normalizeWaypointConnectionModes(waypoints);
        syncWaypointIconsWithRoutingRole();
        $formData.expand!.waypoints_via_trail = [...waypoints];

        if (waypoints.length > 1) {
            if (isLoopRouteActive()) {
                await recalculateRouteFromWaypoints({ showSuccessToast: false });
                return;
            }
            await moveWaypointWithSegmentMerge(fromIndex, toIndex);
        }
    }

    async function recalculateRouteFromWaypoints(options?: {
        showSuccessToast?: boolean;
    }): Promise<boolean> {
        const waypoints = $formData.expand!.waypoints_via_trail ?? [];
        normalizeLoopConnectionMode();

        clearAnchors();
        clearUndoRedoStack();

        addAnchorsForWaypoints(waypoints, drawingActive);

        if (waypoints.length < 2) {
            replaceRouteWithOrderedSegments([]);
            updateTrailWithRouteData();
            return true;
        }

        try {
            const routeSegments: GPXWaypoint[][] = [];
            for (let i = 1; i < waypoints.length; i++) {
                const previousWaypoint = waypoints[i - 1];
                const currentWaypoint = waypoints[i] as Waypoint & {
                    connectionMode?: WaypointConnectionMode;
                };
                const connectionMode = currentWaypoint.connectionMode ?? "snap";

                let routeWaypoints: GPXWaypoint[];
                if (
                    connectionMode === "original-kml" &&
                    importedOriginalSegments[i - 1]?.length
                ) {
                    routeWaypoints = ensureRouteSegmentEndpoints(
                        importedOriginalSegments[i - 1],
                        previousWaypoint,
                        currentWaypoint,
                    );
                } else {
                    routeWaypoints = await calculateRouteSegmentBetweenEndpoints(
                        previousWaypoint,
                        currentWaypoint,
                        {
                            ...routingOptions,
                            autoRouting: connectionMode === "snap",
                        },
                    );
                }

                routeSegments.push(routeWaypoints);
            }
            if (isLoopRouteActive()) {
                routeSegments.push(
                    await calculateRouteSegmentBetweenEndpoints(
                        waypoints[waypoints.length - 1],
                        waypoints[0],
                        {
                            ...routingOptions,
                            autoRouting: loopConnectionMode === "snap",
                        },
                    ),
                );
            }
            replaceRouteWithOrderedSegments(routeSegments);
            normalizeRouteTime();
            updateTrailWithRouteData();
            if (options?.showSuccessToast !== false) {
                show_toast({
                    text: "Route recalculated from waypoint order",
                    icon: "check",
                    type: "success",
                });
            }
            return true;
        } catch (e) {
            console.error(e);
            show_toast({
                text: "Error calculating route",
                icon: "close",
                type: "error",
            });
            return false;
        }
    }

    async function runQueuedWaypointRecalculation() {
        if (waypointRecalcInFlight) {
            return;
        }
        waypointRecalcInFlight = true;
        const options = queuedWaypointRecalcOptions ?? { showSuccessToast: false };
        queuedWaypointRecalcOptions = null;

        try {
            await recalculateRouteFromWaypoints(options);
        } finally {
            waypointRecalcInFlight = false;
            if (queuedWaypointRecalcOptions) {
                scheduleRouteRecalculationFromWaypoints(
                    queuedWaypointRecalcOptions,
                );
            }
        }
    }

    function scheduleRouteRecalculationFromWaypoints(options?: {
        showSuccessToast?: boolean;
    }) {
        queuedWaypointRecalcOptions = {
            showSuccessToast:
                queuedWaypointRecalcOptions?.showSuccessToast ||
                options?.showSuccessToast ||
                false,
        };

        if (waypointRecalcDebounceTimeout) {
            clearTimeout(waypointRecalcDebounceTimeout);
        }
        waypointRecalcDebounceTimeout = setTimeout(() => {
            waypointRecalcDebounceTimeout = null;
            void runQueuedWaypointRecalculation();
        }, waypointRecalcDebounceMs);
    }

    async function calculateRouteSegmentForWaypointPair(
        waypoints: Waypoint[],
        toIndex: number,
    ): Promise<GPXWaypoint[]> {
        const previousWaypoint = waypoints[toIndex - 1];
        const currentWaypoint = waypoints[toIndex] as Waypoint & {
            connectionMode?: WaypointConnectionMode;
        };
        const connectionMode = currentWaypoint.connectionMode ?? "snap";

        if (
            connectionMode === "original-kml" &&
            importedOriginalSegments[toIndex - 1]?.length
        ) {
            return ensureRouteSegmentEndpoints(
                cloneRouteSegment(importedOriginalSegments[toIndex - 1]),
                previousWaypoint,
                currentWaypoint,
            );
        }

        try {
            return await calculateRouteSegmentBetweenEndpoints(
                previousWaypoint,
                currentWaypoint,
                {
                    ...routingOptions,
                    autoRouting: connectionMode === "snap",
                },
            );
        } catch (e) {
            console.error(e);
            return buildStraightFallbackSegment(previousWaypoint, currentWaypoint);
        }
    }

    function replaceRouteWithOrderedSegments(routeSegments: GPXWaypoint[][]) {
        valhallaStore.route = new GPX({
            trk: [
                new Track({
                    trkseg: routeSegments.map(
                        (routeWaypoints) =>
                            new TrackSegment({ trkpt: routeWaypoints }),
                    ),
                }),
            ],
        });
    }

    async function calculateRouteSegmentBetweenEndpoints(
        previousWaypoint: RouteSegmentEndpoint,
        currentWaypoint: RouteSegmentEndpoint,
        options: RoutingOptions = routingOptions,
    ) {
        try {
            return ensureRouteSegmentEndpoints(
                await calculateRouteBetween(
                    previousWaypoint.lat,
                    previousWaypoint.lon,
                    currentWaypoint.lat,
                    currentWaypoint.lon,
                    options,
                ),
                previousWaypoint,
                currentWaypoint,
            );
        } catch (e) {
            console.error(e);
            return buildStraightFallbackSegment(previousWaypoint, currentWaypoint);
        }
    }

    function cloneRouteSegment(routeWaypoints: GPXWaypoint[]) {
        return routeWaypoints.map(
            (point) =>
                new GPXWaypoint({
                    ...point,
                    $: {
                        lat: point.$.lat,
                        lon: point.$.lon,
                    },
                }),
        );
    }

    function findEndpointReference(
        routeWaypoints: GPXWaypoint[],
        fromStart: boolean,
    ) {
        const points = fromStart ? routeWaypoints : [...routeWaypoints].reverse();
        return (
            points.find((point) => Number.isFinite(point.ele)) ??
            points.find((point) => point.time) ??
            points[0]
        );
    }

    function createRouteEndpointFromReference(
        lat: number,
        lon: number,
        reference: GPXWaypoint | undefined,
    ) {
        return new GPXWaypoint({
            ...(reference ?? {}),
            $: { lat, lon },
            ele: Number.isFinite(reference?.ele) ? reference?.ele : undefined,
            time: reference?.time ? new Date(reference.time) : undefined,
        });
    }

    function ensureRouteSegmentEndpoints(
        routeWaypoints: GPXWaypoint[],
        previousWaypoint: RouteSegmentEndpoint,
        currentWaypoint: RouteSegmentEndpoint,
    ) {
        const segment = cloneRouteSegment(routeWaypoints);

        if (!segment.length) {
            return buildStraightFallbackSegment(previousWaypoint, currentWaypoint);
        }

        const first = segment[0];
        const last = segment[segment.length - 1];

        if (
            first.$.lat !== previousWaypoint.lat ||
            first.$.lon !== previousWaypoint.lon
        ) {
            segment.unshift(
                createRouteEndpointFromReference(
                    previousWaypoint.lat,
                    previousWaypoint.lon,
                    findEndpointReference(segment, true),
                ),
            );
        }

        if (
            last.$.lat !== currentWaypoint.lat ||
            last.$.lon !== currentWaypoint.lon
        ) {
            segment.push(
                createRouteEndpointFromReference(
                    currentWaypoint.lat,
                    currentWaypoint.lon,
                    findEndpointReference(segment, false),
                ),
            );
        }

        return segment;
    }

    function buildStraightFallbackSegment(
        previousWaypoint: RouteSegmentEndpoint,
        currentWaypoint: RouteSegmentEndpoint,
    ) {
        return [
            new GPXWaypoint({
                $: { lat: previousWaypoint.lat, lon: previousWaypoint.lon },
            }),
            new GPXWaypoint({
                $: { lat: currentWaypoint.lat, lon: currentWaypoint.lon },
            }),
        ];
    }

    async function recalculateAdjacentWaypointSegments(
        waypointIndex: number,
        options?: { snapAffectedSegments?: boolean },
    ) {
        const waypoints = $formData.expand!.waypoints_via_trail ?? [];
        if (waypointIndex < 0 || waypointIndex >= waypoints.length) {
            return;
        }

        if (options?.snapAffectedSegments) {
            snapSegmentsAroundWaypoint(waypoints, waypointIndex);
            $formData.expand!.waypoints_via_trail = [...waypoints];
        }

        if (isLoopRouteActive()) {
            await recalculateRouteFromWaypoints({ showSuccessToast: false });
            return;
        }

        const segmentsToRecalculate = new Set<number>();
        if (waypointIndex > 0) {
            segmentsToRecalculate.add(waypointIndex);
        }
        if (waypointIndex < waypoints.length - 1) {
            segmentsToRecalculate.add(waypointIndex + 1);
        }

        if (!segmentsToRecalculate.size) {
            return;
        }

        try {
            const segmentResults = await Promise.all(
                [...segmentsToRecalculate].map(async (segmentToIndex) => ({
                    segmentToIndex,
                    routeWaypoints: await calculateRouteSegmentForWaypointPair(
                        waypoints,
                        segmentToIndex,
                    ),
                })),
            );

            for (const result of segmentResults) {
                await editRoute(result.segmentToIndex - 1, result.routeWaypoints);
            }

            normalizeRouteTime();
            updateTrailWithRouteData();
        } catch (e) {
            console.error(e);
            scheduleRouteRecalculationFromWaypoints({ showSuccessToast: false });
        }
    }

    async function recalculateSingleWaypointSegment(toIndex: number) {
        const waypoints = $formData.expand!.waypoints_via_trail ?? [];
        if (toIndex <= 0 || toIndex >= waypoints.length) {
            return;
        }

        try {
            const routeWaypoints = await calculateRouteSegmentForWaypointPair(
                waypoints,
                toIndex,
            );
            await editRoute(toIndex - 1, routeWaypoints);
            normalizeRouteTime();
            updateTrailWithRouteData();
        } catch (e) {
            console.error(e);
            scheduleRouteRecalculationFromWaypoints({ showSuccessToast: false });
        }
    }

    async function insertWaypointWithSegmentMerge(insertIndex: number) {
        const waypoints = $formData.expand!.waypoints_via_trail ?? [];
        snapSegmentsForInsertedWaypoint(waypoints, insertIndex);
        $formData.expand!.waypoints_via_trail = [...waypoints];

        if (isLoopRouteActive()) {
            await recalculateRouteFromWaypoints({ showSuccessToast: false });
            return;
        }

        if (waypoints.length < 2) {
            updateTrailWithRouteData();
            return;
        }

        try {
            if (insertIndex <= 0) {
                const firstSegment = await calculateRouteSegmentForWaypointPair(
                    waypoints,
                    1,
                );
                await insertIntoRoute(firstSegment, 0);
            } else if (insertIndex >= waypoints.length - 1) {
                const lastSegment = await calculateRouteSegmentForWaypointPair(
                    waypoints,
                    insertIndex,
                );
                await insertIntoRoute(lastSegment);
            } else {
                const [previousSegment, nextSegment] = await Promise.all([
                    calculateRouteSegmentForWaypointPair(waypoints, insertIndex),
                    calculateRouteSegmentForWaypointPair(
                        waypoints,
                        insertIndex + 1,
                    ),
                ]);
                await editRoute(insertIndex - 1, previousSegment);
                await insertIntoRoute(nextSegment, insertIndex);
            }
            normalizeRouteTime();
            updateTrailWithRouteData();
        } catch (e) {
            console.error(e);
            scheduleRouteRecalculationFromWaypoints({ showSuccessToast: false });
        }
    }

    async function deleteWaypointWithSegmentMerge(
        deletedIndex: number,
        previousWaypointCount: number,
    ) {
        const waypoints = $formData.expand!.waypoints_via_trail ?? [];

        if (waypoints.length === 0) {
            clearRoute();
            updateTrailWithRouteData();
            return;
        }

        if (waypoints.length === 1) {
            deleteFromRoute(0);
            updateTrailWithRouteData();
            return;
        }

        try {
            if (deletedIndex <= 0) {
                deleteFromRoute(0);
            } else if (deletedIndex >= previousWaypointCount - 1) {
                deleteFromRoute(previousWaypointCount - 2);
            } else {
                snapSegmentToWaypoint(waypoints, deletedIndex);
                $formData.expand!.waypoints_via_trail = [...waypoints];
                const mergedSegment = await calculateRouteSegmentForWaypointPair(
                    waypoints,
                    deletedIndex,
                );
                await editRoute(deletedIndex - 1, mergedSegment);
                deleteFromRoute(deletedIndex);
            }
            normalizeRouteTime();
            updateTrailWithRouteData();
        } catch (e) {
            console.error(e);
            scheduleRouteRecalculationFromWaypoints({ showSuccessToast: false });
        }
    }

    async function moveWaypointWithSegmentMerge(
        fromIndex: number,
        toIndex: number,
    ) {
        const waypoints = $formData.expand!.waypoints_via_trail ?? [];
        if (waypoints.length < 2) {
            updateTrailWithRouteData();
            return;
        }

        const minIndex = Math.min(fromIndex, toIndex);
        const maxIndex = Math.max(fromIndex, toIndex);
        const startSegment = Math.max(0, minIndex - 1);
        const endSegment = Math.min(waypoints.length - 2, maxIndex);
        snapSegmentRange(waypoints, startSegment, endSegment);
        $formData.expand!.waypoints_via_trail = [...waypoints];

        try {
            const segmentUpdates = await Promise.all(
                Array.from(
                    { length: endSegment - startSegment + 1 },
                    (_, offset) => startSegment + offset,
                ).map(async (segmentIndex) => ({
                    segmentIndex,
                    routeWaypoints: await calculateRouteSegmentForWaypointPair(
                        waypoints,
                        segmentIndex + 1,
                    ),
                })),
            );

            for (const update of segmentUpdates) {
                await editRoute(update.segmentIndex, update.routeWaypoints);
            }

            normalizeRouteTime();
            updateTrailWithRouteData();
        } catch (e) {
            console.error(e);
            scheduleRouteRecalculationFromWaypoints({ showSuccessToast: false });
        }
    }

    async function getWaypointNamingInfo(lat: number, lon: number) {
        try {
            const feature = await searchLocationReverseFeature(lat, lon);
            const address = feature?.properties?.address;
            const streetName =
                address?.road ||
                address?.footway ||
                address?.path ||
                address?.track ||
                address?.pedestrian ||
                address?.cycleway ||
                address?.bridleway ||
                "";
            const fallback =
                feature?.properties?.display_name ||
                (await searchLocationReverse(lat, lon)) ||
                getWaypointCoordinateName(lat, lon);

            return { streetName, fallback };
        } catch (e) {
            return {
                streetName: "",
                fallback: getWaypointCoordinateName(lat, lon),
            };
        }
    }

    function closeWaypointActionPopup() {
        mapWaypointPopup?.remove();
        mapWaypointPopup = null;
    }

    function showWaypointActionPopup(
        lnglat: M.LngLat,
        options?: { presetName?: string },
    ) {
        if (!map) {
            return;
        }
        closeWaypointActionPopup();

        const content = document.createElement("div");
        content.className = "p-3 flex flex-col gap-2 min-w-48";

        const addButton = document.createElement("button");
        addButton.className = "btn-secondary text-sm";
        addButton.textContent = get(_)("add-waypoint");
        addButton.addEventListener("click", async () => {
            await addWaypointFromTap(lnglat.lat, lnglat.lng, {
                openEditor: false,
                presetName: options?.presetName,
            });
            closeWaypointActionPopup();
        });

        const cancelButton = document.createElement("button");
        cancelButton.className = "btn-secondary text-sm";
        cancelButton.textContent = get(_)("cancel");
        cancelButton.addEventListener("click", () => closeWaypointActionPopup());

        content.appendChild(addButton);
        content.appendChild(cancelButton);

        mapWaypointPopup = new M.Popup({ closeOnClick: true, offset: 20 })
            .setLngLat(lnglat)
            .setDOMContent(content)
            .addTo(map);
    }

    function getWaypointCoordinateName(lat: number, lon: number): string {
        return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }

    function saveWaypoint(savedWaypoint: Waypoint) {
        let editedWaypointIndex =
            $formData.expand!.waypoints_via_trail?.findIndex(
                (s) => s.id == savedWaypoint.id,
            ) ?? -1;

        if (editedWaypointIndex >= 0) {
            const previousWaypoint =
                $formData.expand!.waypoints_via_trail![editedWaypointIndex];
            const positionChanged =
                previousWaypoint.lat !== savedWaypoint.lat ||
                previousWaypoint.lon !== savedWaypoint.lon;
            $formData.expand!.waypoints_via_trail![editedWaypointIndex] = savedWaypoint;
            void recalculateAdjacentWaypointSegments(editedWaypointIndex, {
                snapAffectedSegments: positionChanged,
            });
        } else {
            savedWaypoint.id = cryptoRandomString({ length: 15 });
            savedWaypoint.connectionMode = "snap";
            const updatedWaypoints = [...($formData.expand!.waypoints_via_trail ?? [])];
            const insertIndex =
                pendingWaypointInsertIndex === null
                    ? updatedWaypoints.length
                    : Math.max(0, Math.min(updatedWaypoints.length, pendingWaypointInsertIndex));
            updatedWaypoints.splice(insertIndex, 0, savedWaypoint);
            $formData.expand!.waypoints_via_trail = updatedWaypoints;
            void insertWaypointWithSegmentMerge(insertIndex);
        }

        pendingWaypointInsertIndex = null;
    }

    function moveMarker(marker: M.Marker, wpId?: string) {
        const position = marker.getLngLat();
        const editableWaypointIndex =
            $formData.expand!.waypoints_via_trail?.findIndex((w) => w.id == wpId) ?? -1;
        const editableWaypoint =
            $formData.expand!.waypoints_via_trail![editableWaypointIndex];
        if (!editableWaypoint) {
            return;
        }
        editableWaypoint.lat = position.lat;
        editableWaypoint.lon = position.lng;
        editableWaypoint.name =
            editableWaypoint.name?.trim() ||
            getWaypointCoordinateName(position.lat, position.lng);
        $formData.expand!.waypoints_via_trail = [...($formData.expand!.waypoints_via_trail ?? [])];
        void recalculateAdjacentWaypointSegments(editableWaypointIndex, {
            snapAffectedSegments: true,
        });
    }

    function syncWaypointIconsWithRoutingRole() {
        const waypoints = $formData.expand!.waypoints_via_trail ?? [];
        for (let i = 0; i < waypoints.length; i++) {
            const role = getRoutingRoleByIndex(i, waypoints.length);
            waypoints[i].icon = role === "start" ? "play" : role === "goal" ? "flag-checkered" : "circle";
        }
        $formData.expand!.waypoints_via_trail = [...waypoints];
    }

    function beforeSummitLogModalOpen() {
        const newSummitLog = new SummitLog(
            new Date().toISOString().split("T")[0],
        );
        newSummitLog.author = $currentUser?.actor;
        summitLog.set(newSummitLog);
        summitLogModal.openModal();
    }

    function saveSummitLog(log: SummitLog) {
        let editedSummitLogIndex =
            $formData.expand!.summit_logs_via_trail?.findIndex(
                (s) => s.id == log.id,
            );
        if ((editedSummitLogIndex ?? -1) >= 0) {
            $formData.expand!.summit_logs_via_trail![editedSummitLogIndex!] =
                log;
        } else {
            log.id = cryptoRandomString({ length: 15 });
            $formData.expand!.summit_logs_via_trail = [
                ...($formData.expand!.summit_logs_via_trail ?? []),
                log,
            ];
        }
    }

    function handleSummitLogMenuClick(
        currentSummitLog: SummitLog,
        index: number,
        item: DropdownItem,
    ) {
        if (item.value === "edit") {
            summitLog.set(currentSummitLog);
            summitLogModal.openModal();
        } else if (item.value === "delete") {
            $formData.expand!.summit_logs_via_trail?.splice(index, 1);
            $formData.expand!.summit_logs_via_trail =
                $formData.expand!.summit_logs_via_trail;
        }
    }

    async function handleListSelection(list: List) {
        if (!$formData.id) {
            return;
        }
        try {
            if (list.trails?.includes($formData.id!)) {
                list = await lists_remove_trail(list, $formData as Trail);
            } else {
                list = await lists_add_trail(list, $formData as Trail);
            }
            const index = lists.items.findIndex((l) => l.id == list.id);
            if (index >= 0) {
                lists.items[index] = list;
            }
            // await lists_index({ q: "", author: $currentUser?.id ?? "" }, 1, -1);
        } catch (e) {
            console.error(e);
            show_toast({
                type: "error",
                icon: "close",
                text: "Error adding trail to list.",
            });
        }
    }

    function startDrawing() {
        if (!map) {
            return;
        }
        drawingActive = true;
        if (!valhallaStore.route.trk?.at(0)?.trkseg?.at(0)?.trkpt?.length) {
        }
        for (const anchor of valhallaStore.anchors) {
            anchor.marker?.addTo(map);
        }
    }

    async function stopDrawing() {
        drawingActive = false;
        for (const anchor of valhallaStore.anchors) {
            anchor.marker?.remove();
        }
        toggleCropMarkers(false);
        clearUndoRedoStack();

        if (valhallaStore.route.trk?.at(0)?.trkseg?.at(0)?.trkpt?.at(0)) {
            $formData.lat = valhallaStore.route.trk
                ?.at(0)
                ?.trkseg?.at(0)
                ?.trkpt?.at(0)?.$.lat;
            $formData.lon = valhallaStore.route.trk
                ?.at(0)
                ?.trkseg?.at(0)
                ?.trkpt?.at(0)?.$.lon;
        }

        if ($formData.lat && $formData.lon) {
            const r = await searchLocationReverse($formData.lat, $formData.lon);
            if (r) {
                setFields("location", r);
            }
        }
    }

    async function handleMapClick(e: M.MapMouseEvent) {
        if (!drawingActive) {
            if (
                (
                    e.originalEvent.target as HTMLElement
                ).tagName.toLowerCase() !== "canvas"
                ) {
                return;
            }
            showWaypointActionPopup(e.lngLat);
        } else {
            const anchorCount = valhallaStore.anchors.length;
            await addWaypointFromTap(e.lngLat.lat, e.lngLat.lng, {
                openEditor: false,
            });
            if (isLoopRouteActive()) {
                return;
            }
            if (anchorCount == 0) {
                addAnchor(
                    e.lngLat.lat,
                    e.lngLat.lng,
                    valhallaStore.anchors.length,
                );
            } else {
                await addAnchorAndRecalculate(e.lngLat.lat, e.lngLat.lng);
            }
        }
    }

    async function addWaypointFromTap(
        lat: number,
        lon: number,
        options?: { openEditor?: boolean; presetName?: string },
    ) {
        const existingWaypoints = $formData.expand!.waypoints_via_trail ?? [];
        const namingInfo = await getWaypointNamingInfo(lat, lon);
        const waypointName =
            options?.presetName?.trim() ||
            namingInfo.streetName ||
            namingInfo.fallback ||
            getWaypointCoordinateName(lat, lon);
        const insertedWaypoint = createWaypointFromTap(lat, lon, {
            name: waypointName,
            description:
                namingInfo.streetName && namingInfo.fallback
                    ? namingInfo.fallback
                    : "",
        });
        insertedWaypoint.connectionMode = "snap";
        insertedWaypoint.id = cryptoRandomString({ length: 15 });

        const insertIndex = getWaypointInsertIndexByNearestSegment(
            existingWaypoints.map((waypoint) => ({
                lat: waypoint.lat,
                lon: waypoint.lon,
            })),
            { lat, lon },
        );

        const updatedWaypoints = [...existingWaypoints];
        updatedWaypoints.splice(insertIndex, 0, insertedWaypoint);
        normalizeWaypointConnectionModes(updatedWaypoints);

        if (options?.openEditor) {
            pendingWaypointInsertIndex = insertIndex;
            insertedWaypoint.id = undefined;
            waypoint.set(insertedWaypoint);
            waypointModal.openModal();
            return;
        }

        pendingWaypointInsertIndex = null;
        $formData.expand!.waypoints_via_trail = updatedWaypoints;

        if (updatedWaypoints.length > 1) {
            await insertWaypointWithSegmentMerge(insertIndex);
        }
    }

    async function addAnchorAndRecalculate(lat: number, lon: number) {
        const previousAnchor =
            valhallaStore.anchors[valhallaStore.anchors.length - 1];
        const anchor = addAnchor(lat, lon, valhallaStore.anchors.length);
        const markerText = startAnchorLoading(anchor);
        try {
            const routeWaypoints = await calculateRouteSegmentBetweenEndpoints(
                previousAnchor,
                { lat, lon },
            );
            await insertIntoRoute(routeWaypoints);
            updateTrailWithRouteData();
            normalizeRouteTime();
        } catch (e) {
            console.error(e);
            show_toast({
                text: "Error calculating route",
                icon: "close",
                type: "error",
            });
        } finally {
            stopAnchorLoading(anchor, markerText);
        }
    }

    async function addPoiAsRoutePoint(poi: Poi) {
        showWaypointActionPopup(new M.LngLat(poi.lon, poi.lat), {
            presetName: poi.name,
        });
    }

    function addAnchor(
        lat: number,
        lon: number,
        index: number,
        addtoMap: boolean = true,
    ) {
        const anchor: ValhallaAnchor = {
            id: cryptoRandomString({ length: 15 }),
            lat: lat,
            lon: lon,
        };
        const marker = createAnchorMarker(
            lat,
            lon,
            index + 1,
            () => {
                removeAnchor(
                    valhallaStore.anchors.findIndex((a) => a.id == anchor.id),
                );
            },
            () => {
                const thisAnchor = valhallaStore.anchors.find(
                    (a) => a.id == anchor.id,
                );
                addAnchorAndRecalculate(
                    thisAnchor?.lat ?? lat,
                    thisAnchor?.lon ?? lon,
                );
                marker.togglePopup();
            },
            (e) => {
                draggingMarker = true;
            },
            async (_) => {
                if (!drawingActive) {
                    return;
                }
                const anchorIndex = valhallaStore.anchors.findIndex(
                    (a) => a.id == anchor.id,
                );
                const thisAnchor = valhallaStore.anchors[anchorIndex];
                const position = marker.getLngLat();
                thisAnchor.lat = position.lat;
                thisAnchor.lon = position.lng;

                const waypoints = [...($formData.expand!.waypoints_via_trail ?? [])];
                if (waypoints[anchorIndex]) {
                    waypoints[anchorIndex].lat = position.lat;
                    waypoints[anchorIndex].lon = position.lng;
                    waypoints[anchorIndex].name =
                        waypoints[anchorIndex].name?.trim() ||
                        getWaypointCoordinateName(position.lat, position.lng);
                    $formData.expand!.waypoints_via_trail = waypoints;
                }

                await recalculateRoute(anchorIndex);

                draggingMarker = false;
            },
        );
        if (addtoMap && map) {
            marker.addTo(map);
        }
        anchor.marker = marker;
        valhallaStore.anchors.splice(index, 0, anchor);

        return anchor;
    }

    function startAnchorLoading(anchor: ValhallaAnchor) {
        const markerIcon = anchor.marker?.getElement();
        if (!markerIcon) {
            return null;
        }
        markerIcon.classList.add("spinner", "spinner-light", "spinner-small");
        const savedMarkerNumber = markerIcon.textContent;
        markerIcon.textContent = "";

        return savedMarkerNumber;
    }

    function stopAnchorLoading(anchor: ValhallaAnchor, index: string | null) {
        const markerIcon = anchor.marker?.getElement();
        if (!markerIcon || !index) {
            return;
        }
        markerIcon.classList.remove(
            "spinner",
            "spinner-light",
            "spinner-small",
        );
        markerIcon.textContent = index;
    }

    async function removeAnchor(anchorIndex: number) {
        if (!drawingActive) {
            return;
        }
        const wasLoopRouteActive = isLoopRouteActive();
        valhallaStore.anchors[anchorIndex]?.marker?.remove();
        valhallaStore.anchors.splice(anchorIndex, 1);

        const waypoints = [...($formData.expand!.waypoints_via_trail ?? [])];
        waypoints.splice(anchorIndex, 1);
        normalizeWaypointConnectionModes(waypoints);
        $formData.expand!.waypoints_via_trail = waypoints;
        syncWaypointIconsWithRoutingRole();
        for (let i = anchorIndex; i < valhallaStore.anchors.length; i++) {
            const anchor = valhallaStore.anchors[i];
            const markerIcon = anchor.marker?.getElement();
            if (markerIcon) {
                const markerText = markerIcon.textContent ?? "0";
                const markerIndex = parseInt(markerText);
                const newIndex = markerIndex - 1;
                markerIcon.textContent = newIndex + "";
                anchor
                    .marker!.getPopup()
                    ._content.getElementsByTagName("h5")[0].textContent =
                    $_("route-point") + " #" + newIndex;
            }
        }
        normalizeLoopConnectionMode();
        if (wasLoopRouteActive) {
            await recalculateRouteFromWaypoints({ showSuccessToast: false });
            return;
        }
        if (anchorIndex == 0) {
            deleteFromRoute(anchorIndex);
            if ($formData.expand?.gpx_data) {
                updateTrailWithRouteData();
            }
        } else if (anchorIndex == valhallaStore.anchors.length) {
            deleteFromRoute(anchorIndex - 1);
            updateTrailWithRouteData();
        } else {
            deleteFromRoute(anchorIndex - 1);
            await recalculateRoute(anchorIndex);
        }
    }

    async function recalculateRoute(anchorIndex: number) {
        if (isLoopRouteActive()) {
            await recalculateRouteFromWaypoints({ showSuccessToast: false });
            draggingMarker = false;
            return;
        }

        const markerText = startAnchorLoading(
            valhallaStore.anchors[anchorIndex],
        );

        const anchor = valhallaStore.anchors[anchorIndex];
        if (!anchor) {
            return;
        }
        let nextRouteSegment;
        let previousRouteSegment;
        try {
            if (anchorIndex < valhallaStore.anchors.length - 1) {
                const nextAnchor = valhallaStore.anchors[anchorIndex + 1];

                nextRouteSegment = calculateRouteSegmentBetweenEndpoints(
                    anchor,
                    nextAnchor,
                );
            }
            if (anchorIndex > 0) {
                const previousAnchor = valhallaStore.anchors[anchorIndex - 1];
                previousRouteSegment = calculateRouteSegmentBetweenEndpoints(
                    previousAnchor,
                    anchor,
                );
            }

            [nextRouteSegment, previousRouteSegment] = await Promise.all([
                nextRouteSegment,
                previousRouteSegment,
            ]);

            if (nextRouteSegment) {
                await editRoute(anchorIndex, nextRouteSegment);
            }
            if (previousRouteSegment) {
                await editRoute(anchorIndex - 1, previousRouteSegment);
            }
            updateTrailWithRouteData();
            normalizeRouteTime();
        } catch (e) {
            console.error(e);
            show_toast({
                text: "Error calculating route",
                icon: "close",
                type: "error",
            });
        } finally {
            stopAnchorLoading(valhallaStore.anchors[anchorIndex], markerText);
        }
    }

    async function handleSegmentDragEnd(data: {
        segment: number;
        event: M.MapMouseEvent;
    }) {
        if (draggingMarker) {
            return;
        }
        const anchor = addAnchor(
            data.event.lngLat.lat,
            data.event.lngLat.lng,
            data.segment + 1,
        );
        const insertedWaypoint = createWaypointFromTap(
            data.event.lngLat.lat,
            data.event.lngLat.lng,
            {
                name: getWaypointCoordinateName(
                    data.event.lngLat.lat,
                    data.event.lngLat.lng,
                ),
            },
        );
        insertedWaypoint.id = cryptoRandomString({ length: 15 });

        const waypoints = [...($formData.expand!.waypoints_via_trail ?? [])];
        waypoints.splice(data.segment + 1, 0, insertedWaypoint);
        normalizeWaypointConnectionModes(waypoints);
        snapSegmentsForInsertedWaypoint(waypoints, data.segment + 1);
        $formData.expand!.waypoints_via_trail = waypoints;
        syncWaypointIconsWithRoutingRole();
        if (isLoopRouteActive()) {
            await recalculateRouteFromWaypoints({ showSuccessToast: false });
            return;
        }
        const markerText = startAnchorLoading(anchor);
        updateFollowingAnchors(data.segment);

        const previousAnchor = valhallaStore.anchors[data.segment];
        const nextAnchor = valhallaStore.anchors[data.segment + 2];

        try {
            const [previousRouteSegment, nextRouteSegment] = await Promise.all([
                calculateRouteSegmentBetweenEndpoints(previousAnchor, anchor),
                calculateRouteSegmentBetweenEndpoints(anchor, nextAnchor),
            ]);

            await editRoute(data.segment, previousRouteSegment);
            await insertIntoRoute(nextRouteSegment, data.segment + 1);
            normalizeRouteTime();
            updateTrailWithRouteData();
        } catch (e) {
            console.error(e);
            show_toast({
                text: "Error calculating route",
                icon: "close",
                type: "error",
            });
        } finally {
            stopAnchorLoading(anchor, markerText);
        }
    }

    function updateFollowingAnchors(segment: number) {
        for (let i = segment + 2; i < valhallaStore.anchors.length; i++) {
            const anchor = valhallaStore.anchors[i];
            const markerIcon = anchor.marker?.getElement();
            if (markerIcon) {
                const markerText = markerIcon.textContent ?? "0";
                const markerIndex = parseInt(markerText);
                const newIndex = markerIndex + 1;
                markerIcon.textContent = newIndex + "";
                anchor
                    .marker!.getPopup()
                    ._content.getElementsByTagName("h5")[0].textContent =
                    $_("route-point") + " #" + newIndex;
            }
        }
    }

    async function handleSegmentClick(data: {
        segment: number;
        event: M.MapMouseEvent;
    }) {
        if (isLoopRouteActive()) {
            const insertIndex = data.segment + 1;
            addAnchor(
                data.event.lngLat.lat,
                data.event.lngLat.lng,
                insertIndex,
            );
            const insertedWaypoint = createWaypointFromTap(
                data.event.lngLat.lat,
                data.event.lngLat.lng,
                {
                    name: getWaypointCoordinateName(
                        data.event.lngLat.lat,
                        data.event.lngLat.lng,
                    ),
                },
            );
            insertedWaypoint.id = cryptoRandomString({ length: 15 });

            const waypoints = [...($formData.expand!.waypoints_via_trail ?? [])];
            waypoints.splice(insertIndex, 0, insertedWaypoint);
            normalizeWaypointConnectionModes(waypoints);
            snapSegmentsForInsertedWaypoint(waypoints, insertIndex);
            $formData.expand!.waypoints_via_trail = waypoints;
            syncWaypointIconsWithRoutingRole();
            await recalculateRouteFromWaypoints({ showSuccessToast: false });
            return;
        }

        addAnchor(
            data.event.lngLat.lat,
            data.event.lngLat.lng,
            data.segment + 1,
        );

        splitSegment(data.segment, data.event.lngLat);
        updateFollowingAnchors(data.segment);
        updateTrailWithRouteData();
    }

    function reverseTrail() {
        reverseRoute();

        updateTrailWithRouteData();
    }

    function resetTrail() {
        resetRoute();

        updateTrailWithRouteData();
    }

    async function recalculateElevationData() {
        await recalculateHeight();

        updateTrailWithRouteData();
    }

    function toggleCropMarkers(active: boolean) {
        if (active) {
            cropStartMarker?.setOpacity("1");
            cropEndMarker?.setOpacity("1");
        } else {
            cropStartMarker?.setOpacity("0");
            cropEndMarker?.setOpacity("0");

            updateTotals(valhallaStore.route);
        }
    }

    function updateCropMarkers(range: [start: number, end: number]) {
        if (!cropStartMarker || !cropEndMarker) {
            cropStartMarker = new FontawesomeMarker(
                {
                    id: "crop-start-marker",
                    icon: "fa-regular fa-circle",
                    fontSize: "xs",
                    style: "w-6",
                    width: 4,
                    backgroundColor: "bg-primary",
                    fontColor: "white",
                },
                {},
            );
            cropEndMarker = new FontawesomeMarker(
                {
                    id: "crop-end-marker",
                    icon: "fa fa-flag-checkered",
                    fontSize: "xs",
                    style: "w-6",
                    width: 4,
                    backgroundColor: "bg-primary",
                    fontColor: "white",
                },
                {},
            );

            cropStartMarker.setLngLat([0, 0]).addTo(map!);
            cropEndMarker.setLngLat([0, 0]).addTo(map!);
        }
        const [start, end] = range;

        const flatRoute = valhallaStore.route.flatten();

        const targetStartDistance =
            valhallaStore.route.features.distance * (start / 100);
        const [startLon, startLat, startIndex] = getCoordinateAtDistance(
            flatRoute,
            valhallaStore.route.features.cumulativeDistance,
            targetStartDistance,
        );

        const targetEndDistance =
            valhallaStore.route.features.distance * (end / 100);
        const [endLon, endLat, endIndex] = getCoordinateAtDistance(
            flatRoute,
            valhallaStore.route.features.cumulativeDistance,
            targetEndDistance,
        );

        cropStartMarker.setLngLat([startLon, startLat]);
        cropEndMarker.setLngLat([endLon, endLat]);

        croppedGPX = cropGPX(
            flatRoute[startIndex],
            flatRoute[endIndex],
            valhallaStore.route,
        );

        updateTotals(croppedGPX);
    }

    function confirmCrop() {
        if (!croppedGPX) {
            return;
        }
        setRoute(croppedGPX, true);
        updateTrailWithRouteData();
        clearAnchors();
        initRouteAnchors(croppedGPX, true);
    }

    function getCoordinateAtDistance(
        points: GPXWaypoint[],
        cumulative: number[],
        target: number,
    ) {
        let low = 0,
            high = cumulative.length - 1;

        while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (cumulative[mid] < target) low = mid + 1;
            else high = mid;
        }

        const i = Math.max(1, low);
        const prevDist = cumulative[i - 1];
        const nextDist = cumulative[i];
        const ratio = (target - prevDist) / (nextDist - prevDist);

        const prev = points[i - 1];
        const next = points[i];

        return [
            prev.$.lon! + (next.$.lon! - prev.$.lon!) * ratio,
            prev.$.lat! + (next.$.lat! - prev.$.lat!) * ratio,
            i,
        ];
    }

    function updateTrailWithRouteData() {
        overwriteGPX = true;
        updateTotals(valhallaStore.route);

        if (!$formData.id) {
            $formData.id = cryptoRandomString({ length: 15 });
        }
        updateTrailOnMap();
    }

    function updateTotals(gpx: GPX) {
        const totals = gpx.features;
        formData.set({
            ...$formData,
            distance: totals.distance,
            duration: totals.duration / 1000,
            elevation_gain: totals.elevationGain,
            elevation_loss: totals.elevationLoss,
        });
    }

    function updateTrailOnMap() {
        const t: Trail = JSON.parse(JSON.stringify($formData));
        t.expand!.gpx = valhallaStore.route;
        mapTrail = [t];
    }

    function handleSearchClick(item: SearchItem) {
        map?.flyTo({
            center: [item.value.lon, item.value.lat],
            zoom: 13,
            animate: false,
        });
    }

    async function searchCities(q: string) {
        const r = await searchLocations(q);
        searchDropdownItems = r.map((h) => ({
            text: h.name,
            description: h.description,
            value: h,
            icon: getIconForLocation(h),
        }));
    }

    function getTrailTags() {
        return (
            $formData.expand?.tags?.map((t) => ({
                text: t.name,
                value: t,
            })) ?? []
        );
    }

    function setTrailTags(items: ComboboxItem[]) {
        $formData.expand!.tags = items.map((i) =>
            i.value ? i.value : new Tag(i.text),
        );
    }

    async function searchTags(q: string) {
        const result = await tags_index(q);
        tagItems = result.items.map((t) => ({ text: t.name, value: t }));
    }

    function openPhotoBrowser() {
        document.getElementById("waypoint-photo-input")!.click();
    }

    async function handleWaypointPhotoSelection() {
        const files = (
            document.getElementById("waypoint-photo-input") as HTMLInputElement
        ).files;

        if (!files) {
            return;
        }

        for (const file of files) {
            const coords = await new Promise<number[]>((resolve) => {
                EXIF.getData(file, function (p) {
                    const lat = EXIF.getTag(p, "GPSLatitude");
                    const latDir = EXIF.getTag(p, "GPSLatitudeRef");
                    const lon = EXIF.getTag(p, "GPSLongitude");
                    const lonDir = EXIF.getTag(p, "GPSLongitudeRef");

                    if (lat && lon) {
                        resolve([
                            convertDMSToDD(lat, latDir),
                            convertDMSToDD(lon, lonDir),
                        ]);
                    } else {
                        resolve([]);
                    }
                });
            });
            if (coords.length) {
                const wp: Waypoint = new Waypoint(coords[0], coords[1], {
                    icon: "image",
                });
                wp._photos = [file];
                saveWaypoint(wp);
            } else {
                show_toast(
                    {
                        type: "warning",
                        icon: "warning",
                        text: `${file.name}: ${$_("no-gps-data-in-image")}`,
                    },
                    10000,
                );
            }
        }
    }

    function undoRouteEdit() {
        undo();
        clearAnchors();
        initRouteAnchors(valhallaStore.route, true);
        updateTrailWithRouteData();
    }

    function redoRouteEdit() {
        redo();
        clearAnchors();
        initRouteAnchors(valhallaStore.route, true);
        updateTrailWithRouteData();
    }

    onDestroy(() => {
        if (waypointRecalcDebounceTimeout) {
            clearTimeout(waypointRecalcDebounceTimeout);
        }
        closeWaypointActionPopup();
    });

</script>

<svelte:head>
    <title
        >{page.params.id !== "new"
            ? `${$formData.name} | ${$_("edit")}`
            : $_("new-trail")} | wanderer</title
    >
</svelte:head>

<main class="grid grid-cols-1 md:grid-cols-[400px_1fr]">
    <form
        id="trail-form"
        class="overflow-y-auto overflow-x-hidden flex flex-col gap-4 px-8 order-1 md:order-none mt-8 md:mt-0"
        use:form
    >
        <Search
            onupdate={(q) => searchCities(q)}
            onclick={(item) => handleSearchClick(item)}
            placeholder="{$_('search-places')}..."
            items={searchDropdownItems}
        ></Search>
        <hr class="border-input-border" />
        <h3 class="text-xl font-semibold">{$_("pick-a-trail")}</h3>
        <Button
            primary={true}
            type="button"
            disabled={drawingActive}
            onclick={openFileBrowser}
            >{$formData.expand?.gpx_data
                ? $_("upload-new-file")
                : $_("upload-file")}</Button
        >
        {#if env.PUBLIC_VALHALLA_URL}
            <label class="flex items-start gap-2 text-sm font-medium">
                <input
                    type="checkbox"
                    class="mt-1"
                    bind:checked={snapImportedRouteToValhalla}
                    disabled={drawingActive}
                />
                <span>{$_("snap-imported-route-to-valhalla")}</span>
            </label>
        {/if}
        {#if env.PUBLIC_VALHALLA_URL && !$formData.expand?.gpx_data}
            <div class="flex gap-4 items-center w-full">
                <hr class="basis-full border-input-border" />
                <span class="text-gray-500 uppercase">{$_("or")}</span>
                <hr class="basis-full border-input-border" />
            </div>
            <button
                class="btn-primary"
                type="button"
                onclick={async () => {
                    if (drawingActive) {
                        await stopDrawing();
                    } else {
                        startDrawing();
                    }
                }}
            >
                {drawingActive ? $_("stop-drawing") : $_("draw-a-route")}</button
            >
        {/if}
        <input
            type="file"
            name="gpx"
            id="fileInput"
            accept=".gpx,.GPX,.tcx,.TCX,.kml,.KML,.kmz,.KMZ,.fit,.FIT"
            style="display: none;"
            onchange={handleFileSelection}
        />
        <hr class="border-separator" />
        <div class="flex gap-x-2">
            <h3 class="text-xl font-semibold">{$_("basic-info")}</h3>
            <button
                aria-label="Edit basic info"
                type="button"
                class="btn-icon"
                style="font-size: 0.9rem"
                onclick={() => (editingBasicInfo = !editingBasicInfo)}
                ><i class="fa fa-{editingBasicInfo ? 'check' : 'pen'}"
                ></i></button
            >
        </div>

        <fieldset
            class="grid grid-cols-2 gap-4 justify-around"
            data-felte-keep-on-remove
        >
            {#if editingBasicInfo}
                <TextField
                    bind:value={$formData.distance}
                    name="distance"
                    label={$_("distance")}
                ></TextField>
                <TextField
                    bind:value={$formData.duration}
                    name="duration"
                    label={$_("est-duration")}
                ></TextField><TextField
                    bind:value={$formData.elevation_gain}
                    name="elevation_gain"
                    label={$_("elevation-gain")}
                ></TextField>
                <TextField
                    bind:value={$formData.elevation_loss}
                    name="elevation_loss"
                    label={$_("elevation-loss")}
                ></TextField>
            {:else}
                <div>
                    <p>{$_("distance")}</p>
                    <span class="font-medium"
                        >{formatDistance($formData.distance)}</span
                    >
                    <input
                        type="hidden"
                        name="distance"
                        value={$formData.distance}
                    />
                </div>
                <div>
                    <p>{$_("est-duration")}</p>
                    <span class="font-medium"
                        >{formatTimeHHMM($formData.duration)}</span
                    >
                    <input
                        type="hidden"
                        name="duration"
                        value={$formData.duration}
                    />
                </div>
                <div>
                    <p>{$_("elevation-gain")}</p>
                    <span class="font-medium"
                        >{formatElevation($formData.elevation_gain)}</span
                    >
                    <input
                        type="hidden"
                        name="elevation_gain"
                        value={$formData.elevation_gain}
                    />
                </div>
                <div>
                    <p>{$_("elevation-loss")}</p>
                    <span class="font-medium"
                        >{formatElevation($formData.elevation_loss)}</span
                    >
                    <input
                        type="hidden"
                        name="elevation_gain"
                        value={$formData.elevation_gain}
                    />
                </div>
            {/if}
        </fieldset>
        <TextField name="name" label={$_("name")} error={$errors.name}
        ></TextField>
        <TextField
            name="location"
            label={$_("location")}
            error={$errors.location}
        ></TextField>
        <Datepicker label={$_("date")} bind:value={$formData.date}></Datepicker>
        <Editor
            extraClasses="min-h-24"
            bind:value={$formData.description}
            label={$_("describe-your-trail")}
        ></Editor>
        <Combobox
            bind:value={getTrailTags, setTrailTags}
            onupdate={searchTags}
            items={tagItems}
            label={$_("tags")}
            multiple
            chips
        ></Combobox>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-y-4">
            <Select
                name="difficulty"
                label={$_("difficulty")}
                items={[
                    { text: $_("easy"), value: "easy" },
                    { text: $_("moderate"), value: "moderate" },
                    { text: $_("difficult"), value: "difficult" },
                ]}
            ></Select>
            <Select
                name="category"
                label={$_("category")}
                items={$categories.map((c) => ({
                    text: $_(c.name),
                    value: c.id,
                }))}
            ></Select>
        </div>

        <Toggle
            name="public"
            label={$formData.public ? $_("public") : $_("private")}
            icon={$formData.public ? "globe" : "lock"}
        ></Toggle>
        <hr class="border-separator" />
        <h3 class="text-xl font-semibold">
            {$_("waypoints", { values: { n: 2 } })}
        </h3>
        <ul>
            {#each $formData.expand?.waypoints_via_trail ?? [] as waypoint, i}
                <li
                    onmouseenter={() => openMarkerPopup(waypoint)}
                    onmouseleave={() => openMarkerPopup(waypoint)}
                >
                    {#if i > 0}
                        <div
                            class="mx-2 flex items-center gap-2 py-1 text-xs text-gray-500"
                        >
                            <span class="shrink-0 font-medium">
                                Verbindung {i} → {i + 1}
                            </span>
                            <span class="h-px flex-1 bg-input-border"></span>
                            <select
                                name={`waypoint-connection-mode-${waypoint.id ?? i}`}
                                class="h-8 max-w-40 rounded-md bg-input-background px-2 text-xs outline outline-1 outline-input-border focus:outline-input-border-focus"
                                value={waypoint.connectionMode ?? "snap"}
                                onchange={(event) => {
                                    const value = (
                                        event.currentTarget as HTMLSelectElement
                                    ).value as WaypointConnectionMode;
                                    if (
                                        value === "original-kml" &&
                                        !importedOriginalRoute
                                    ) {
                                        return;
                                    }
                                    waypoint.connectionMode = value;
                                    $formData.expand!.waypoints_via_trail = [
                                        ...($formData.expand!.waypoints_via_trail ??
                                            []),
                                    ];
                                    void recalculateSingleWaypointSegment(i);
                                }}
                            >
                                <option value="snap">Valhalla-Snap</option>
                                <option value="straight">Luftlinie</option>
                                <option
                                    value="original-kml"
                                    disabled={!importedOriginalRoute}
                                    >KML-Original</option
                                >
                            </select>
                        </div>
                    {/if}
                    <WaypointCard
                        {waypoint}
                        waypointNumber={i + 1}
                        canMoveUp={i > 0}
                        canMoveDown={i <
                            ($formData.expand?.waypoints_via_trail?.length ??
                                0) -
                                1}
                        onMoveUp={() => moveWaypoint(i, i - 1)}
                        onMoveDown={() => moveWaypoint(i, i + 1)}
                        canSetAsStart={isLoopRouteActive()}
                        routingRole={getRoutingRoleByIndex(
                            i,
                            $formData.expand?.waypoints_via_trail?.length ?? 0,
                        )}
                        mode="edit"
                        onchange={(item) =>
                            handleWaypointMenuClick(waypoint, i, item)}
                    ></WaypointCard>
                    {#if i === ($formData.expand?.waypoints_via_trail?.length ?? 0) - 1 && ($formData.expand?.waypoints_via_trail?.length ?? 0) > 1}
                        <div
                            class="mx-2 flex items-center gap-2 py-1 text-xs text-gray-500"
                        >
                            <span class="shrink-0 font-medium">
                                {$_("roundtrip-connection-label", {
                                    values: {
                                        from: i + 1,
                                        to: 1,
                                    },
                                })}
                            </span>
                            <span class="h-px flex-1 bg-input-border"></span>
                            <select
                                name="loop-connection-mode"
                                class="h-8 max-w-56 rounded-md bg-input-background px-2 text-xs outline outline-1 outline-input-border focus:outline-input-border-focus"
                                value={loopConnectionMode}
                                onchange={(event) => {
                                    void updateLoopConnectionMode(
                                        (
                                            event.currentTarget as HTMLSelectElement
                                        ).value as LoopConnectionMode,
                                    );
                                }}
                            >
                                <option value="none"
                                    >{$_("roundtrip-mode-none")}</option
                                >
                                <option value="snap"
                                    >{$_("roundtrip-mode-snap")}</option
                                >
                                <option value="straight"
                                    >{$_("roundtrip-mode-straight")}</option
                                >
                            </select>
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
        <button
            class="btn-secondary"
            type="button"
            onclick={() => openPhotoBrowser()}
            ><i class="fa fa-image mr-2"></i>{$_("from-photos")}</button
        >
        <PoiFilterPanel
            categories={data.poiCategories}
            bind:selectedCategoryIds={selectedPoiCategoryIds}
            bind:includePublic={includePublicPois}
            bind:includeOwn={includeOwnPois}
            title={$_("poi-routing-panel-title")}
        ></PoiFilterPanel>
        <p class="text-sm text-gray-500">{$_("poi-routing-panel-hint")}</p>
        <input
            type="file"
            id="waypoint-photo-input"
            accept="image/*"
            multiple={true}
            style="display: none;"
            onchange={() => handleWaypointPhotoSelection()}
        />
        <hr class="border-separator" />
        <h3 class="text-xl font-semibold">{$_("photos")}</h3>
        <PhotoPicker
            id="trail"
            parent={$formData}
            bind:photos={$formData.photos}
            bind:thumbnail={$formData.thumbnail}
            bind:photoFiles
        ></PhotoPicker>
        <hr class="border-separator" />
        <h3 class="text-xl font-semibold">{$_("summit-book")}</h3>
        <ul>
            {#each $formData.expand?.summit_logs_via_trail ?? [] as log, i}
                <li>
                    <SummitLogCard
                        {log}
                        mode={log.author == $currentUser?.actor
                            ? "edit"
                            : "show"}
                        onchange={(item) =>
                            handleSummitLogMenuClick(log, i, item)}
                    ></SummitLogCard>
                </li>
            {/each}
        </ul>
        <button
            class="btn-secondary"
            type="button"
            onclick={beforeSummitLogModalOpen}
            ><i class="fa fa-plus mr-2"></i>{$_("add-entry")}</button
        >
        {#if lists.items.length}
            <hr class="border-separator" />
            <h3 class="text-xl font-semibold">
                {$_("list", { values: { n: 2 } })}
            </h3>
            <div class="flex gap-4 flex-wrap">
                {#each lists.items as list}
                    {#if $formData.id && list.trails?.includes($formData.id)}
                        <div
                            class="flex gap-2 items-center border border-input-border rounded-xl p-2"
                        >
                            <img
                                class="w-8 aspect-square rounded-full object-cover"
                                src={list.avatar
                                    ? getFileURL(list, list.avatar)
                                    : $theme === "light"
                                      ? emptyStateTrailLight
                                      : emptyStateTrailDark}
                                alt="avatar"
                            />

                            <span class="text-sm">{list.name}</span>
                        </div>
                    {/if}
                {/each}
            </div>
            <Button
                secondary={true}
                tooltip={$_("save-your-trail-first")}
                disabled={page.params.id == "new" && !savedAtLeastOnce}
                type="button"
                onclick={() => listSelectModal.openModal()}
                ><i class="fa fa-plus mr-2"></i>{$_("add-to-list")}</Button
            >
        {/if}
        <hr class="border-separator" />
        <Button
            primary={true}
            large={true}
            type="submit"
            extraClasses="mb-2"
            {loading}>{$_("save-trail")}</Button
        >
    </form>
    <div class="relative">
        {#if drawingActive}
            <div
                in:fly={{ easing: backInOut, x: -30 }}
                out:fly={{ easing: backInOut, x: -30 }}
                class="absolute top-8 left-2 z-50"
            >
                <RouteEditor
                    bind:options={routingOptions}
                    onReverse={reverseTrail}
                    onReset={resetTrail}
                    onCropToggle={toggleCropMarkers}
                    onCrop={confirmCrop}
                    onUpdateCropRange={updateCropMarkers}
                    onRecalculateElevationData={recalculateElevationData}
                    onUndo={undoRouteEdit}
                    onRedo={redoRouteEdit}
                ></RouteEditor>
            </div>
        {/if}
        <div id="trail-map">
            <MapWithElevationMaplibre
                trails={mapTrail}
                waypoints={$formData.expand?.waypoints_via_trail}
                drawing={drawingActive}
                showTerrain={true}
                autoGeolocateOnDrawing={page.params.id === "new"}
                onmarkerdragend={moveMarker}
                activeTrail={0}
                pois={filteredRoutePlannerPois}
                poiAttributeDefinitions={data.poiAttributeDefinitions}
                onpoiclick={addPoiAsRoutePoint}
                bind:map
                onclick={(target) => handleMapClick(target)}
                onsegmentclick={(data) => handleSegmentClick(data)}
                onsegmentdragend={(data) => handleSegmentDragEnd(data)}
                mapOptions={{ preserveDrawingBuffer: true }}
            ></MapWithElevationMaplibre>
        </div>
    </div>
</main>
<WaypointModal bind:this={waypointModal} onsave={saveWaypoint}></WaypointModal>
<SummitLogModal bind:this={summitLogModal} onsave={(log) => saveSummitLog(log)}
></SummitLogModal>
<ListSearchModal
    lists={lists.items}
    bind:this={listSelectModal}
    onchange={(e) => handleListSelection(e)}
></ListSearchModal>

<style>
    #trail-map {
        height: calc(50vh);
    }
    @media only screen and (min-width: 768px) {
        #trail-map,
        form {
            height: calc(100vh - 124px);
        }
    }
</style>
