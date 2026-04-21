package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		attributeCollection, err := app.FindCollectionByNameOrId("poi_attributes")
		if err != nil {
			return err
		}

		if err := attributeCollection.Fields.AddMarshaledJSONAt(6, []byte(`{
			"hidden": false,
			"id": "p0iatr_valst01",
			"maxSelect": 1,
			"name": "value_storage",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "select",
			"values": ["public", "private"]
		}`)); err != nil {
			return err
		}

		if err := attributeCollection.Fields.AddMarshaledJSONAt(7, []byte(`{
			"hidden": false,
			"id": "p0iatr_pubwr01",
			"maxSelect": 1,
			"name": "public_write_access",
			"presentable": false,
			"required": true,
			"system": false,
			"type": "select",
			"values": ["all", "admin"]
		}`)); err != nil {
			return err
		}

		if err := app.Save(attributeCollection); err != nil {
			return err
		}

		poiCollection, err := app.FindCollectionByNameOrId("pois")
		if err != nil {
			return err
		}

		if err := poiCollection.Fields.AddMarshaledJSONAt(10, []byte(`{
			"hidden": false,
			"id": "p0ipoi_patt001",
			"maxSize": 2000000,
			"name": "private_attributes",
			"presentable": false,
			"required": false,
			"system": false,
			"type": "json"
		}`)); err != nil {
			return err
		}

		if err := app.Save(poiCollection); err != nil {
			return err
		}

		poiAttributes, err := app.FindRecordsByFilter("poi_attributes", "", "", -1, 0)
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
		attributeCollection, err := app.FindCollectionByNameOrId("poi_attributes")
		if err != nil {
			return err
		}

		attributeCollection.Fields.RemoveById("p0iatr_valst01")
		attributeCollection.Fields.RemoveById("p0iatr_pubwr01")

		if err := app.Save(attributeCollection); err != nil {
			return err
		}

		poiCollection, err := app.FindCollectionByNameOrId("pois")
		if err != nil {
			return err
		}

		poiCollection.Fields.RemoveById("p0ipoi_patt001")

		return app.Save(poiCollection)
	})
}
