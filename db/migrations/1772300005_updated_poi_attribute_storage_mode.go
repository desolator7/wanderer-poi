package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		updates := map[string]string{
			"poi_attributes": `{
				"fields": [
					{
						"hidden": false,
						"id": "p0iatr_valst01",
						"maxSelect": 1,
						"name": "value_storage",
						"presentable": false,
						"required": true,
						"system": false,
						"type": "select",
						"values": ["public", "private"]
					},
					{
						"hidden": false,
						"id": "p0iatr_pubwr01",
						"maxSelect": 1,
						"name": "public_write_access",
						"presentable": false,
						"required": true,
						"system": false,
						"type": "select",
						"values": ["all", "admin"]
					}
				]
			}`,
			"pois": `{
				"fields": [
					{
						"hidden": false,
						"id": "p0ipoi_patt001",
						"maxSize": 2000000,
						"name": "private_attributes",
						"presentable": false,
						"required": false,
						"system": false,
						"type": "json"
					}
				]
			}`,
		}

		for name, jsonData := range updates {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
				return err
			}
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		poiAttributes, err := app.FindRecordsByFilter("poi_attributes", "", "", 0, 0)
		if err != nil {
			return err
		}
		for _, rec := range poiAttributes {
			rec.Set("value_storage", "public")
			rec.Set("public_write_access", "all")
			if err := app.Save(rec); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		updates := map[string]string{
			"poi_attributes": `{
				"fields": [
					{
						"id": "p0iatr_valst01",
						"name": "value_storage",
						"type": "select",
						"system": false,
						"hidden": false,
						"presentable": false,
						"required": false,
						"maxSelect": 1,
						"values": []
					},
					{
						"id": "p0iatr_pubwr01",
						"name": "public_write_access",
						"type": "select",
						"system": false,
						"hidden": false,
						"presentable": false,
						"required": false,
						"maxSelect": 1,
						"values": []
					}
				]
			}`,
			"pois": `{
				"fields": [
					{
						"id": "p0ipoi_patt001",
						"name": "private_attributes",
						"type": "json",
						"system": false,
						"hidden": false,
						"presentable": false,
						"required": false,
						"maxSize": 1
					}
				]
			}`,
		}
		for name, jsonData := range updates {
			collection, err := app.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
				return err
			}
			if err := app.Save(collection); err != nil {
				return err
			}
		}
		return nil
	})
}
