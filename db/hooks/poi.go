package hooks

import (
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const poiPrivateAttributesField = "private_attributes"

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

// CreatePoiPrivateAttributes moves private attribute values from the normal
// attributes input into a server-assigned user bucket. Direct writes to the raw
// private_attributes field are ignored for regular users.
func CreatePoiPrivateAttributes(e *core.RecordRequestEvent) error {
	if err := preparePoiPrivateAttributes(e, nil); err != nil {
		return err
	}

	return e.Next()
}

// UpdatePoiPrivateAttributes preserves all existing user buckets and permits a
// regular user to change only their own values through the attributes input.
func UpdatePoiPrivateAttributes(e *core.RecordRequestEvent) error {
	original := readPrivateAttributes(e.Record.Original())
	if err := preparePoiPrivateAttributes(e, original); err != nil {
		return err
	}

	return e.Next()
}

func preparePoiPrivateAttributes(
	e *core.RecordRequestEvent,
	original map[string]any,
) error {
	auth := e.Auth
	if auth == nil {
		e.Record.Set(poiPrivateAttributesField, cloneAttributeBuckets(original))
		return nil
	}

	privateKeys, err := findPrivatePoiAttributeKeys(e.App, e.Record.GetString("category"))
	if err != nil {
		return err
	}

	attributes := map[string]any{}
	if err := e.Record.UnmarshalJSONField("attributes", &attributes); err != nil {
		return err
	}
	if attributes == nil {
		attributes = map[string]any{}
	}

	privateAttributes := cloneAttributeBuckets(original)
	if auth.IsSuperuser() {
		privateAttributes = readPrivateAttributes(e.Record)
	}

	userValues, _ := privateAttributes[auth.Id].(map[string]any)
	userValues = cloneValues(userValues)
	for key := range privateKeys {
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

func findPrivatePoiAttributeKeys(app core.App, categoryID string) (map[string]struct{}, error) {
	records, err := app.FindRecordsByFilter(
		"poi_attributes",
		"category = {:category} && value_storage = 'private'",
		"",
		-1,
		0,
		dbx.Params{"category": categoryID},
	)
	if err != nil {
		return nil, err
	}

	keys := make(map[string]struct{}, len(records))
	for _, record := range records {
		keys[record.GetString("key")] = struct{}{}
	}

	return keys, nil
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
