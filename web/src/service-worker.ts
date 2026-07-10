/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const CACHE_NAME = `wanderer-cache-${version}`;
const ASSETS = [...build, ...files];
const ASSET_PATHS = new Set(
	ASSETS.map((asset) => new URL(asset, self.location.origin).pathname)
);

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
	);

	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(
				keys
					.filter((key) => key !== CACHE_NAME)
					.map((key) => caches.delete(key))
			)
		)
	);

	self.clients.claim();
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') {
		return;
	}

	const requestUrl = new URL(event.request.url);
	if (
		requestUrl.origin !== self.location.origin ||
		!ASSET_PATHS.has(requestUrl.pathname)
	) {
		return;
	}

	event.respondWith(
		caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
			if (cachedResponse) {
				return cachedResponse;
			}

			return fetch(event.request).then((response) => {
				if (response.ok) {
					const responseClone = response.clone();
					void caches
						.open(CACHE_NAME)
						.then((cache) => cache.put(event.request, responseClone));
				}

				return response;
			});
		})
	);
});
