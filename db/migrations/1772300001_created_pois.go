package migrations

import (
	"encoding/json"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collections := []string{
			`{
				"id": "p0icat420260001",
				"listRule": null,
				"viewRule": null,
				"createRule": "@request.auth.id != \"\"",
				"updateRule": "@request.auth.id != \"\" && author = @request.auth.id",
				"deleteRule": "@request.auth.id != \"\" && author = @request.auth.id",
				"name": "poi_categories",
				"type": "base",
				"fields": [
					{
						"autogeneratePattern": "[a-z0-9]{15}",
						"hidden": false,
						"id": "text3208210256",
						"max": 15,
						"min": 15,
						"name": "id",
						"pattern": "^[a-z0-9]+$",
						"presentable": false,
						"primaryKey": true,
						"required": true,
						"system": true,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "p0icat_name001",
						"max": 0,
						"min": 1,
						"name": "name",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": true,
						"system": false,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "p0icat_desc001",
						"max": 0,
						"min": 0,
						"name": "description",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": false,
						"system": false,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "p0icat_icon001",
						"max": 0,
						"min": 0,
						"name": "icon",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": false,
						"system": false,
						"type": "text"
					},
					{
						"cascadeDelete": true,
						"collectionId": "_pb_users_auth_",
						"hidden": false,
						"id": "p0icat_auth001",
						"maxSelect": 1,
						"minSelect": 0,
						"name": "author",
						"presentable": false,
						"required": true,
						"system": false,
						"type": "relation"
					},
					{
						"hidden": false,
						"id": "autodate2990389176",
						"name": "created",
						"onCreate": true,
						"onUpdate": false,
						"presentable": false,
						"system": false,
						"type": "autodate"
					},
					{
						"hidden": false,
						"id": "autodate3332085495",
						"name": "updated",
						"onCreate": true,
						"onUpdate": true,
						"presentable": false,
						"system": false,
						"type": "autodate"
					}
				],
				"indexes": [],
				"system": false
			}`,
			`{
				"id": "p0iatr420260011",
				"listRule": null,
				"viewRule": null,
				"createRule": "@request.auth.id != \"\"",
				"updateRule": "@request.auth.id != \"\" && author = @request.auth.id",
				"deleteRule": "@request.auth.id != \"\" && author = @request.auth.id",
				"name": "poi_attributes",
				"type": "base",
				"fields": [
					{
						"autogeneratePattern": "[a-z0-9]{15}",
						"hidden": false,
						"id": "text3208210256",
						"max": 15,
						"min": 15,
						"name": "id",
						"pattern": "^[a-z0-9]+$",
						"presentable": false,
						"primaryKey": true,
						"required": true,
						"system": true,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "p0iatr_name001",
						"max": 0,
						"min": 1,
						"name": "name",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": true,
						"system": false,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "p0iatr_key0001",
						"max": 0,
						"min": 1,
						"name": "key",
						"pattern": "^[a-z0-9_]+$",
						"presentable": false,
						"primaryKey": false,
						"required": true,
						"system": false,
						"type": "text"
					},
					{
						"hidden": false,
						"id": "p0iatr_type001",
						"maxSelect": 1,
						"name": "type",
						"presentable": false,
						"required": true,
						"system": false,
						"type": "select",
						"values": ["string", "boolean", "date"]
					},
					{
						"hidden": false,
						"id": "p0iatr_req0001",
						"name": "required",
						"presentable": false,
						"required": false,
						"system": false,
						"type": "bool"
					},
					{
						"cascadeDelete": true,
						"collectionId": "p0icat420260001",
						"hidden": false,
						"id": "p0iatr_cat0001",
						"maxSelect": 1,
						"minSelect": 0,
						"name": "category",
						"presentable": false,
						"required": true,
						"system": false,
						"type": "relation"
					},
					{
						"cascadeDelete": true,
						"collectionId": "_pb_users_auth_",
						"hidden": false,
						"id": "p0iatr_auth001",
						"maxSelect": 1,
						"minSelect": 0,
						"name": "author",
						"presentable": false,
						"required": true,
						"system": false,
						"type": "relation"
					},
					{
						"hidden": false,
						"id": "autodate2990389176",
						"name": "created",
						"onCreate": true,
						"onUpdate": false,
						"presentable": false,
						"system": false,
						"type": "autodate"
					},
					{
						"hidden": false,
						"id": "autodate3332085495",
						"name": "updated",
						"onCreate": true,
						"onUpdate": true,
						"presentable": false,
						"system": false,
						"type": "autodate"
					}
				],
				"indexes": [
					"CREATE UNIQUE INDEX idx_poi_attribute_key_category ON poi_attributes (key, category)"
				],
				"system": false
			}`,
			`{
				"id": "p0ipoi420260011",
				"listRule": "public = true || author = @request.auth.id",
				"viewRule": "public = true || author = @request.auth.id",
				"createRule": "@request.auth.id != \"\"",
				"updateRule": "@request.auth.id != \"\" && author = @request.auth.id",
				"deleteRule": "@request.auth.id != \"\" && author = @request.auth.id",
				"name": "pois",
				"type": "base",
				"fields": [
					{
						"autogeneratePattern": "[a-z0-9]{15}",
						"hidden": false,
						"id": "text3208210256",
						"max": 15,
						"min": 15,
						"name": "id",
						"pattern": "^[a-z0-9]+$",
						"presentable": false,
						"primaryKey": true,
						"required": true,
						"system": true,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "p0ipoi_name001",
						"max": 0,
						"min": 1,
						"name": "name",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": true,
						"system": false,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "p0ipoi_desc001",
						"max": 0,
						"min": 0,
						"name": "description",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": false,
						"system": false,
						"type": "text"
					},
					{
						"autogeneratePattern": "",
						"hidden": false,
						"id": "p0ipoi_loc0001",
						"max": 0,
						"min": 0,
						"name": "location",
						"pattern": "",
						"presentable": false,
						"primaryKey": false,
						"required": false,
						"system": false,
						"type": "text"
					},
					{
						"hidden": false,
						"id": "p0ipoi_lat0001",
						"max": 90,
						"min": -90,
						"name": "lat",
						"onlyInt": false,
						"presentable": false,
						"required": true,
						"system": false,
						"type": "number"
					},
					{
						"hidden": false,
						"id": "p0ipoi_lon0001",
						"max": 180,
						"min": -180,
						"name": "lon",
						"onlyInt": false,
						"presentable": false,
						"required": true,
						"system": false,
						"type": "number"
					},
					{
						"hidden": false,
						"id": "p0ipoi_pub0001",
						"name": "public",
						"presentable": false,
						"required": false,
						"system": false,
						"type": "bool"
					},
					{
						"cascadeDelete": false,
						"collectionId": "p0icat420260001",
						"hidden": false,
						"id": "p0ipoi_cat0001",
						"maxSelect": 1,
						"minSelect": 0,
						"name": "category",
						"presentable": false,
						"required": true,
						"system": false,
						"type": "relation"
					},
					{
						"hidden": false,
						"id": "p0ipoi_att0001",
						"maxSize": 2000000,
						"name": "attributes",
						"presentable": false,
						"required": false,
						"system": false,
						"type": "json"
					},
					{
						"cascadeDelete": true,
						"collectionId": "_pb_users_auth_",
						"hidden": false,
						"id": "p0ipoi_auth001",
						"maxSelect": 1,
						"minSelect": 0,
						"name": "author",
						"presentable": false,
						"required": true,
						"system": false,
						"type": "relation"
					},
					{
						"hidden": false,
						"id": "autodate2990389176",
						"name": "created",
						"onCreate": true,
						"onUpdate": false,
						"presentable": false,
						"system": false,
						"type": "autodate"
					},
					{
						"hidden": false,
						"id": "autodate3332085495",
						"name": "updated",
						"onCreate": true,
						"onUpdate": true,
						"presentable": false,
						"system": false,
						"type": "autodate"
					}
				],
				"indexes": [],
				"system": false
			}`,
		}

		for _, jsonData := range collections {
			collection := &core.Collection{}
			if err := json.Unmarshal([]byte(jsonData), &collection); err != nil {
				return err
			}
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		return nil
	}, func(app core.App) error {
		for _, collectionId := range []string{"p0ipoi420260011", "p0iatr420260011", "p0icat420260001"} {
			collection, err := app.FindCollectionByNameOrId(collectionId)
			if err != nil {
				return err
			}
			if err := app.Delete(collection); err != nil {
				return err
			}
		}

		return nil
	})
}
