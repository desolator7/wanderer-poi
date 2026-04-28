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
    import type {
        RouteCalculationResult,
        RoutingOptions,
        SacScaleSegment,
        ValhallaAnchor,
        ValhallaBicycleCostingOptions,
    } from "$lib/models/valhalla";
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
        reverseRoute,
        setRoute,
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
    import { fromFile, gpx2trail } from "$lib/util/gpx_util";

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
    } from "$lib/util/maplibre_util";
    import {
        createWaypointFromTap,
        getRoutingRoleByIndex,
        getWaypointInsertIndexByNearestSegment,
        simplifyPolylinePoints,
    } from "$lib/util/waypoint_routing";
    import { consumeRouteImportSession } from "$lib/util/route_import_util";
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
    let draggingMarker = false;
    let snapImportedRouteToValhalla = $state(false);

    let searchDropdownItems: SearchItem[] = $state([]);

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
            walking_speed: 4,
            use_hills: 0.5,
            use_tracks: 1,
            walkway_factor: 0.7,
            sidewalk_factor: 1,
            shortest: true,
        },
        bicycleOptions: {
            bicycle_type: "Hybrid",
            cycling_speed: 18,
            use_roads: 0.4,
            use_hills: 0.5,
            avoid_bad_surfaces: 0.4,
            shortest: true,
        },
    });
    const maxHikingDifficultyItems = $derived([
        { text: `1 - ${$_("sac-scale-1-short")}`, value: 1 },
        { text: `2 - ${$_("sac-scale-2-short")}`, value: 2 },
        { text: `3 - ${$_("sac-scale-3-short")}`, value: 3 },
        { text: `4 - ${$_("sac-scale-4-short")}`, value: 4 },
        { text: `5 - ${$_("sac-scale-5-short")}`, value: 5 },
        { text: `6 - ${$_("sac-scale-6-short")}`, value: 6 },
    ]);
    const walkingSpeedItems = $derived([
        {
            text: `1 - ${$_("walking-speed-very-slow")} (2 km/h)`,
            value: 2,
            description: $_("walking-speed-very-slow-description"),
        },
        {
            text: `2 - ${$_("walking-speed-slow")} (3 km/h)`,
            value: 3,
            description: $_("walking-speed-slow-description"),
        },
        {
            text: `3 - ${$_("walking-speed-normal")} (4 km/h)`,
            value: 4,
            description: $_("walking-speed-normal-description"),
        },
        {
            text: `4 - ${$_("walking-speed-brisk")} (5 km/h)`,
            value: 5,
            description: $_("walking-speed-brisk-description"),
        },
        {
            text: `5 - ${$_("walking-speed-very-brisk")} (6 km/h)`,
            value: 6,
            description: $_("walking-speed-very-brisk-description"),
        },
        {
            text: `6 - ${$_("walking-speed-fast")} (7 km/h)`,
            value: 7,
            description: $_("walking-speed-fast-description"),
        },
    ]);
    const hillPreferenceItems = $derived([
        {
            text: `1 - ${$_("hill-preference-avoid-strongly")}`,
            value: 0,
            description: $_("hill-preference-avoid-strongly-description"),
        },
        {
            text: `2 - ${$_("hill-preference-avoid")}`,
            value: 0.2,
            description: $_("hill-preference-avoid-description"),
        },
        {
            text: `3 - ${$_("hill-preference-balanced")}`,
            value: 0.5,
            description: $_("hill-preference-balanced-description"),
        },
        {
            text: `4 - ${$_("hill-preference-accept")}`,
            value: 0.7,
            description: $_("hill-preference-accept-description"),
        },
        {
            text: `5 - ${$_("hill-preference-like")}`,
            value: 0.85,
            description: $_("hill-preference-like-description"),
        },
        {
            text: `6 - ${$_("hill-preference-direct")}`,
            value: 1,
            description: $_("hill-preference-direct-description"),
        },
    ]);
    type BicycleRouteProfile = "bicycle" | "mountainbike" | "ebike";
    let bicycleRouteProfile: BicycleRouteProfile = $state("bicycle");
    const bicycleRouteProfiles: Record<
        BicycleRouteProfile,
        ValhallaBicycleCostingOptions
    > = {
        bicycle: {
            bicycle_type: "Hybrid",
            cycling_speed: 18,
            use_roads: 0.4,
            use_hills: 0.5,
            avoid_bad_surfaces: 0.4,
            shortest: true,
        },
        mountainbike: {
            bicycle_type: "Mountain",
            cycling_speed: 16,
            use_roads: 0.1,
            use_hills: 0.8,
            avoid_bad_surfaces: 0,
            shortest: true,
        },
        ebike: {
            bicycle_type: "Hybrid",
            cycling_speed: 22,
            use_roads: 0.4,
            use_hills: 1,
            avoid_bad_surfaces: 0.4,
            shortest: true,
        },
    };
    const bicycleRouteProfileItems = $derived([
        {
            text: $_("bike-profile-bicycle"),
            value: "bicycle",
            description: $_("bike-profile-bicycle-description"),
        },
        {
            text: $_("bike-profile-mountainbike"),
            value: "mountainbike",
            description: $_("bike-profile-mountainbike-description"),
        },
        {
            text: $_("bike-profile-ebike"),
            value: "ebike",
            description: $_("bike-profile-ebike-description"),
        },
    ]);
    let routeSacScaleSegments: SacScaleSegment[][] = $state([]);
    type StoredTrailDifficulty = "easy" | "moderate" | "difficult";
    type RouteDifficultyAssessment = {
        label: string;
        storedDifficulty: StoredTrailDifficulty;
    };

    function getFallbackDifficultyLabel(difficulty?: StoredTrailDifficulty) {
        return $_(difficulty ?? "easy");
    }

    function getSacScaleLabel(sacScale: number) {
        return $_(`sac-scale-${sacScale}-short`);
    }

    function getStoredDifficultyFromSacScale(sacScale: number): StoredTrailDifficulty {
        if (sacScale >= 3) {
            return "difficult";
        }

        if (sacScale === 2) {
            return "moderate";
        }

        return "easy";
    }

    function calculateRouteDifficultyAssessment(
        sacScaleSegments: SacScaleSegment[][],
        fallbackDifficulty?: StoredTrailDifficulty,
    ): RouteDifficultyAssessment {
        const segments = sacScaleSegments.flat();
        const maxSacScale = Math.max(
            0,
            ...segments.map((segment) => segment.sacScale),
        );

        if (maxSacScale <= 0) {
            return {
                label: getFallbackDifficultyLabel(fallbackDifficulty),
                storedDifficulty: fallbackDifficulty ?? "easy",
            };
        }

        return {
            label: getSacScaleLabel(maxSacScale),
            storedDifficulty: getStoredDifficultyFromSacScale(maxSacScale),
        };
    }

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
    const valhallaSnapImportMaxPointsCap = 120;
    const valhallaSnapImportGrowthStartKm = 40;
    const valhallaSnapImportKmPerExtraWaypoint = 2;

    let savedAtLeastOnce = $state(false);

    let tagItems: ComboboxItem[] = $state([]);
    type RouteSegmentEndpoint = { lat: number; lon: number };
    type WaypointConnectionMode = "snap" | "straight" | "original-kml";
    type LoopConnectionMode = "none" | "snap" | "straight";
    type WaypointHistorySnapshot = {
        waypoints: Waypoint[];
        loopConnectionMode: LoopConnectionMode;
    };

    function createRouteCalculationResult(
        waypoints: GPXWaypoint[],
        sacScaleSegments: SacScaleSegment[] = [],
    ): RouteCalculationResult {
        return { waypoints, sacScaleSegments };
    }

    function getCategoryKey(categoryId?: string) {
        const category = $categories.find((entry) => entry.id === categoryId);
        return (
            category?.name
                ?.toLowerCase()
                .normalize("NFKD")
                .replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "") ?? null
        );
    }

    function getRoutingModeForCategory(categoryId?: string) {
        const categoryKey = getCategoryKey(categoryId);

        if (!categoryKey) {
            return null;
        }

        if (["hiking", "wandern"].includes(categoryKey)) {
            return "pedestrian";
        }

        if (
            [
                "biking",
                "cycling",
                "radfahren",
                "fahrrad",
                "mountain-biking",
                "mountainbike",
                "mountain-bike",
                "mtb",
                "e-bike",
                "ebike",
                "pedelec",
            ].includes(categoryKey)
        ) {
            return "bicycle";
        }

        return null;
    }

    function getBicycleProfileForCategory(
        categoryId?: string,
    ): BicycleRouteProfile | null {
        const categoryKey = getCategoryKey(categoryId);

        if (!categoryKey) {
            return null;
        }

        if (["e-bike", "ebike", "pedelec"].includes(categoryKey)) {
            return "ebike";
        }

        if (
            ["mountain-biking", "mountainbike", "mountain-bike", "mtb"].includes(
                categoryKey,
            )
        ) {
            return "mountainbike";
        }

        if (
            ["biking", "cycling", "radfahren", "fahrrad"].includes(categoryKey)
        ) {
            return "bicycle";
        }

        return null;
    }

    function applyRoutingForCategory(categoryId?: string, recalculate = false) {
        const routingMode = getRoutingModeForCategory(categoryId);
        if (!routingMode) {
            return;
        }

        if (routingOptions.modeOfTransport !== routingMode) {
            routingOptions.modeOfTransport = routingMode;
        }

        const bicycleProfile = getBicycleProfileForCategory(categoryId);
        if (bicycleProfile) {
            if (bicycleRouteProfile !== bicycleProfile) {
                bicycleRouteProfile = bicycleProfile;
            }

            const profileOptions = bicycleRouteProfiles[bicycleProfile];
            if (
                routingOptions.bicycleOptions?.bicycle_type !==
                    profileOptions.bicycle_type ||
                routingOptions.bicycleOptions?.cycling_speed !==
                    profileOptions.cycling_speed ||
                routingOptions.bicycleOptions?.use_roads !==
                    profileOptions.use_roads ||
                routingOptions.bicycleOptions?.use_hills !==
                    profileOptions.use_hills ||
                routingOptions.bicycleOptions?.avoid_bad_surfaces !==
                    profileOptions.avoid_bad_surfaces
            ) {
                routingOptions.bicycleOptions = {
                    ...routingOptions.bicycleOptions,
                    ...profileOptions,
                };
            }
        }

        if (recalculate) {
            scheduleRoutingOptionRecalculation();
        }
    }

    function getPreferredRouteCategoryId(preferredCategoryId?: string) {
        if (getRoutingModeForCategory(preferredCategoryId)) {
            return preferredCategoryId;
        }

        const hikingCategory = $categories.find(
            (category) => getRoutingModeForCategory(category.id) === "pedestrian",
        );
        if (hikingCategory) {
            return hikingCategory.id;
        }

        const bicycleCategory = $categories.find(
            (category) => getRoutingModeForCategory(category.id) === "bicycle",
        );
        if (bicycleCategory) {
            return bicycleCategory.id;
        }

        return undefined;
    }

    function getDefaultWaypointConnectionMode(): WaypointConnectionMode {
        return routingOptions.autoRouting ? "snap" : "straight";
    }

    function cloneWaypoint(waypoint: Waypoint) {
        const clonedWaypoint = new Waypoint(waypoint.lat, waypoint.lon, {
            id: waypoint.id,
            name: waypoint.name,
            description: waypoint.description,
            icon: waypoint.icon,
            photos: [...(waypoint.photos ?? [])],
            trail: waypoint.trail,
            connectionMode: waypoint.connectionMode,
        });
        clonedWaypoint._photos = [...(waypoint._photos ?? [])];
        clonedWaypoint.author = waypoint.author;
        clonedWaypoint.distance_from_start = waypoint.distance_from_start;
        return clonedWaypoint;
    }

    function cloneWaypointHistorySnapshot(
        snapshot: WaypointHistorySnapshot,
    ): WaypointHistorySnapshot {
        return {
            waypoints: snapshot.waypoints.map(cloneWaypoint),
            loopConnectionMode: snapshot.loopConnectionMode,
        };
    }

    function captureWaypointHistorySnapshot(): WaypointHistorySnapshot {
        return {
            waypoints: ($formData.expand!.waypoints_via_trail ?? []).map(
                cloneWaypoint,
            ),
            loopConnectionMode,
        };
    }

    function applyWaypointHistorySnapshot(snapshot: WaypointHistorySnapshot) {
        $formData.expand!.waypoints_via_trail = snapshot.waypoints.map(
            cloneWaypoint,
        );
        loopConnectionMode = snapshot.loopConnectionMode;
        syncWaypointIconsWithRoutingRole();
    }

    function resetWaypointHistoryTracking() {
        waypointUndoStack = [];
        waypointRedoStack = [];
        lastWaypointHistoryState = captureWaypointHistorySnapshot();
        observedUndoDepth = valhallaStore.undoStack.length;
        observedRedoDepth = valhallaStore.redoStack.length;
    }

    const getInitialFormValues = () => ({
        ...data.trail,
        public: data.trail.id
            ? data.trail.public
            : page.data.settings?.privacy?.trails === "public",
        category:
            getPreferredRouteCategoryId(data.trail.category) ||
            getPreferredRouteCategoryId(page.data.settings?.category) ||
            $categories[0]?.id,
    });

    let loopConnectionMode: LoopConnectionMode = $state("none");
    let editableRouteCategories = $derived(
        $categories.filter((category) =>
            Boolean(getRoutingModeForCategory(category.id)),
        ),
    );
    let waypointUndoStack: WaypointHistorySnapshot[] = $state([]);
    let waypointRedoStack: WaypointHistorySnapshot[] = $state([]);
    let lastWaypointHistoryState: WaypointHistorySnapshot | null = $state(null);
    let observedUndoDepth = $state(0);
    let observedRedoDepth = $state(0);
    let suppressWaypointHistorySync = false;

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
            if (!canModifyTrail) {
                return;
            }
            loading = true;
            try {
                const htmlForm = document.getElementById(
                    "trail-form",
                ) as HTMLFormElement;
                const formData = new FormData(htmlForm);
                if (!formData.get("public")) {
                    form.public = false;
                }
                form.difficulty = calculateRouteDifficultyAssessment(
                    routeSacScaleSegments,
                    form.difficulty,
                ).storedDifficulty;
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

                const serializedRoute = valhallaStore.route.toString();
                const hasRoutePoints = Boolean(
                    valhallaStore.route.trk?.some((track) =>
                        track.trkseg?.some(
                            (segment) => (segment.trkpt?.length ?? 0) > 0,
                        ),
                    ),
                );
                form.expand!.gpx_data = serializedRoute;
                if (hasRoutePoints) {
                    gpxFile = new Blob([serializedRoute], {
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
                    createdTrail.expand ??= {};
                    createdTrail.expand.gpx_data = serializedRoute;
                    setFields(createdTrail);
                    trail.set(createdTrail);
                } else {
                    const updatedTrail = await trails_update(
                        $trail,
                        form as Trail,
                        photoFiles,
                        gpxFile,
                    );
                    updatedTrail.expand ??= {};
                    updatedTrail.expand.gpx_data = serializedRoute;
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

    let computedRouteDifficulty = $derived(
        calculateRouteDifficultyAssessment(
            routeSacScaleSegments,
            $formData.difficulty,
        ),
    );

    function scheduleRoutingOptionRecalculation() {
        if (($formData.expand?.waypoints_via_trail?.length ?? 0) > 1) {
            scheduleRouteRecalculationFromWaypoints({ showSuccessToast: false });
        }
    }

    function rerouteCurrentTrail() {
        if (!canModifyTrail) {
            return;
        }

        void recalculateRouteFromWaypoints({ showSuccessToast: true });
    }

    function setMaxHikingDifficulty(value: number | string) {
        routingOptions.pedestrianOptions!.max_hiking_difficulty = Number(value);
        scheduleRoutingOptionRecalculation();
    }

    function setWalkingSpeed(value: number | string) {
        routingOptions.pedestrianOptions!.walking_speed = Number(value);
        scheduleRoutingOptionRecalculation();
    }

    function setHillPreference(value: number | string) {
        routingOptions.pedestrianOptions!.use_hills = Number(value);
        scheduleRoutingOptionRecalculation();
    }

    function setBicycleRouteProfile(value: number | string) {
        if (
            value !== "bicycle" &&
            value !== "mountainbike" &&
            value !== "ebike"
        ) {
            return;
        }

        bicycleRouteProfile = value;
        routingOptions.bicycleOptions = {
            ...routingOptions.bicycleOptions,
            ...bicycleRouteProfiles[bicycleRouteProfile],
        };
        scheduleRoutingOptionRecalculation();
    }

    function getSelectedWalkingSpeedDescription() {
        const walkingSpeed = routingOptions.pedestrianOptions?.walking_speed;
        return (
            walkingSpeedItems.find(
                (item) => Number(item.value) === Number(walkingSpeed),
            )?.description ?? ""
        );
    }

    function getSelectedHillPreferenceDescription() {
        const hillPreference = routingOptions.pedestrianOptions?.use_hills;
        return (
            hillPreferenceItems.find(
                (item) => Number(item.value) === Number(hillPreference),
            )?.description ?? ""
        );
    }

    function getSelectedBicycleRouteProfileDescription() {
        return (
            bicycleRouteProfileItems.find(
                (item) => item.value === bicycleRouteProfile,
            )?.description ?? ""
        );
    }

    const isNewTrail = page.params.id === "new";

    let trailCanBeEdited = $derived(
        isNewTrail ||
            (Boolean($currentUser) &&
                ((data.trail.expand?.author?.id ?? data.trail.author) ===
                    $currentUser?.actor ||
                    Boolean(
                        data.trail.expand?.trail_share_via_trail?.some(
                            (share) => share.permission === "edit",
                        ),
                    ))),
    );
    let mapInteractionMode = $state(isNewTrail);
    let canModifyTrail = $derived(trailCanBeEdited && mapInteractionMode);

    $effect(() => {
        if (!trailCanBeEdited && mapInteractionMode) {
            mapInteractionMode = false;
        }
    });

    $effect(() => {
        const undoDepth = valhallaStore.undoStack.length;
        const redoDepth = valhallaStore.redoStack.length;

        if (suppressWaypointHistorySync) {
            observedUndoDepth = undoDepth;
            observedRedoDepth = redoDepth;
            return;
        }

        if (undoDepth > observedUndoDepth) {
            if (lastWaypointHistoryState) {
                waypointUndoStack = [
                    ...waypointUndoStack,
                    cloneWaypointHistorySnapshot(lastWaypointHistoryState),
                ];
            }
            waypointRedoStack = [];
            lastWaypointHistoryState = captureWaypointHistorySnapshot();
        } else if (
            undoDepth === 0 &&
            redoDepth === 0 &&
            (observedUndoDepth !== 0 || observedRedoDepth !== 0)
        ) {
            resetWaypointHistoryTracking();
            return;
        }

        observedUndoDepth = undoDepth;
        observedRedoDepth = redoDepth;
    });

    $effect(() => {
        editableRouteCategories;
        const preferredCategoryId = getPreferredRouteCategoryId(
            $formData.category,
        );
        if (preferredCategoryId && $formData.category !== preferredCategoryId) {
            setFields("category", preferredCategoryId);
            return;
        }

        untrack(() => applyRoutingForCategory(preferredCategoryId));
    });

    $effect(() => {
        map;
        if (canModifyTrail && map && !drawingActive) {
            startDrawing();
            return;
        }

        if (!canModifyTrail) {
            editingBasicInfo = false;
            closeWaypointActionPopup();

            if (drawingActive) {
                untrack(() => {
                    void stopDrawing();
                });
            }
        }
    });

    onMount(async () => {
        clearAnchors();
        clearRoute();
        clearUndoRedoStack();
        routeSacScaleSegments = [];

        if (
            page.params.id === "new" &&
            page.url.searchParams.get("import") === "session"
        ) {
            const pendingImport = consumeRouteImportSession();
            if (pendingImport?.gpxData) {
                await applyImportedTrailData(
                    pendingImport.gpxData,
                    pendingImport.name ?? "route.gpx",
                    new Blob([pendingImport.gpxData], {
                        type: "application/gpx+xml",
                    }),
                );
                return;
            }
        }

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
                if (
                    ($formData.expand!.waypoints_via_trail ?? []).some(
                        (waypoint, index) =>
                            index > 0 &&
                            waypoint.connectionMode === "original-kml",
                    )
                ) {
                    importedOriginalRoute = gpx;
                    importedOriginalSegments = buildOriginalSegmentsFromGPX(
                        gpx,
                        false,
                    );
                }
                loopConnectionMode = inferLoopConnectionModeFromRoute(
                    gpx,
                    $formData.expand!.waypoints_via_trail ?? [],
                );
                syncVisibleRouteAnchors();

                updateTrailOnMap();
                resetWaypointHistoryTracking();
            }
        }

        resetWaypointHistoryTracking();
    });

    function openFileBrowser() {
        if (!canModifyTrail) {
            return;
        }
        document.getElementById("fileInput")!.click();
    }

    async function applyImportedTrailData(
        gpxData: string,
        fileName: string,
        file: File | Blob,
    ) {
        clearWaypoints();
        clearAnchors();
        clearUndoRedoStack();
        clearRoute();
        routeSacScaleSegments = [];
        mapTrail = [];
        drawingActive = false;
        loopConnectionMode = "none";
        gpxFile = file;

        try {
            const prevId = $formData.id;
            const parseResult = await gpx2trail(gpxData, fileName);
            setFields(parseResult.trail);
            $formData.id = prevId ?? cryptoRandomString({ length: 15 });
            $formData.expand!.gpx_data = gpxData;

            setFields(
                "category",
                getPreferredRouteCategoryId(page.data.settings.category) ||
                    getPreferredRouteCategoryId($formData.category) ||
                    $categories[0]?.id,
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
            if (/\.(kml|kmz)$/i.test(fileName)) {
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
                    syncVisibleRouteAnchors();
                    updateTrailOnMap();
                }
            } else {
                syncVisibleRouteAnchors();
                updateTrailOnMap();
            }
            resetWaypointHistoryTracking();
        } catch (e) {
            console.error(e);

            show_toast({
                icon: "close",
                type: "error",
                text: $_("error-reading-file"),
            });
            return false;
        }
        const r = await searchLocationReverse($formData.lat!, $formData.lon!);

        if (r) {
            setFields("location", r);
        }

        return true;
    }

    async function handleFileSelection() {
        if (!canModifyTrail) {
            return;
        }
        const selectedFile = (
            document.getElementById("fileInput") as HTMLInputElement
        ).files?.[0];

        if (!selectedFile) {
            return;
        }

        const { gpxData, gpxFile: file } = await fromFile(selectedFile);
        await applyImportedTrailData(gpxData, selectedFile.name, file);
    }

    function clearWaypoints() {
        for (const waypoint of $formData.expand!.waypoints_via_trail ?? []) {
            waypoint.marker?.remove();
        }
        $formData.expand!.waypoints_via_trail = [];
        loopConnectionMode = "none";
    }

    function getValhallaSnapImportMaxPoints(
        points: { lat: number; lon: number }[],
    ) {
        if (points.length < 2) {
            return valhallaSnapImportSimplifyOptions.maxPoints;
        }

        let totalDistanceMeters = 0;
        for (let i = 1; i < points.length; i++) {
            const previous = points[i - 1];
            const current = points[i];
            totalDistanceMeters += haversineDistance(
                previous.lat,
                previous.lon,
                current.lat,
                current.lon,
            );
        }

        const totalDistanceKm = totalDistanceMeters / 1000;
        const extraWaypoints = Math.ceil(
            Math.max(0, totalDistanceKm - valhallaSnapImportGrowthStartKm) /
                valhallaSnapImportKmPerExtraWaypoint,
        );

        return Math.min(
            valhallaSnapImportMaxPointsCap,
            valhallaSnapImportSimplifyOptions.maxPoints + extraWaypoints,
        );
    }

    function buildOriginalSegmentsFromGPX(
        gpx: GPX | null,
        snapToValhalla: boolean,
    ): GPXWaypoint[][] {
        if (!gpx) {
            return [];
        }
        const segments: GPXWaypoint[][] = [];

        for (const track of gpx.trk ?? []) {
            for (const trkseg of track.trkseg ?? []) {
                const points = trkseg.trkpt ?? [];
                const segmentPoints = points.flatMap((point) =>
                    typeof point.$.lat === "number" &&
                    typeof point.$.lon === "number"
                        ? [{ lat: point.$.lat, lon: point.$.lon }]
                        : [],
                );
                const simplifyOptions = snapToValhalla
                    ? {
                          ...valhallaSnapImportSimplifyOptions,
                          maxPoints: getValhallaSnapImportMaxPoints(
                              segmentPoints,
                          ),
                      }
                    : originalKmlImportSimplifyOptions;
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
                i === 0
                    ? undefined
                    : waypoints[i].connectionMode ??
                      getDefaultWaypointConnectionMode();
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
        if (!canModifyTrail) {
            return;
        }
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

    function setSegmentToDefaultConnectionMode(
        waypoints: Waypoint[],
        toIndex: number,
    ) {
        if (toIndex > 0 && toIndex < waypoints.length) {
            waypoints[toIndex].connectionMode =
                getDefaultWaypointConnectionMode();
        }
    }

    function snapSegmentsAroundWaypoint(
        waypoints: Waypoint[],
        waypointIndex: number,
    ) {
        setSegmentToDefaultConnectionMode(waypoints, waypointIndex);
        setSegmentToDefaultConnectionMode(waypoints, waypointIndex + 1);
    }

    function snapSegmentsForInsertedWaypoint(
        waypoints: Waypoint[],
        insertIndex: number,
    ) {
        setSegmentToDefaultConnectionMode(waypoints, insertIndex);
        setSegmentToDefaultConnectionMode(waypoints, insertIndex + 1);
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
            setSegmentToDefaultConnectionMode(waypoints, segmentIndex + 1);
        }
    }

    function syncVisibleRouteAnchors() {
        clearAnchors();

        const addToMap = Boolean(map && drawingActive);
        const waypoints = $formData.expand!.waypoints_via_trail ?? [];

        if (waypoints.length > 0) {
            addAnchorsForWaypoints(waypoints, addToMap);
            return;
        }

        initRouteAnchors(valhallaStore.route, addToMap);
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
                    previousWaypoints[originalIndex].connectionMode ??
                    getDefaultWaypointConnectionMode();
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
        if (!canModifyTrail) {
            return;
        }
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
        if (!canModifyTrail) {
            return;
        }
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
            const routeSegments: RouteCalculationResult[] = [];
            for (let i = 1; i < waypoints.length; i++) {
                const previousWaypoint = waypoints[i - 1];
                const currentWaypoint = waypoints[i] as Waypoint & {
                    connectionMode?: WaypointConnectionMode;
                };
                const connectionMode =
                    currentWaypoint.connectionMode ??
                    getDefaultWaypointConnectionMode();

                let routeSegment: RouteCalculationResult;
                if (
                    connectionMode === "original-kml" &&
                    importedOriginalSegments[i - 1]?.length
                ) {
                    routeSegment = createRouteCalculationResult(
                        ensureRouteSegmentEndpoints(
                            importedOriginalSegments[i - 1],
                            previousWaypoint,
                            currentWaypoint,
                        ),
                    );
                } else {
                    routeSegment = await calculateRouteSegmentBetweenEndpoints(
                        previousWaypoint,
                        currentWaypoint,
                        {
                            ...routingOptions,
                            autoRouting: connectionMode === "snap",
                        },
                    );
                }

                routeSegments.push(routeSegment);
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
    ): Promise<RouteCalculationResult> {
        const previousWaypoint = waypoints[toIndex - 1];
        const currentWaypoint = waypoints[toIndex] as Waypoint & {
            connectionMode?: WaypointConnectionMode;
        };
        const connectionMode =
            currentWaypoint.connectionMode ?? getDefaultWaypointConnectionMode();

        if (
            connectionMode === "original-kml" &&
            importedOriginalSegments[toIndex - 1]?.length
        ) {
            return createRouteCalculationResult(
                ensureRouteSegmentEndpoints(
                    cloneRouteSegment(importedOriginalSegments[toIndex - 1]),
                    previousWaypoint,
                    currentWaypoint,
                ),
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
            return createRouteCalculationResult(
                buildStraightFallbackSegment(previousWaypoint, currentWaypoint),
            );
        }
    }

    function replaceRouteWithOrderedSegments(
        routeSegments: RouteCalculationResult[],
    ) {
        routeSacScaleSegments = routeSegments.map(
            (routeSegment) => routeSegment.sacScaleSegments,
        );
        valhallaStore.route = new GPX({
            trk: [
                new Track({
                    trkseg: routeSegments.map(
                        (routeSegment) =>
                            new TrackSegment({ trkpt: routeSegment.waypoints }),
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
            const routeSegment = await calculateRouteBetween(
                previousWaypoint.lat,
                previousWaypoint.lon,
                currentWaypoint.lat,
                currentWaypoint.lon,
                options,
            );
            return createRouteCalculationResult(
                ensureRouteSegmentEndpoints(
                    routeSegment.waypoints,
                    previousWaypoint,
                    currentWaypoint,
                ),
                routeSegment.sacScaleSegments,
            );
        } catch (e) {
            console.error(e);
            return createRouteCalculationResult(
                buildStraightFallbackSegment(previousWaypoint, currentWaypoint),
            );
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

    async function editCalculatedRouteSegment(
        index: number,
        routeSegment: RouteCalculationResult,
    ) {
        routeSacScaleSegments[index] = routeSegment.sacScaleSegments;
        routeSacScaleSegments = [...routeSacScaleSegments];
        await editRoute(index, routeSegment.waypoints);
    }

    async function insertCalculatedRouteSegment(
        routeSegment: RouteCalculationResult,
        index?: number,
    ) {
        if (index !== undefined) {
            routeSacScaleSegments.splice(index, 0, routeSegment.sacScaleSegments);
        } else {
            routeSacScaleSegments.push(routeSegment.sacScaleSegments);
        }
        routeSacScaleSegments = [...routeSacScaleSegments];
        await insertIntoRoute(routeSegment.waypoints, index);
    }

    function deleteCalculatedRouteSegment(index: number) {
        routeSacScaleSegments.splice(index, 1);
        routeSacScaleSegments = [...routeSacScaleSegments];
        deleteFromRoute(index);
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
                await editCalculatedRouteSegment(
                    result.segmentToIndex - 1,
                    result.routeWaypoints,
                );
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
            await editCalculatedRouteSegment(toIndex - 1, routeWaypoints);
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
                await insertCalculatedRouteSegment(firstSegment, 0);
            } else if (insertIndex >= waypoints.length - 1) {
                const lastSegment = await calculateRouteSegmentForWaypointPair(
                    waypoints,
                    insertIndex,
                );
                await insertCalculatedRouteSegment(lastSegment);
            } else {
                const [previousSegment, nextSegment] = await Promise.all([
                    calculateRouteSegmentForWaypointPair(waypoints, insertIndex),
                    calculateRouteSegmentForWaypointPair(
                        waypoints,
                        insertIndex + 1,
                    ),
                ]);
                await editCalculatedRouteSegment(
                    insertIndex - 1,
                    previousSegment,
                );
                await insertCalculatedRouteSegment(nextSegment, insertIndex);
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
            routeSacScaleSegments = [];
            updateTrailWithRouteData();
            return;
        }

        if (waypoints.length === 1) {
            deleteCalculatedRouteSegment(0);
            updateTrailWithRouteData();
            return;
        }

        try {
            if (deletedIndex <= 0) {
                deleteCalculatedRouteSegment(0);
            } else if (deletedIndex >= previousWaypointCount - 1) {
                deleteCalculatedRouteSegment(previousWaypointCount - 2);
            } else {
                setSegmentToDefaultConnectionMode(waypoints, deletedIndex);
                $formData.expand!.waypoints_via_trail = [...waypoints];
                const mergedSegment = await calculateRouteSegmentForWaypointPair(
                    waypoints,
                    deletedIndex,
                );
                await editCalculatedRouteSegment(deletedIndex - 1, mergedSegment);
                deleteCalculatedRouteSegment(deletedIndex);
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
                await editCalculatedRouteSegment(
                    update.segmentIndex,
                    update.routeWaypoints,
                );
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
        options?: { presetName?: string; insertIndex?: number | null },
    ) {
        if (!map || !canModifyTrail) {
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
                insertIndex: options?.insertIndex,
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

        mapWaypointPopup = new M.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 20,
        })
            .setLngLat(lnglat)
            .setDOMContent(content)
            .addTo(map);
    }

    function showWaypointMovePopup(
        marker: M.Marker,
        waypointIndex: number,
        originalPosition: RouteSegmentEndpoint,
    ) {
        if (!map || !canModifyTrail) {
            marker.setLngLat([originalPosition.lon, originalPosition.lat]);
            return;
        }

        closeWaypointActionPopup();

        const movedPosition = marker.getLngLat();
        const content = document.createElement("div");
        content.className = "p-3 flex flex-col gap-2 min-w-48";

        const confirmButton = document.createElement("button");
        confirmButton.className = "btn-secondary text-sm";
        confirmButton.textContent = "Verschieben";

        let confirmed = false;

        confirmButton.addEventListener("click", () => {
            const editableWaypoint =
                $formData.expand!.waypoints_via_trail?.[waypointIndex];
            if (!editableWaypoint) {
                marker.setLngLat([originalPosition.lon, originalPosition.lat]);
                closeWaypointActionPopup();
                return;
            }

            confirmed = true;
            editableWaypoint.lat = movedPosition.lat;
            editableWaypoint.lon = movedPosition.lng;
            editableWaypoint.name =
                editableWaypoint.name?.trim() ||
                getWaypointCoordinateName(movedPosition.lat, movedPosition.lng);
            $formData.expand!.waypoints_via_trail = [
                ...($formData.expand!.waypoints_via_trail ?? []),
            ];
            syncVisibleRouteAnchors();
            void recalculateAdjacentWaypointSegments(waypointIndex, {
                snapAffectedSegments: true,
            });
            closeWaypointActionPopup();
        });

        const cancelButton = document.createElement("button");
        cancelButton.className = "btn-secondary text-sm";
        cancelButton.textContent = get(_)("cancel");
        cancelButton.addEventListener("click", () => closeWaypointActionPopup());

        content.appendChild(confirmButton);
        content.appendChild(cancelButton);

        mapWaypointPopup = new M.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 20,
        })
            .setLngLat([movedPosition.lng, movedPosition.lat])
            .setDOMContent(content)
            .addTo(map);

        mapWaypointPopup.on("close", () => {
            if (!confirmed) {
                marker.setLngLat([originalPosition.lon, originalPosition.lat]);
            }
        });
    }

    function getWaypointCoordinateName(lat: number, lon: number): string {
        return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    }

    function saveWaypoint(savedWaypoint: Waypoint) {
        if (!canModifyTrail) {
            return;
        }
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
            savedWaypoint.connectionMode = getDefaultWaypointConnectionMode();
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
        if (!canModifyTrail) {
            return;
        }
        const editableWaypointIndex =
            $formData.expand!.waypoints_via_trail?.findIndex((w) => w.id == wpId) ?? -1;
        if (editableWaypointIndex < 0) {
            return;
        }
        const editableWaypoint =
            $formData.expand!.waypoints_via_trail![editableWaypointIndex];
        showWaypointMovePopup(marker, editableWaypointIndex, {
            lat: editableWaypoint.lat,
            lon: editableWaypoint.lon,
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

    function createPrefilledSummitLog() {
        const newSummitLog = new SummitLog(
            ($formData.date || new Date().toISOString().split("T")[0]).substring(0, 10),
            {
                distance: $formData.distance,
                elevation_gain: $formData.elevation_gain,
                elevation_loss: $formData.elevation_loss,
                duration: $formData.duration,
            },
        );
        newSummitLog.author = $currentUser?.actor;
        newSummitLog.trail = $formData.id;

        const gpxData = $formData.expand?.gpx_data;
        if (gpxData) {
            newSummitLog.expand ??= {};
            newSummitLog.expand.gpx_data = gpxData;
            newSummitLog._gpx = new File(
                [gpxData],
                `${$formData.name || "route"}.gpx`,
                { type: "text/xml" },
            );
        }

        return newSummitLog;
    }

    function beforeSummitLogModalOpen() {
        if (!canModifyTrail) {
            return;
        }
        summitLog.set(createPrefilledSummitLog());
        summitLogModal.openModal();
    }

    function saveSummitLog(log: SummitLog) {
        if (!canModifyTrail) {
            return;
        }
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
        if (!canModifyTrail) {
            return;
        }
        if (item.value === "edit") {
            summitLog.set(currentSummitLog);
            summitLogModal.openModal();
        } else if (item.value === "delete") {
            const updatedSummitLogs = [
                ...($formData.expand!.summit_logs_via_trail ?? []),
            ];
            updatedSummitLogs.splice(index, 1);
            $formData.expand!.summit_logs_via_trail = updatedSummitLogs;
        }
    }

    async function handleListSelection(list: List) {
        if (!canModifyTrail || !$formData.id) {
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
        if (!map || !canModifyTrail) {
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
        clearUndoRedoStack();
        resetWaypointHistoryTracking();

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
        if (!canModifyTrail) {
            return;
        }
        if (
            (
                e.originalEvent.target as HTMLElement
            ).tagName.toLowerCase() !== "canvas"
        ) {
            return;
        }
        showWaypointActionPopup(e.lngLat);
    }

    async function addWaypointFromTap(
        lat: number,
        lon: number,
        options?: {
            openEditor?: boolean;
            presetName?: string;
            insertIndex?: number | null;
        },
    ) {
        if (!canModifyTrail) {
            return;
        }
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
        insertedWaypoint.connectionMode = getDefaultWaypointConnectionMode();
        insertedWaypoint.id = cryptoRandomString({ length: 15 });

        const insertIndex =
            options?.insertIndex ??
            getWaypointInsertIndexByNearestSegment(
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
        syncVisibleRouteAnchors();

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
            await insertCalculatedRouteSegment(routeWaypoints);
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
        if (!canModifyTrail) {
            return;
        }
        showWaypointActionPopup(new M.LngLat(poi.lon, poi.lat), {
            insertIndex: null,
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
        if (!drawingActive || !canModifyTrail) {
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
            deleteCalculatedRouteSegment(anchorIndex);
            if ($formData.expand?.gpx_data) {
                updateTrailWithRouteData();
            }
        } else if (anchorIndex == valhallaStore.anchors.length) {
            deleteCalculatedRouteSegment(anchorIndex - 1);
            updateTrailWithRouteData();
        } else {
            deleteCalculatedRouteSegment(anchorIndex - 1);
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
                await editCalculatedRouteSegment(anchorIndex, nextRouteSegment);
            }
            if (previousRouteSegment) {
                await editCalculatedRouteSegment(
                    anchorIndex - 1,
                    previousRouteSegment,
                );
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
        if (draggingMarker || !canModifyTrail) {
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
        insertedWaypoint.connectionMode = getDefaultWaypointConnectionMode();

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

        try {
            const [previousRouteSegment, nextRouteSegment] = await Promise.all([
                calculateRouteSegmentForWaypointPair(waypoints, data.segment + 1),
                calculateRouteSegmentForWaypointPair(waypoints, data.segment + 2),
            ]);

            await editCalculatedRouteSegment(data.segment, previousRouteSegment);
            await insertCalculatedRouteSegment(
                nextRouteSegment,
                data.segment + 1,
            );
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

    function reverseWaypointOrder() {
        const waypoints = [...($formData.expand!.waypoints_via_trail ?? [])];
        if (waypoints.length < 2) {
            return;
        }

        const reversedWaypoints = [...waypoints].reverse();
        for (let i = 0; i < reversedWaypoints.length; i++) {
            reversedWaypoints[i].connectionMode =
                i === 0
                    ? undefined
                    : waypoints[waypoints.length - i].connectionMode ??
                      getDefaultWaypointConnectionMode();
        }

        $formData.expand!.waypoints_via_trail = reversedWaypoints;
        syncWaypointIconsWithRoutingRole();
    }

    async function handleSegmentClick(data: {
        segment: number;
        event: M.MapMouseEvent;
    }) {
        if (!canModifyTrail) {
            return;
        }
        showWaypointActionPopup(data.event.lngLat, {
            insertIndex: data.segment + 1,
        });
    }

    function reverseTrail() {
        if (!canModifyTrail) {
            return;
        }
        reverseWaypointOrder();
        reverseRoute();
        routeSacScaleSegments = [...routeSacScaleSegments].reverse();

        updateTrailWithRouteData();
    }

    async function recalculateElevationData() {
        if (!canModifyTrail) {
            return;
        }
        await recalculateHeight();

        updateTrailWithRouteData();
    }

    function updateTrailWithRouteData() {
        updateTotals(valhallaStore.route);

        if (!$formData.id) {
            $formData.id = cryptoRandomString({ length: 15 });
        }
        syncVisibleRouteAnchors();
        updateTrailOnMap();
    }

    function updateTotals(gpx: GPX) {
        const totals = gpx.features;
        const routeDifficulty = calculateRouteDifficultyAssessment(
            routeSacScaleSegments,
            $formData.difficulty,
        ).storedDifficulty;
        formData.set({
            ...$formData,
            distance: totals.distance,
            duration: totals.duration / 1000,
            elevation_gain: totals.elevationGain,
            elevation_loss: totals.elevationLoss,
            difficulty: routeDifficulty,
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
        if (!canModifyTrail) {
            return;
        }
        $formData.expand!.tags = items.map((i) =>
            i.value ? i.value : new Tag(i.text),
        );
    }

    async function searchTags(q: string) {
        const result = await tags_index(q);
        tagItems = result.items.map((t) => ({ text: t.name, value: t }));
    }

    function openPhotoBrowser() {
        if (!canModifyTrail) {
            return;
        }
        document.getElementById("waypoint-photo-input")!.click();
    }

    async function handleWaypointPhotoSelection() {
        if (!canModifyTrail) {
            return;
        }
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
        if (!canModifyTrail) {
            return;
        }
        const snapshot = waypointUndoStack.at(-1);
        const currentSnapshot = captureWaypointHistorySnapshot();
        suppressWaypointHistorySync = true;
        undo();
        if (snapshot) {
            waypointUndoStack = waypointUndoStack.slice(0, -1);
            waypointRedoStack = [
                ...waypointRedoStack,
                cloneWaypointHistorySnapshot(currentSnapshot),
            ];
            applyWaypointHistorySnapshot(snapshot);
            lastWaypointHistoryState = cloneWaypointHistorySnapshot(snapshot);
        } else {
            lastWaypointHistoryState = captureWaypointHistorySnapshot();
        }
        observedUndoDepth = valhallaStore.undoStack.length;
        observedRedoDepth = valhallaStore.redoStack.length;
        suppressWaypointHistorySync = false;
        syncVisibleRouteAnchors();
        updateTrailWithRouteData();
    }

    function redoRouteEdit() {
        if (!canModifyTrail) {
            return;
        }
        const snapshot = waypointRedoStack.at(-1);
        const currentSnapshot = captureWaypointHistorySnapshot();
        suppressWaypointHistorySync = true;
        redo();
        if (snapshot) {
            waypointRedoStack = waypointRedoStack.slice(0, -1);
            waypointUndoStack = [
                ...waypointUndoStack,
                cloneWaypointHistorySnapshot(currentSnapshot),
            ];
            applyWaypointHistorySnapshot(snapshot);
            lastWaypointHistoryState = cloneWaypointHistorySnapshot(snapshot);
        } else {
            lastWaypointHistoryState = captureWaypointHistorySnapshot();
        }
        observedUndoDepth = valhallaStore.undoStack.length;
        observedRedoDepth = valhallaStore.redoStack.length;
        suppressWaypointHistorySync = false;
        syncVisibleRouteAnchors();
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
        <div class="sticky top-0 z-20 -mx-8 border-b border-input-border bg-background/95 px-8 py-4 backdrop-blur">
            <div class="flex items-center justify-between gap-4">
                <div>
                    <p class="text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
                        {$_("map")} / {$_("edit")}
                    </p>
                    <p class="text-sm text-gray-500">
                        {#if mapInteractionMode}
                            {$_("edit")}
                        {:else}
                            <i class="fa fa-lock mr-2"></i>Ansicht gesperrt
                        {/if}
                    </p>
                </div>
                <div class="inline-flex items-center gap-1 rounded-full border border-input-border bg-input-background p-1">
                    <button
                        type="button"
                        class="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                        class:bg-primary={!mapInteractionMode}
                        class:text-white={!mapInteractionMode}
                        aria-label="Locked view"
                        title="Locked view"
                        onclick={() => (mapInteractionMode = false)}
                    >
                        <i class="fa fa-lock"></i>
                    </button>
                    <button
                        type="button"
                        class="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
                        class:bg-primary={mapInteractionMode}
                        class:text-white={mapInteractionMode}
                        aria-label={$_("edit")}
                        title={$_("edit")}
                        disabled={!trailCanBeEdited}
                        onclick={() => (mapInteractionMode = true)}
                    >
                        <i class="fa fa-pen"></i>
                    </button>
                </div>
            </div>
        </div>
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
            disabled={!canModifyTrail}
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
                    disabled={!canModifyTrail}
                />
                <span>{$_("snap-imported-route-to-valhalla")}</span>
            </label>
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
                disabled={!canModifyTrail}
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
                    disabled={!canModifyTrail}
                ></TextField>
                <TextField
                    bind:value={$formData.duration}
                    name="duration"
                    label={$_("est-duration")}
                    disabled={!canModifyTrail}
                ></TextField><TextField
                    bind:value={$formData.elevation_gain}
                    name="elevation_gain"
                    label={$_("elevation-gain")}
                    disabled={!canModifyTrail}
                ></TextField>
                <TextField
                    bind:value={$formData.elevation_loss}
                    name="elevation_loss"
                    label={$_("elevation-loss")}
                    disabled={!canModifyTrail}
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
        <TextField
            name="name"
            label={$_("name")}
            error={$errors.name}
            disabled={!canModifyTrail}
        ></TextField>
        <TextField
            name="location"
            label={$_("location")}
            error={$errors.location}
            disabled={!canModifyTrail}
        ></TextField>
        <Datepicker
            label={$_("date")}
            bind:value={$formData.date}
            disabled={!canModifyTrail}
        ></Datepicker>
        {#if canModifyTrail}
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
        {:else}
            <div>
                <p class="text-sm font-medium pb-1">{$_("describe-your-trail")}</p>
                <article
                    class="min-h-24 rounded-md border border-input-border bg-input-background p-3 text-sm prose dark:prose-invert"
                >
                    {@html $formData.description || ""}
                </article>
            </div>
            <div>
                <p class="text-sm font-medium pb-1">{$_("tags")}</p>
                <div class="flex min-h-12 flex-wrap gap-2 rounded-md border border-input-border bg-input-background p-3">
                    {#if ($formData.expand?.tags?.length ?? 0) > 0}
                        {#each $formData.expand?.tags ?? [] as tag}
                            <span class="rounded-full bg-secondary px-3 py-1 text-sm">
                                {tag.name}
                            </span>
                        {/each}
                    {:else}
                        <span class="text-sm text-gray-500">-</span>
                    {/if}
                </div>
            </div>
        {/if}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <p class="text-sm font-medium pb-1">{$_("difficulty")}</p>
                <div class="flex min-h-10 items-center">
                    <span
                        class="inline-flex min-h-8 items-center rounded-full bg-secondary px-3 py-1 text-sm font-semibold"
                    >
                        {computedRouteDifficulty.label}
                    </span>
                </div>
            </div>
            {#if routingOptions.modeOfTransport === "pedestrian" && routingOptions.pedestrianOptions}
                <Select
                    label={$_("max-hiking-difficulty")}
                    items={maxHikingDifficultyItems}
                    disabled={!canModifyTrail}
                    onchange={setMaxHikingDifficulty}
                    bind:value={routingOptions.pedestrianOptions
                        .max_hiking_difficulty}
                ></Select>
            {/if}
            <Select
                name="category"
                label={$_("category")}
                items={editableRouteCategories.map((c) => ({
                    text: $_(c.name),
                    value: c.id,
                }))}
                disabled={!canModifyTrail}
                bind:value={$formData.category}
                onchange={(value) => {
                    const categoryId = String(value);
                    setFields("category", categoryId);
                    applyRoutingForCategory(categoryId, true);
                }}
            ></Select>
            {#if routingOptions.modeOfTransport === "pedestrian" && routingOptions.pedestrianOptions}
                <Select
                    label={$_("walking-speed")}
                    items={walkingSpeedItems}
                    disabled={!canModifyTrail}
                    onchange={setWalkingSpeed}
                    bind:value={routingOptions.pedestrianOptions.walking_speed}
                ></Select>
                <div>
                    <Select
                        label={$_("use-hills")}
                        items={hillPreferenceItems}
                        disabled={!canModifyTrail}
                        onchange={setHillPreference}
                        bind:value={routingOptions.pedestrianOptions.use_hills}
                    ></Select>
                    <p class="mt-1 text-xs text-gray-500">
                        {$_("valhalla-use-hills-value", {
                            values: {
                                value:
                                    routingOptions.pedestrianOptions.use_hills,
                            },
                        })}
                    </p>
                </div>
                <p class="-mt-3 text-xs text-gray-500 md:col-span-1">
                    {getSelectedWalkingSpeedDescription()}
                </p>
                <p class="-mt-3 text-xs text-gray-500 md:col-span-1">
                    {getSelectedHillPreferenceDescription()}
                </p>
            {/if}
            {#if routingOptions.modeOfTransport === "bicycle" && routingOptions.bicycleOptions}
                <Select
                    label={$_("bike-profile")}
                    items={bicycleRouteProfileItems}
                    disabled={!canModifyTrail}
                    onchange={setBicycleRouteProfile}
                    bind:value={bicycleRouteProfile}
                ></Select>
                <p class="self-end text-xs text-gray-500">
                    {getSelectedBicycleRouteProfileDescription()}
                </p>
            {/if}
            {#if routingOptions.modeOfTransport === "pedestrian" || routingOptions.modeOfTransport === "bicycle"}
                <Button
                    secondary
                    type="button"
                    disabled={!canModifyTrail ||
                        ($formData.expand?.waypoints_via_trail?.length ?? 0) < 2}
                    onclick={rerouteCurrentTrail}
                    ><i class="fa fa-route mr-2"></i>{$_("reroute")}</Button
                >
            {/if}
        </div>

        <Toggle
            name="public"
            bind:value={$formData.public}
            label={$formData.public ? $_("public") : $_("private")}
            icon={$formData.public ? "globe" : "lock"}
            disabled={!canModifyTrail}
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
                            {#if canModifyTrail}
                                <select
                                    name={`waypoint-connection-mode-${waypoint.id ?? i}`}
                                    class="h-8 max-w-40 rounded-md bg-input-background px-2 text-xs outline outline-1 outline-input-border focus:outline-input-border-focus"
                                    value={waypoint.connectionMode ??
                                        getDefaultWaypointConnectionMode()}
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
                            {:else}
                                <span class="rounded-full bg-input-background px-3 py-1 text-xs font-medium capitalize">
                                    {waypoint.connectionMode ??
                                        getDefaultWaypointConnectionMode()}
                                </span>
                            {/if}
                        </div>
                    {/if}
                    <WaypointCard
                        {waypoint}
                        waypointNumber={i + 1}
                        canMoveUp={canModifyTrail && i > 0}
                        canMoveDown={canModifyTrail && i <
                            ($formData.expand?.waypoints_via_trail?.length ??
                                0) -
                                1}
                        onMoveUp={() => moveWaypoint(i, i - 1)}
                        onMoveDown={() => moveWaypoint(i, i + 1)}
                        canSetAsStart={canModifyTrail && isLoopRouteActive()}
                        routingRole={getRoutingRoleByIndex(
                            i,
                            $formData.expand?.waypoints_via_trail?.length ?? 0,
                        )}
                        mode={canModifyTrail ? "edit" : "show"}
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
                            {#if canModifyTrail}
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
                            {:else}
                                <span class="rounded-full bg-input-background px-3 py-1 text-xs font-medium">
                                    {loopConnectionMode}
                                </span>
                            {/if}
                        </div>
                    {/if}
                </li>
            {/each}
        </ul>
        {#if canModifyTrail}
            <button
                class="btn-secondary"
                type="button"
                onclick={reverseTrail}
                ><i class="fa fa-arrow-right-arrow-left mr-2"></i
                >{$_("reverse-direction")}</button
            >
        {/if}
        <button
            class="btn-secondary"
            type="button"
            disabled={!canModifyTrail}
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
        <div class:readonly-edit-block={!canModifyTrail}>
            <PhotoPicker
                id="trail"
                parent={$formData}
                bind:photos={$formData.photos}
                bind:thumbnail={$formData.thumbnail}
                bind:photoFiles
            ></PhotoPicker>
        </div>
        <hr class="border-separator" />
        <h3 class="text-xl font-semibold">{$_("summit-book")}</h3>
        <ul>
            {#each $formData.expand?.summit_logs_via_trail ?? [] as log, i}
                <li>
                    <SummitLogCard
                        {log}
                        mode={canModifyTrail &&
                        log.author == $currentUser?.actor
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
            disabled={!canModifyTrail}
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
                disabled={
                    !canModifyTrail ||
                    (page.params.id == "new" && !savedAtLeastOnce)
                }
                type="button"
                onclick={() => listSelectModal.openModal()}
                ><i class="fa fa-plus mr-2"></i>{$_("add-to-list")}</Button
            >
        {/if}
        <hr class="border-separator" />
        {#if trailCanBeEdited}
            <Button
                primary={true}
                large={true}
                type="submit"
                disabled={!canModifyTrail}
                extraClasses="mb-2"
                {loading}>{$_("save-trail")}</Button
            >
        {/if}
    </form>
    <div class="relative">
        {#if drawingActive && canModifyTrail}
            <div
                in:fly={{ easing: backInOut, x: -30 }}
                out:fly={{ easing: backInOut, x: -30 }}
                class="absolute top-8 left-2 z-50"
            >
                <RouteEditor
                    bind:options={routingOptions}
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
                drawing={canModifyTrail && drawingActive}
                crosshairCursor={canModifyTrail}
                showTerrain={true}
                autoGeolocateOnDrawing={page.params.id === "new"}
                onmarkerdragend={canModifyTrail ? moveMarker : undefined}
                activeTrail={0}
                pois={filteredRoutePlannerPois}
                poiAttributeDefinitions={data.poiAttributeDefinitions}
                onpoiclick={canModifyTrail ? addPoiAsRoutePoint : undefined}
                bind:map
                onclick={canModifyTrail
                    ? (target) => handleMapClick(target)
                    : undefined}
                onsegmentclick={canModifyTrail
                    ? (data) => handleSegmentClick(data)
                    : undefined}
                onsegmentdragend={canModifyTrail
                    ? (data) => handleSegmentDragEnd(data)
                    : undefined}
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

    .readonly-edit-block {
        opacity: 0.65;
        pointer-events: none;
    }

    @media only screen and (min-width: 768px) {
        #trail-map,
        form {
            height: calc(100vh - 124px);
        }
    }
</style>
