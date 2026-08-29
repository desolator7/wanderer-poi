/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const CACHE_NAME = `wanderer-cache-${version}`;
const LIVE_PATH = '/live';
const LIVE_DATA_PATH = '/live/__data.json';
const VERSION_PATH = '/_app/version.json';
const OFFLINE_RUNTIME_PATHS = new Set([
	LIVE_PATH,
	LIVE_DATA_PATH,
	VERSION_PATH
]);
const ASSETS = [...build, ...files];
const ASSET_PATHS = new Set(
	ASSETS.map((asset) => new URL(asset, self.location.origin).pathname)
);

self.addEventListener('install', (event) => {
	event.waitUntil((async () => {
		const cache = await caches.open(CACHE_NAME);
		await cache.addAll(ASSETS);

		await Promise.all(
			[...OFFLINE_RUNTIME_PATHS].map(async (path) => {
				try {
					const response = await fetch(path, {
						credentials: 'same-origin',
						headers: {
							accept: path.endsWith('.json')
								? 'application/json'
								: 'text/html'
						}
					});
					if (
						response.ok &&
						new URL(response.url).pathname === path
					) {
						await cache.put(path, response);
					}
				} catch {
					// The live resources are warmed again when live mode starts.
				}
			})
		);
	})());

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
		requestUrl.origin === self.location.origin &&
		OFFLINE_RUNTIME_PATHS.has(requestUrl.pathname)
	) {
		event.respondWith((async () => {
			const cache = await caches.open(CACHE_NAME);
			const cachedResponse = await cache.match(requestUrl.pathname);
			if (cachedResponse) {
				return cachedResponse;
			}

			const response = await fetch(event.request);
			if (
				response.ok &&
				new URL(response.url).pathname === requestUrl.pathname
			) {
				await cache.put(requestUrl.pathname, response.clone());
			}
			return response;
		})());
		return;
	}

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
