package hooks

import (
	"fmt"
	"reflect"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const poiPrivateAttributesField = "private_attributes"

type poiAttributeRules struct {
	privateKeys map[string]struct{}
	adminKeys   map[string]struct{}
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

// CreatePoiAttributes enforces configured write rules and moves private attribute
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

	rules, err := findPoiAttributeRules(e.App, categoryID)
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

	categoryChanged := originalRecord != nil && originalRecord.GetString("category") != categoryID
	if !auth.IsSuperuser() {
		for key := range rules.adminKeys {
			if categoryChanged {
				delete(attributes, key)
				continue
			}
			if poiAttributeChanged(attributes, originalAttributes, key) {
				return e.ForbiddenError(
					fmt.Sprintf("Das POI-Attribut %q darf nur durch Administratoren geändert werden.", key),
					nil,
				)
			}
		}
	}

	privateAttributes := cloneAttributeBuckets(originalPrivateAttributes)
	if auth.IsSuperuser() {
		privateAttributes = readPrivateAttributes(e.Record)
	}

	userValues, _ := privateAttributes[auth.Id].(map[string]any)
	userValues = cloneValues(userValues)
	for key := range rules.privateKeys {
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

func findPoiAttributeRules(
	app core.App,
	categoryID string,
) (poiAttributeRules, error) {
	records, err := app.FindRecordsByFilter(
		"poi_attributes",
		"category = {:category}",
		"",
		-1,
		0,
		dbx.Params{"category": categoryID},
	)
	if err != nil {
		return poiAttributeRules{}, err
	}

	rules := poiAttributeRules{
		privateKeys: make(map[string]struct{}),
		adminKeys:   make(map[string]struct{}),
	}
	for _, record := range records {
		key := record.GetString("key")
		if record.GetString("value_storage") == "private" {
			rules.privateKeys[key] = struct{}{}
		} else if record.GetString("public_write_access") == "admin" {
			rules.adminKeys[key] = struct{}{}
		}
	}

	return rules, nil
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
