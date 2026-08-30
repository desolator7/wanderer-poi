package hooks

import (
	"fmt"
	"reflect"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const poiPrivateAttributesField = "private_attributes"

var poiSystemAttributeKeys = map[string]struct{}{
	"data_license":  {},
	"data_source":   {},
	"osm_element":   {},
	"osm_relation":  {},
	"osm_timestamp": {},
	"osm_version":   {},
}

type poiAttributeDefinition struct {
	valueType         string
	valueStorage      string
	publicWriteAccess string
}

type poiAttributeViolation struct {
	forbidden bool
	message   string
}

// EnrichPoiPrivateAttributes prevents private per-user values from leaking in
// builtin record responses and realtime messages.
func EnrichPoiPrivateAttributes(e *core.RecordEnrichEvent) error {
	auth := e.RequestInfo.Auth
	userID := ""
	isSuperuser := false
	if auth != nil {
		userID = auth.Id
		isSuperuser = auth.IsSuperuser()
	}

	privateAttributes := readPrivateAttributes(e.Record)
	filtered, hide := privateAttributesForViewer(privateAttributes, userID, isSuperuser)
	if hide {
		e.Record.Hide(poiPrivateAttributesField)
		return e.Next()
	}

	e.Record.Set(poiPrivateAttributesField, filtered)

	return e.Next()
}

// CreatePoiAttributes validates configured values and moves private attribute
// values into a server-assigned user bucket. Direct writes to the raw
// private_attributes field are ignored for regular users.
func CreatePoiAttributes(e *core.RecordRequestEvent) error {
	if err := preparePoiAttributes(e, nil); err != nil {
		return err
	}

	return e.Next()
}

// UpdatePoiAttributes preserves all existing user buckets and enforces the
// configured write access for every builtin PocketBase record request.
func UpdatePoiAttributes(e *core.RecordRequestEvent) error {
	if err := preparePoiAttributes(e, e.Record.Original()); err != nil {
		return err
	}

	return e.Next()
}

func preparePoiAttributes(
	e *core.RecordRequestEvent,
	originalRecord *core.Record,
) error {
	auth := e.Auth
	originalPrivateAttributes := readPrivateAttributes(originalRecord)
	if auth == nil {
		e.Record.Set(poiPrivateAttributesField, cloneAttributeBuckets(originalPrivateAttributes))
		return e.UnauthorizedError("Für POI-Änderungen ist eine Anmeldung erforderlich.", nil)
	}

	categoryID := e.Record.GetString("category")
	if categoryID == "" {
		return e.BadRequestError("Eine POI-Kategorie ist erforderlich.", nil)
	}

	definitions, err := findPoiAttributeDefinitions(e.App, categoryID)
	if err != nil {
		return e.InternalServerError("Die POI-Attributdefinitionen konnten nicht geladen werden.", err)
	}

	attributes, err := readPoiAttributes(e.Record)
	if err != nil {
		return e.BadRequestError("Die POI-Attribute sind ungültig.", err)
	}
	originalAttributes, err := readPoiAttributes(originalRecord)
	if err != nil {
		return e.InternalServerError("Die gespeicherten POI-Attribute sind ungültig.", err)
	}

	if violation := validatePoiAttributeTypes(attributes, definitions); violation != nil {
		return e.BadRequestError(violation.message, nil)
	}

	categoryChanged := originalRecord != nil && originalRecord.GetString("category") != categoryID
	if !auth.IsSuperuser() {
		if violation := authorizePoiAttributeWrite(
			attributes,
			originalAttributes,
			definitions,
			categoryChanged,
		); violation != nil {
			if violation.forbidden {
				return e.ForbiddenError(violation.message, nil)
			}

			return e.BadRequestError(violation.message, nil)
		}
	}

	privateAttributes := cloneAttributeBuckets(originalPrivateAttributes)
	if auth.IsSuperuser() {
		privateAttributes = readPrivateAttributes(e.Record)
	}

	userValues, _ := privateAttributes[auth.Id].(map[string]any)
	userValues = cloneValues(userValues)
	for key, definition := range definitions {
		if definition.valueStorage != "private" {
			continue
		}

		value, exists := attributes[key]
		if !exists {
			continue
		}

		userValues[key] = value
		delete(attributes, key)
	}

	if len(userValues) > 0 {
		privateAttributes[auth.Id] = userValues
	}

	e.Record.Set("attributes", attributes)
	e.Record.Set(poiPrivateAttributesField, privateAttributes)

	return nil
}

func findPoiAttributeDefinitions(
	app core.App,
	categoryID string,
) (map[string]poiAttributeDefinition, error) {
	records, err := app.FindRecordsByFilter(
		"poi_attributes",
		"category = {:category}",
		"",
		-1,
		0,
		dbx.Params{"category": categoryID},
	)
	if err != nil {
		return nil, err
	}

	definitions := make(map[string]poiAttributeDefinition, len(records))
	for _, record := range records {
		key := record.GetString("key")
		definition := poiAttributeDefinition{
			valueType:         record.GetString("type"),
			valueStorage:      record.GetString("value_storage"),
			publicWriteAccess: record.GetString("public_write_access"),
		}

		if key == "" {
			return nil, fmt.Errorf("poi attribute definition has an empty key")
		}
		if _, exists := definitions[key]; exists {
			return nil, fmt.Errorf("duplicate poi attribute definition %q", key)
		}
		if definition.valueType != "string" &&
			definition.valueType != "boolean" &&
			definition.valueType != "date" {
			return nil, fmt.Errorf("unsupported type %q for POI attribute %q", definition.valueType, key)
		}
		if definition.valueStorage != "public" && definition.valueStorage != "private" {
			return nil, fmt.Errorf("unsupported storage %q for POI attribute %q", definition.valueStorage, key)
		}
		if definition.publicWriteAccess != "all" && definition.publicWriteAccess != "admin" {
			return nil, fmt.Errorf(
				"unsupported write access %q for POI attribute %q",
				definition.publicWriteAccess,
				key,
			)
		}

		definitions[key] = definition
	}

	return definitions, nil
}

func validatePoiAttributeTypes(
	attributes map[string]any,
	definitions map[string]poiAttributeDefinition,
) *poiAttributeViolation {
	for key, value := range attributes {
		definition, exists := definitions[key]
		if !exists || value == nil {
			continue
		}

		valid := false
		switch definition.valueType {
		case "string":
			_, valid = value.(string)
		case "boolean":
			_, valid = value.(bool)
		case "date":
			date, ok := value.(string)
			if ok {
				_, parseErr := time.Parse("2006-01-02", date)
				valid = parseErr == nil
			}
		}

		if !valid {
			return &poiAttributeViolation{
				message: fmt.Sprintf("Das POI-Attribut %q hat einen ungültigen Wert.", key),
			}
		}
	}

	return nil
}

func authorizePoiAttributeWrite(
	attributes map[string]any,
	originalAttributes map[string]any,
	definitions map[string]poiAttributeDefinition,
	categoryChanged bool,
) *poiAttributeViolation {
	for key, definition := range definitions {
		if definition.valueStorage != "public" || definition.publicWriteAccess != "admin" {
			continue
		}

		_, exists := attributes[key]
		if categoryChanged && exists {
			return &poiAttributeViolation{
				forbidden: true,
				message:   fmt.Sprintf("Das POI-Attribut %q darf nur durch Administratoren gesetzt werden.", key),
			}
		}
		if !categoryChanged && poiAttributeChanged(attributes, originalAttributes, key) {
			return &poiAttributeViolation{
				forbidden: true,
				message:   fmt.Sprintf("Das POI-Attribut %q darf nur durch Administratoren geändert werden.", key),
			}
		}
	}

	for key := range attributes {
		if _, exists := definitions[key]; exists {
			continue
		}

		if _, isSystemAttribute := poiSystemAttributeKeys[key]; isSystemAttribute {
			if poiAttributeChanged(attributes, originalAttributes, key) {
				return &poiAttributeViolation{
					forbidden: true,
					message:   fmt.Sprintf("Das systemverwaltete POI-Attribut %q darf nicht geändert werden.", key),
				}
			}
			continue
		}

		if categoryChanged || poiAttributeChanged(attributes, originalAttributes, key) {
			return &poiAttributeViolation{
				message: fmt.Sprintf("Das POI-Attribut %q ist für diese Kategorie nicht definiert.", key),
			}
		}
	}

	return nil
}

func poiAttributeChanged(attributes map[string]any, originalAttributes map[string]any, key string) bool {
	value, exists := attributes[key]
	originalValue, originallyExists := originalAttributes[key]

	return exists != originallyExists || !reflect.DeepEqual(value, originalValue)
}

func readPoiAttributes(record *core.Record) (map[string]any, error) {
	result := map[string]any{}
	if record == nil {
		return result, nil
	}

	if err := record.UnmarshalJSONField("attributes", &result); err != nil {
		return nil, err
	}
	if result == nil {
		result = map[string]any{}
	}

	return result, nil
}

func readPrivateAttributes(record *core.Record) map[string]any {
	result := map[string]any{}
	if record == nil {
		return result
	}

	if err := record.UnmarshalJSONField(poiPrivateAttributesField, &result); err != nil {
		return map[string]any{}
	}

	return result
}

func privateAttributesForViewer(
	privateAttributes map[string]any,
	userID string,
	isSuperuser bool,
) (map[string]any, bool) {
	if userID == "" {
		return nil, true
	}
	if isSuperuser {
		return cloneAttributeBuckets(privateAttributes), false
	}

	filtered := map[string]any{}
	if ownValues, exists := privateAttributes[userID]; exists {
		filtered[userID] = ownValues
	}

	return filtered, false
}

func cloneAttributeBuckets(source map[string]any) map[string]any {
	result := make(map[string]any, len(source))
	for userID, values := range source {
		if valueMap, ok := values.(map[string]any); ok {
			result[userID] = cloneValues(valueMap)
			continue
		}
		result[userID] = values
	}
	return result
}

func cloneValues(source map[string]any) map[string]any {
	result := make(map[string]any, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}
