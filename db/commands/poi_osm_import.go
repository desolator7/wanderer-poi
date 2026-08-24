package commands

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/spf13/cobra"
)

const (
	osmStampRelation       = 148007
	osmStampPointCount     = 223
	osmStampNumberCount    = 222
	osmStampWinterSeason   = "winter"
	osmStampRegularSeason  = "spring;summer;autumn"
	osmStampCategoryName   = "Stempelstellen"
	osmStampCategoryDetail = "Stempelstellen auf Basis eines bereinigten OpenStreetMap-Snapshots (© OpenStreetMap-Mitwirkende, ODbL 1.0)."
	osmStampQuery           = `[out:json][timeout:120]; rel(148007)->.network; node(r.network)["tourism"="checkpoint"]["checkpoint"~"(^|;)hiking($|;)"]["checkpoint:type"="stamp"]; out meta;`
)

var poiNumberPattern = regexp.MustCompile(`(?i)^(?:HWN\s*)?(\d{3})(?:\s|\b|–|-)`)

type osmStampManifest struct {
	Metadata osmStampMetadata `json:"metadata"`
	Points   []osmStampPoint  `json:"points"`
}

type osmStampMetadata struct {
	Query            string          `json:"query"`
	Relation         int             `json:"relation"`
	RetrievedAt      string          `json:"retrievedAt"`
	OSMBaseTimestamp string          `json:"osmBaseTimestamp"`
	Transformation   string          `json:"transformation"`
	ODbL             osmStampLicense `json:"odbl"`
	EntriesSHA256    string          `json:"entriesSha256"`
}

type osmStampLicense struct {
	License     string `json:"license"`
	Attribution string `json:"attribution"`
	URL         string `json:"url"`
}

type osmStampPoint struct {
	Number      string              `json:"number"`
	Name        string              `json:"name"`
	Coordinates osmStampCoordinates `json:"coordinates"`
	Season      *string             `json:"season"`
	OSM         osmStampElement     `json:"osm"`
}

type osmStampCoordinates struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type osmStampElement struct {
	Type      string `json:"type"`
	ID        int64  `json:"id"`
	Version   int    `json:"version"`
	Timestamp string `json:"timestamp"`
}

type existingStampPoi struct {
	ID                string
	Name              string
	Description       string
	Location          string
	Latitude          float64
	Longitude         float64
	Public            bool
	Category          string
	Author            string
	Icon              string
	Color             string
	Attributes        map[string]any
	PrivateAttributes map[string]any
}

type desiredStampPoi struct {
	Name        string
	Description string
	Location    string
	Latitude    float64
	Longitude   float64
	Attributes  map[string]any
}

type stampPoiUpdate struct {
	ID      string
	Desired desiredStampPoi
}

type stampPoiInsert struct {
	Template existingStampPoi
	Desired  desiredStampPoi
}

type osmStampImportPlan struct {
	CategoryNeedsUpdate bool
	Updates             []stampPoiUpdate
	Insert              *stampPoiInsert
}

// PoiOSMImport updates the existing stamp category from a validated, sanitized
// OSM snapshot. It is intentionally dry-run by default.
func PoiOSMImport(app *pocketbase.PocketBase) *cobra.Command {
	var manifestPath string
	var categoryID string
	var apply bool

	cmd := &cobra.Command{
		Use:   "poi-osm-import",
		Short: "Plan or apply the one-time OSM stamp point import",
		RunE: func(cmd *cobra.Command, args []string) error {
			manifest, err := loadOSMStampManifest(manifestPath)
			if err != nil {
				return err
			}

			plan, err := buildOSMStampImportPlan(app, manifest, categoryID)
			if err != nil {
				return err
			}
			printOSMStampImportPlan(cmd, plan, !apply)

			if !apply || !plan.hasChanges() {
				return nil
			}

			return app.RunInTransaction(func(txApp core.App) error {
				transactionPlan, err := buildOSMStampImportPlan(txApp, manifest, categoryID)
				if err != nil {
					return err
				}

				if err := applyOSMStampImportPlan(txApp, transactionPlan, categoryID); err != nil {
					return err
				}

				return nil
			})
		},
	}

	cmd.Flags().StringVar(&manifestPath, "manifest", "", "Path to the sanitized OSM snapshot")
	cmd.Flags().StringVar(&categoryID, "category-id", "", "Existing stamp POI category ID")
	cmd.Flags().BoolVar(&apply, "apply", false, "Apply the planned changes transactionally")
	_ = cmd.MarkFlagRequired("manifest")
	_ = cmd.MarkFlagRequired("category-id")

	return cmd
}

func loadOSMStampManifest(path string) (*osmStampManifest, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}

	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	manifest := &osmStampManifest{}
	if err := decoder.Decode(manifest); err != nil {
		return nil, fmt.Errorf("decode manifest: %w", err)
	}

	if err := validateOSMStampManifest(manifest); err != nil {
		return nil, fmt.Errorf("validate manifest: %w", err)
	}

	return manifest, nil
}

func validateOSMStampManifest(manifest *osmStampManifest) error {
	if manifest.Metadata.Relation != osmStampRelation {
		return fmt.Errorf("relation must be %d", osmStampRelation)
	}
	if normalizeNewlines(manifest.Metadata.Query) != osmStampQuery {
		return errors.New("query does not match the approved relation-only Overpass query")
	}
	if _, err := time.Parse(time.RFC3339, manifest.Metadata.RetrievedAt); err != nil {
		return fmt.Errorf("invalid retrievedAt: %w", err)
	}
	baseTimestamp, err := time.Parse(time.RFC3339, manifest.Metadata.OSMBaseTimestamp)
	if err != nil {
		return fmt.Errorf("invalid osmBaseTimestamp: %w", err)
	}
	if strings.TrimSpace(manifest.Metadata.Transformation) == "" {
		return errors.New("transformation metadata is required")
	}
	if manifest.Metadata.ODbL.License != "Open Data Commons Open Database License (ODbL) v1.0" ||
		manifest.Metadata.ODbL.Attribution != "© OpenStreetMap contributors" ||
		manifest.Metadata.ODbL.URL != "https://www.openstreetmap.org/copyright" {
		return errors.New("ODbL metadata is incomplete or unexpected")
	}
	if len(manifest.Points) != osmStampPointCount {
		return fmt.Errorf("expected %d points, got %d", osmStampPointCount, len(manifest.Points))
	}

	encodedPoints, err := json.Marshal(manifest.Points)
	if err != nil {
		return fmt.Errorf("encode points for checksum: %w", err)
	}
	checksum := sha256.Sum256(append(encodedPoints, '\n'))
	if hex.EncodeToString(checksum[:]) != manifest.Metadata.EntriesSHA256 {
		return errors.New("entriesSha256 does not match the points array")
	}

	numberCounts := map[string]int{}
	seasons069 := map[string]int{}
	var newestTimestamp time.Time
	for index, point := range manifest.Points {
		expectedNumber := fmt.Sprintf("%03d", indexToExpectedNumber(index, manifest.Points))
		if point.Number < "001" || point.Number > "222" {
			return fmt.Errorf("invalid point number %q", point.Number)
		}
		if point.Number != expectedNumber {
			return errors.New("points are not deterministically sorted")
		}
		if !strings.HasPrefix(point.Name, point.Number+" – ") || strings.Contains(strings.ToUpper(point.Name), "HWN") {
			return fmt.Errorf("point %s has an invalid neutral name", point.Number)
		}
		if math.IsNaN(point.Coordinates.Latitude) || math.IsInf(point.Coordinates.Latitude, 0) ||
			point.Coordinates.Latitude < -90 || point.Coordinates.Latitude > 90 ||
			math.IsNaN(point.Coordinates.Longitude) || math.IsInf(point.Coordinates.Longitude, 0) ||
			point.Coordinates.Longitude < -180 || point.Coordinates.Longitude > 180 {
			return fmt.Errorf("point %s has invalid coordinates", point.Number)
		}
		if point.OSM.Type != "node" || point.OSM.ID <= 0 || point.OSM.Version <= 0 {
			return fmt.Errorf("point %s has invalid OSM element metadata", point.Number)
		}
		timestamp, err := time.Parse(time.RFC3339, point.OSM.Timestamp)
		if err != nil {
			return fmt.Errorf("point %s has invalid OSM timestamp: %w", point.Number, err)
		}
		if timestamp.After(newestTimestamp) {
			newestTimestamp = timestamp
		}

		numberCounts[point.Number]++
		season := ""
		if point.Season != nil {
			season = *point.Season
		}
		if point.Number == "069" {
			seasons069[season]++
		} else if point.Season != nil {
			return fmt.Errorf("only point 069 may have a season, got %s", point.Number)
		}
	}

	if len(numberCounts) != osmStampNumberCount {
		return fmt.Errorf("expected %d distinct point numbers, got %d", osmStampNumberCount, len(numberCounts))
	}
	for number := 1; number <= osmStampNumberCount; number++ {
		key := fmt.Sprintf("%03d", number)
		expected := 1
		if key == "069" {
			expected = 2
		}
		if numberCounts[key] != expected {
			return fmt.Errorf("point %s must occur %d time(s)", key, expected)
		}
	}
	if seasons069[osmStampRegularSeason] != 1 || seasons069[osmStampWinterSeason] != 1 || len(seasons069) != 2 {
		return errors.New("point 069 must contain exactly the regular and winter seasons")
	}
	if baseTimestamp.Before(newestTimestamp) {
		return errors.New("osmBaseTimestamp predates a point timestamp")
	}

	return nil
}

func indexToExpectedNumber(index int, points []osmStampPoint) int {
	// Number 069 occupies two adjacent positions and shifts all later indexes.
	if index <= 68 {
		return index + 1
	}
	if index == 69 {
		return 69
	}
	return index
}

func normalizeNewlines(value string) string {
	return strings.TrimSuffix(strings.ReplaceAll(value, "\r\n", "\n"), "\n")
}

func buildOSMStampImportPlan(
	app core.App,
	manifest *osmStampManifest,
	categoryID string,
) (*osmStampImportPlan, error) {
	category, err := app.FindRecordById("poi_categories", categoryID)
	if err != nil {
		return nil, fmt.Errorf("find POI category %q: %w", categoryID, err)
	}

	records, err := app.FindRecordsByFilter(
		"pois",
		"category = {:category}",
		"name,id",
		-1,
		0,
		dbx.Params{"category": categoryID},
	)
	if err != nil {
		return nil, fmt.Errorf("find existing stamp POIs: %w", err)
	}
	if len(records) != osmStampNumberCount && len(records) != osmStampPointCount {
		return nil, fmt.Errorf("expected 222 existing POIs or 223 already imported POIs, got %d", len(records))
	}

	existing := make([]existingStampPoi, 0, len(records))
	for _, record := range records {
		state, err := existingStampPoiFromRecord(record)
		if err != nil {
			return nil, err
		}
		existing = append(existing, state)
	}

	plan, err := planOSMStampImport(manifest, existing)
	if err != nil {
		return nil, err
	}
	plan.CategoryNeedsUpdate = category.GetString("name") != osmStampCategoryName ||
		category.GetString("description") != osmStampCategoryDetail

	return plan, nil
}

func planOSMStampImport(
	manifest *osmStampManifest,
	existing []existingStampPoi,
) (*osmStampImportPlan, error) {
	pointsByNumber := map[string][]osmStampPoint{}
	for _, point := range manifest.Points {
		pointsByNumber[point.Number] = append(pointsByNumber[point.Number], point)
	}

	existingByNumber := map[string][]existingStampPoi{}
	for _, poi := range existing {
		number, err := extractPoiNumber(poi.Name)
		if err != nil {
			return nil, fmt.Errorf("POI %s: %w", poi.ID, err)
		}
		existingByNumber[number] = append(existingByNumber[number], poi)
	}
	if len(existingByNumber) != osmStampNumberCount {
		return nil, fmt.Errorf("expected %d distinct existing POI numbers, got %d", osmStampNumberCount, len(existingByNumber))
	}

	plan := &osmStampImportPlan{}
	for number := 1; number <= osmStampNumberCount; number++ {
		key := fmt.Sprintf("%03d", number)
		points := pointsByNumber[key]
		pois := existingByNumber[key]

		if key != "069" {
			if len(points) != 1 || len(pois) != 1 {
				return nil, fmt.Errorf("point %s must map to exactly one existing POI", key)
			}
			appendUpdateIfNeeded(plan, pois[0], desiredFromPoint(pois[0], points[0]))
			continue
		}

		if len(points) != 2 || (len(pois) != 1 && len(pois) != 2) {
			return nil, errors.New("point 069 must map to one existing POI or two already imported POIs")
		}
		regularPoint, winterPoint := seasonal069Points(points)
		regularPoi, winterPoi, err := seasonal069Pois(pois, regularPoint, winterPoint)
		if err != nil {
			return nil, err
		}
		appendUpdateIfNeeded(plan, regularPoi, desiredFromPoint(regularPoi, regularPoint))
		if winterPoi != nil {
			appendUpdateIfNeeded(plan, *winterPoi, desiredFromPoint(*winterPoi, winterPoint))
		} else {
			plan.Insert = &stampPoiInsert{
				Template: regularPoi,
				Desired:  desiredFromPoint(regularPoi, winterPoint),
			}
		}
	}

	sort.Slice(plan.Updates, func(i, j int) bool {
		return plan.Updates[i].Desired.Name < plan.Updates[j].Desired.Name
	})
	return plan, nil
}

func extractPoiNumber(name string) (string, error) {
	matches := poiNumberPattern.FindStringSubmatch(strings.TrimSpace(name))
	if len(matches) != 2 {
		return "", fmt.Errorf("name %q does not start with a three-digit number", name)
	}
	return matches[1], nil
}

func seasonal069Points(points []osmStampPoint) (osmStampPoint, osmStampPoint) {
	var regular osmStampPoint
	var winter osmStampPoint
	for _, point := range points {
		if point.Season != nil && *point.Season == osmStampWinterSeason {
			winter = point
		} else {
			regular = point
		}
	}
	return regular, winter
}

func seasonal069Pois(
	pois []existingStampPoi,
	regularPoint osmStampPoint,
	winterPoint osmStampPoint,
) (existingStampPoi, *existingStampPoi, error) {
	if len(pois) == 1 {
		provenance, _ := pois[0].Attributes["osm_element"].(string)
		winterElement := fmt.Sprintf("node/%d", winterPoint.OSM.ID)
		if provenance == winterElement {
			return existingStampPoi{}, nil, errors.New("only the winter POI 069 exists; refusing to infer a regular-season record")
		}
		return pois[0], nil, nil
	}

	regularElement := fmt.Sprintf("node/%d", regularPoint.OSM.ID)
	winterElement := fmt.Sprintf("node/%d", winterPoint.OSM.ID)
	var regular *existingStampPoi
	var winter *existingStampPoi
	for index := range pois {
		element, _ := pois[index].Attributes["osm_element"].(string)
		switch element {
		case regularElement:
			regular = &pois[index]
		case winterElement:
			winter = &pois[index]
		}
	}
	if regular == nil || winter == nil {
		return existingStampPoi{}, nil, errors.New("two POIs 069 exist but their OSM provenance is ambiguous")
	}
	return *regular, winter, nil
}

func desiredFromPoint(template existingStampPoi, point osmStampPoint) desiredStampPoi {
	description := "Stempelstelle"
	if point.Number == "069" && point.Season != nil {
		if *point.Season == osmStampWinterSeason {
			description = "Stempelstelle (Winter)"
		} else {
			description = "Stempelstelle (Frühling, Sommer und Herbst)"
		}
	}

	attributes := cloneAnyMap(template.Attributes)
	attributes["data_source"] = "OpenStreetMap"
	attributes["osm_element"] = fmt.Sprintf("node/%d", point.OSM.ID)
	attributes["osm_version"] = float64(point.OSM.Version)
	attributes["osm_timestamp"] = point.OSM.Timestamp
	attributes["osm_relation"] = float64(osmStampRelation)
	attributes["data_license"] = "ODbL 1.0"

	return desiredStampPoi{
		Name:        point.Name,
		Description: description,
		Location:    "",
		Latitude:    point.Coordinates.Latitude,
		Longitude:   point.Coordinates.Longitude,
		Attributes:  attributes,
	}
}

func appendUpdateIfNeeded(plan *osmStampImportPlan, existing existingStampPoi, desired desiredStampPoi) {
	if existing.Name == desired.Name &&
		existing.Description == desired.Description &&
		existing.Location == desired.Location &&
		existing.Latitude == desired.Latitude &&
		existing.Longitude == desired.Longitude &&
		reflect.DeepEqual(existing.Attributes, desired.Attributes) {
		return
	}

	plan.Updates = append(plan.Updates, stampPoiUpdate{ID: existing.ID, Desired: desired})
}

func existingStampPoiFromRecord(record *core.Record) (existingStampPoi, error) {
	attributes := map[string]any{}
	if err := record.UnmarshalJSONField("attributes", &attributes); err != nil {
		return existingStampPoi{}, fmt.Errorf("POI %s attributes: %w", record.Id, err)
	}
	privateAttributes := map[string]any{}
	if err := record.UnmarshalJSONField("private_attributes", &privateAttributes); err != nil {
		return existingStampPoi{}, fmt.Errorf("POI %s private attributes: %w", record.Id, err)
	}

	return existingStampPoi{
		ID:                record.Id,
		Name:              record.GetString("name"),
		Description:       record.GetString("description"),
		Location:          record.GetString("location"),
		Latitude:          record.GetFloat("lat"),
		Longitude:         record.GetFloat("lon"),
		Public:            record.GetBool("public"),
		Category:          record.GetString("category"),
		Author:            record.GetString("author"),
		Icon:              record.GetString("icon"),
		Color:             record.GetString("color"),
		Attributes:        attributes,
		PrivateAttributes: privateAttributes,
	}, nil
}

func applyOSMStampImportPlan(app core.App, plan *osmStampImportPlan, categoryID string) error {
	if plan.CategoryNeedsUpdate {
		category, err := app.FindRecordById("poi_categories", categoryID)
		if err != nil {
			return err
		}
		category.Set("name", osmStampCategoryName)
		category.Set("description", osmStampCategoryDetail)
		if err := app.Save(category); err != nil {
			return fmt.Errorf("update POI category: %w", err)
		}
	}

	for _, update := range plan.Updates {
		record, err := app.FindRecordById("pois", update.ID)
		if err != nil {
			return fmt.Errorf("reload POI %s: %w", update.ID, err)
		}
		setDesiredStampFields(record, update.Desired)
		if err := app.Save(record); err != nil {
			return fmt.Errorf("update POI %s: %w", update.ID, err)
		}
	}

	if plan.Insert != nil {
		collection, err := app.FindCollectionByNameOrId("pois")
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Set("public", plan.Insert.Template.Public)
		record.Set("category", plan.Insert.Template.Category)
		record.Set("author", plan.Insert.Template.Author)
		record.Set("icon", plan.Insert.Template.Icon)
		record.Set("color", plan.Insert.Template.Color)
		record.Set("private_attributes", cloneAnyMap(plan.Insert.Template.PrivateAttributes))
		setDesiredStampFields(record, plan.Insert.Desired)
		if err := app.Save(record); err != nil {
			return fmt.Errorf("insert winter POI 069: %w", err)
		}
	}

	return nil
}

func setDesiredStampFields(record *core.Record, desired desiredStampPoi) {
	record.Set("name", desired.Name)
	record.Set("description", desired.Description)
	record.Set("location", desired.Location)
	record.Set("lat", desired.Latitude)
	record.Set("lon", desired.Longitude)
	record.Set("attributes", desired.Attributes)
}

func cloneAnyMap(source map[string]any) map[string]any {
	result := make(map[string]any, len(source))
	for key, value := range source {
		if nested, ok := value.(map[string]any); ok {
			result[key] = cloneAnyMap(nested)
			continue
		}
		result[key] = value
	}
	return result
}

func (plan *osmStampImportPlan) hasChanges() bool {
	return plan.CategoryNeedsUpdate || len(plan.Updates) > 0 || plan.Insert != nil
}

func printOSMStampImportPlan(cmd *cobra.Command, plan *osmStampImportPlan, dryRun bool) {
	mode := "APPLY"
	if dryRun {
		mode = "DRY RUN"
	}
	categoryUpdates := 0
	if plan.CategoryNeedsUpdate {
		categoryUpdates = 1
	}
	inserts := 0
	if plan.Insert != nil {
		inserts = 1
	}
	fmt.Fprintf(
		cmd.OutOrStdout(),
		"[%s] Category updates: %d; POI updates: %d; POI inserts: %d\n",
		mode,
		categoryUpdates,
		len(plan.Updates),
		inserts,
	)
}
