---
title: Federation
description: Technical documentation of federation in wanderer
---

wanderer is a federated trail-sharing platform built on ActivityPub. It enables users to publish trails, follow other explorers across instances, and interact with content such as comments, lists, and summit logs. All user-generated content in wanderer—whether it's a trail, a list, a comment, or a summit log—is modeled as a `Note` object in ActivityPub, adhering to a consistent structure for federation.

This technical documentation provides a detailed overview of how federation works in wanderer, including the types of objects exchanged, the structure of those objects, and how interactions such as mentions, likes, and follows are processed across instances.

Below, you’ll find examples of the different JSON representations used in federated communication. These illustrate how <span class="-tracking-[0.075em]">wanderer</span> encodes and interprets core actions and content as standardized `Note` objects.

## Context

```json
"@context":[
    "https://www.w3.org/ns/activitystreams"
]
```
The context is identical for all activities and objects.

## Actors
An actor represents a user of <span class="-tracking-[0.075em]">wanderer</span> in a federated context.

### Person

```json
{
    "id": "https://wanderer.example.org/api/v1/activitypub/user/demo",
    "type": "Person",
    "inbox": "https://wanderer.example.org/api/v1/activitypub/user/demo/inbox",
    "outbox": "https://wanderer.example.org/api/v1/activitypub/user/demo/outbox",
    "summary": "Born the day we installed the site.",
    "name": "demo",
    "preferredUsername": "demo",
    "followers": "https://wanderer.example.org/api/v1/activitypub/user/demo/followers",
    "following": "https://wanderer.example.org/api/v1/activitypub/user/demo/following",
    "url": "https://wanderer.example.org/profile/@demo",
    "published": "2025-05-05T15:07:59.943Z",
    "icon": {
        "type": "Image",
        "url": "https://wanderer.example.org/api/v1/files/users/example-user-id/example-profile.jpg"
    },
    "publicKey": {
        "id": "https://wanderer.example.org/api/v1/activitypub/user/demo#main-key",
        "owner": "https://wanderer.example.org/api/v1/activitypub/user/demo",
        "publicKeyPem": "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw0xyaRWP5X955bwSnUbr\nmwEF/2Fdmn5nlRRmEvej1BR0oBcPMVPYrrK4sz37mrAJ7Wbmg4KjmSDEROD4sApr\nM5FmKeU1OBsV2O3bL1DSW/8PXaf4JQRgl0AO+LiSAd7A/GO0viAzJXyJT4Rpaamf\n8Naclh7YR5E4JXrsjahPEWtUWcQ4g8Yhc6n2ptQ33ACI7Q1R3+U7q1tMaRCKAbdT\nbRahzqGs3iSxV+FjnsMR109KqDQJDMjwRB11USJTA4/nMpV6w8RS+171xNHl12Sg\nGpiuusmXMYYuoECdKDtLY7AsntusYMzXUjPzKfE+5EqPmIj5OTbg3A24p9hWIv5s\nmwIDAQAB\n-----END PUBLIC KEY-----\n"
    }
}
```

### Outbox

Paginated outbox of an actor.

```json
{
    "type": "OrderedCollectionPage",
    "first": "https://wanderer.example.org/api/v1/activitypub/user/demo/outbox?page=1",
    "next": "https://wanderer.example.org/api/v1/activitypub/user/demo/outbox?page=2",
    "partOf": "https://wanderer.example.org/api/v1/activitypub/user/demo/outbox",
    "totalItems": 23,
    "orderedItems": [
        {
            "id": "https://wanderer.example.org/api/v1/activitypub/activity/ecy96j9vpke00hr",
            "actor": "https://wanderer.example.org/api/v1/activitypub/user/demo",
            "type": "Create",
            "to": [
                "https://www.w3.org/ns/activitystreams#Public"
            ],
            "cc": [
                "https://federated.example.org/users/example/inbox",
                "https://wanderer.example.org/api/v1/activitypub/user/demo/inbox"
            ],
            "published": "2025-01-01 19:41:53.504Z",
            "object": {
                "id": "https://wanderer.example.org/api/v1/comment/example-comment-id",
                "type": "Note",
                "content": "<p><a href=\"/profile/@example@federated.example.org\" class=\"mention\" rel=\"nofollow\">@example@federated.example.org</a> </p><p>Wow! What a beautiful trail!</p>",
                "attributedTo": "https://wanderer.example.org/api/v1/activitypub/user/demo",
                "inReplyTo": "https://wanderer.example.org/api/v1/trail/example-trail-id",
                "tag": [
                    {
                        "id": "https://federated.example.org/users/example",
                        "type": "Mention",
                        "name": "@example@federated.example.org",
                        "href": "https://federated.example.org/users/example"
                    }
                ],
                "published": "2025-01-01T19:41:53Z"
            }
        }
    ]
}
```

### Followers

Paginated collection of followers of an actor.

```json
{
    "type": "OrderedCollectionPage",
    "first": "https://wanderer.example.org/api/v1/activitypub/user/demo/followers?page=1",
    "partOf": "https://wanderer.example.org/api/v1/activitypub/user/demo/followers",
    "totalItems": 3,
    "orderedItems": [
        "https://federated.example.org/users/example",
        "https://trails.magdeburg.jetzt/api/v1/activitypub/user/momar",
        "https://darmstadt.social/users/stormii"
    ]
}
```

### Following

Paginated collection of actors being followed by an actor.

```json
{
    "type": "OrderedCollectionPage",
    "first": "https://wanderer.example.org/api/v1/activitypub/user/demo/following?page=1",
    "partOf": "https://wanderer.example.org/api/v1/activitypub/user/demo/following",
    "totalItems": 3,
    "orderedItems": [
        "https://federated.example.org/users/example",
        "https://federated.example.org/users/example",
        "https://other.example.org/api/v1/activitypub/user/example"
    ]
}
```

## Objects

### Trail

Represents a trail with various metadata like description, photos, elevation data etc. 

:::note
Waypoints, comments and summit logs are not part of a federated trail object. They are instead fetched on demand from the source instance when requesting a trail.
:::

```json
{
    "id": "https://wanderer.example.org/api/v1/trail/example-trail-id",
    "type": "Note",
    "name": "Example trail",
    "content": "<h1>Example trail</h1><p><a href=\"/profile/@example@federated.example.org\" class=\"mention\" rel=\"nofollow\">@example@federated.example.org</a> </p><p><a href=\"https://wanderer.example.org/trail/view/@example/trail-id\">https://wanderer.example.org/trail/view/@example/trail-id</a></p>",
    "attachment": [
        {
            "type": "Image",
            "mediaType": "image/jpeg",
            "url": "https://wanderer.example.org/api/v1/files/trails/example-trail-id/example-route-preview.webp"
        },
        {
            "type": "Document",
            "mediaType": "application/xml+gpx",
            "url": "https://wanderer.example.org/api/v1/files/trails/example-trail-id/example-trail_5ts04zgsuk.gpx"
        }
    ],
    "attributedTo": "https://wanderer.example.org/api/v1/activitypub/user/demo",
    "location": {
        "type": "Place",
        "name": "Murnau am Staffelsee, Bayern, Deutschland",
        "latitude": 47.678592,
        "longitude": 11.196068
    },
    "tag": [
        {
            "type": "Note",
            "name": "category",
            "content": "Biking"
        },
        {
            "type": "Note",
            "name": "difficulty",
            "content": "easy"
        },
        {
            "type": "Note",
            "name": "elevation_gain",
            "content": "8902.000000m"
        },
        {
            "type": "Note",
            "name": "elevation_loss",
            "content": "8906.000000m"
        },
        {
            "type": "Note",
            "name": "distance",
            "content": "202403.824936m"
        },
        {
            "type": "Note",
            "name": "duration",
            "content": "4037.183333m"
        },
        {
            "id": "https://federated.example.org/users/example",
            "type": "Mention",
            "name": "@example@federated.example.org",
            "href": "https://federated.example.org/users/example"
        },
        {
            "type": "Note",
            "name": "tag",
            "content": "My awesome tag"
        }
    ],
    "url": "https://wanderer.example.org/trail/view/@example/trail-id",
    "published": "2025-06-17T21:40:02Z",
    "startTime": "2025-06-14T00:00:00Z"
}
```

### Summit log

Represents a summit log that is attached to a trail. The trail is referenced in the "InReplyTo" field. It contains very similar metadata to a trail object.

```json
{
  "id": "https://wanderer.example.org/api/v1/summit-log/example-summit-log-id",
  "type": "Note",
  "content": "<p>Hello World! This is a summit log!</p><p><a href=\"/profile/@example@federated.example.org\" class=\"mention\" rel=\"nofollow\">@example@federated.example.org</a> </p>",
  "attachment": [
    {
      "type": "Image",
      "mediaType": "image/jpeg",
      "url": "https://wanderer.example.org/api/v1/files/summit_logs/example-summit-log-id/example-trail_loncv4fixp.jpg"
    },
    {
      "type": "Document",
      "mediaType": "application/xml+gpx",
      "url": "https://wanderer.example.org/api/v1/files/summit_logs/example-summit-log-id/example-trail_8mw5gysia0.gpx"
    }
  ],
  "attributedTo": "https://wanderer.example.org/api/v1/activitypub/user/demo",
  "inReplyTo": "https://wanderer.example.org/api/v1/trail/example-trail-id",
  "tag": [
    {
      "type": "Note",
      "name": "elevation_gain",
      "content": "6343.200000m"
    },
    {
      "type": "Note",
      "name": "elevation_loss",
      "content": "6347.400000m"
    },
    {
      "type": "Note",
      "name": "distance",
      "content": "202403.824936m"
    },
    {
      "type": "Note",
      "name": "duration",
      "content": "242231.000000m"
    },
    {
      "id": "https://federated.example.org/users/example",
      "type": "Mention",
      "name": "@example@federated.example.org",
      "href": "https://federated.example.org/users/example"
    }
  ],
  "url": "https://wanderer.example.org/trail/view/@example/trail-id",
  "published": "2025-01-01T19:38:19Z",
  "startTime": "2025-01-01T00:00:00Z"
}
```

### Comment

A comment attached to a trail. The trail is referenced in the "InReplyTo" field. Contains only text.

```json
{
  "id": "https://wanderer.example.org/api/v1/comment/example-comment-id",
  "type": "Note",
  "content": "<p><a href=\"/profile/@example@federated.example.org\" class=\"mention\" rel=\"nofollow\">@example@federated.example.org</a> </p><p>Wow! What a beautiful trail!</p>",
  "attributedTo": "https://wanderer.example.org/api/v1/activitypub/user/demo",
  "inReplyTo": "https://wanderer.example.org/api/v1/trail/example-trail-id",
  "tag": [
    {
      "id": "https://federated.example.org/users/example",
      "type": "Mention",
      "name": "@example@federated.example.org",
      "href": "https://federated.example.org/users/example"
    }
  ],
  "published": "2025-01-01T19:41:53Z"
}
```

### List

A collection of trails.

```json
{
  "id": "https://wanderer.example.org/api/v1/list/example-list-id",
  "type": "Note",
  "name": "My Awesome List",
  "content": "<p>With my awesome description.</p><p><a href=\"https://wanderer.example.org/lists/@demo/example-list-id\">https://wanderer.example.org/lists/@demo/example-list-id</a></p>",
  "attachment": [
    {
      "type": "Image",
      "mediaType": "image/jpeg",
      "url": "https://wanderer.example.org/api/v1/files/lists/example-list-id/example-trail_m1ubtj7rwk.jpg"
    }
  ],
  "attributedTo": "https://wanderer.example.org/api/v1/activitypub/user/demo",
  "url": "https://wanderer.example.org/lists/@demo/example-list-id",
  "published": "2025-05-18T22:03:19Z"
}
```

## Activities

### Create or Update trail

Issued whenever a trail is created or updated. Broadcasted to all followers and all mentions. Editing a previously created trail will broadcast an identical activity, except the `type` being `Update`. The `object` is a [Trail](#trail).

```json
{
    "id": "https://wanderer.example.org/api/v1/activitypub/activity/wqt6poxjevq9oax",
    "actor": "https://wanderer.example.org/api/v1/activitypub/user/demo",
    "type": "Create",
    "to": [
        "https://www.w3.org/ns/activitystreams#Public"
    ],
    "cc": [
        "https://wanderer.example.org/api/v1/activitypub/user/demo/followers",
        "https://federated.example.org/users/example/inbox"
    ],
    "published": "2025-01-01 14:56:38.800Z",
    "object": {}
}
```

### Create or Update summit log

Issued whenever a summit log is created or updated. Broadcasted to the trail author, the author's followers and all mentions. Editing a previously created summit log will broadcast an identical activity, except the `type` being `Update`. The `object` is a [Summit Log](#summit-log).

```json
{
    "id": "https://wanderer.example.org/api/v1/activitypub/activity/i31uc0lki3crxwm",
    "actor": "https://wanderer.example.org/api/v1/activitypub/user/demo",
    "to": "https://www.w3.org/ns/activitystreams#Public",
    "type": "Create",
    "cc": [
        "https://wanderer.example.org/api/v1/activitypub/user/demo/followers",
        "https://federated.example.org/users/example/inbox"
    ],
    "published": "2025-01-01 19:38:19.978Z",
    "object": {}
}
```

### Create or Update comment

Issued whenever a comment is created or updated. Broadcasted to the trail's author and all mentions. Editing a previously created comment will broadcast an identical activity, except the `type` being `Update`. The `object` is a [Comment](#comment).

```json
{
    "id": "https://wanderer.example.org/api/v1/activitypub/activity/ecy96j9vpke00hr",
    "actor": "https://wanderer.example.org/api/v1/activitypub/user/demo",
    "type": "Create",
    "to": [
        "https://www.w3.org/ns/activitystreams#Public"
    ],
    "cc": [
        "https://federated.example.org/users/example/inbox",
        "https://wanderer.example.org/api/v1/activitypub/user/demo/inbox"
    ],
    "published": "2025-01-01 19:41:53.504Z",
    "object": {}
}
```


### Create or Update list

Issued whenever a list is created or updated. Broadcasted to all followers. Editing a previously created list will broadcast an identical activity, except the `type` being `Update`. The `object` is a [List](#list).

```json
{
    "id": "https://wanderer.example.org/api/v1/activitypub/activity/zq30he84ng9of67",
    "actor": "https://wanderer.example.org/api/v1/activitypub/user/demo",
    "type": "Create",
    "to": [
        "https://www.w3.org/ns/activitystreams#Public"
    ],
    "cc": [
        "https://wanderer.example.org/api/v1/activitypub/user/demo/followers",
    ],
    "published": "2025-01-01 19:51:37.079Z",
    "object": {}
}
```

### Follow user

Each actor in <span class="-tracking-[0.075em]">wanderer</span> can be followed. The actor being followed will immediately send back an `Accept` activity. Future public trails and lists published by the actor being followed will be broadcasted to the following actors inbox.

```json
{
    "id": "https://wanderer.example.org/api/v1/activitypub/activity/ika3t06qjyvlx72",
    "actor": "https://wanderer.example.org/api/v1/activitypub/user/demo",
    "type": "Follow",
    "to": null,
    "cc": null,
    "published": "2025-01-01 07:23:56.517Z",
    "object": "https://federated.example.org/users/example"
}
```

### Accept follow

Automatically send by an actor as a response upon receiving a `Follow` activity.

```json
{
    "id": "https://wanderer.example.org/api/v1/activitypub/activity/9jpjjvvi79ayp9d",
    "actor": "https://wanderer.example.org/api/v1/activitypub/user/demo",
    "type": "Accept",
    "to": null,
    "cc": null,
    "published": "2025-06-17 19:48:29.417Z",
    "object": {
        "id": "https://federated.example.org/example-follow-activity-id",
        "type": "Follow",
        "actor": "https://federated.example.org/users/example",
        "object": "https://wanderer.example.org/api/v1/activitypub/user/demo"
    }
}
```

### Undo follow

An unfollow is represented by an `Undo` activity with the original follow as its `object`.

```json
{
    "id": "https://wanderer.example.org/api/v1/activitypub/activity/n3n7ka5msa3il84",
    "actor": "https://wanderer.example.org/api/v1/activitypub/user/demo",
    "type": "Undo",
    "to": null,
    "cc": null,
    "published": "2025-01-01 20:14:37.107Z",
    "object": {
        "id": "https://wanderer.example.org/api/v1/activitypub/activity/ika3t06qjyvlx72",
        "type": "Follow",
        "actor": "https://wanderer.example.org/api/v1/activitypub/user/demo",
        "object": "https://federated.example.org/users/example"
    }
}
```

### Like trail

A like for a trail.

```json
{
    "id": "https://wanderer.example.org/api/v1/activitypub/activity/jjlcgm0il3jy2y7",
    "actor": "https://wanderer.example.org/api/v1/activitypub/user/demo",
    "type": "Like",
    "to": null,
    "cc": null,
    "published": "2025-06-18 18:48:55.300Z",
    "object": "https://wanderer.example.org/api/v1/trail/23fd1747a29c3af"
}
```

### Undo like trail

Removing a like from a previously liked trail. 

```json
{
    "id": "https://wanderer.example.org/api/v1/activitypub/activity/jjlcgm0il3jy2y7",
    "actor": "https://wanderer.example.org/api/v1/activitypub/user/demo",
    "type": "Undo",
    "to": null,
    "cc": null,
    "published": "2025-06-18 18:48:55.300Z",
    "object": "https://wanderer.example.org/api/v1/trail/23fd1747a29c3af"
}
```