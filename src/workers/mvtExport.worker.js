// mvtExport.worker.js
/* eslint-disable no-restricted-globals */
import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';
import tileCover from '@mapbox/tile-cover';
import * as turf from '@turf/turf';
import tokml from 'tokml';

self.onmessage = async (e) => {
    const { aoi, token, zoom = 12 } = e.data;
    try {
        const tiles = tileCover.tiles(aoi.geometry, { min_zoom: zoom, max_zoom: zoom });
        const features = [];
        let done = 0;

        for (const [x, y, z] of tiles) {
            const url = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${z}/${x}/${y}.mvt?access_token=${token}`;
            const ab = await (await fetch(url)).arrayBuffer();
            const vt = new VectorTile(new Pbf(ab));
            const layer = vt.layers['waterway'];
            if (!layer) { self.postMessage({ type: 'progress', done: ++done, total: tiles.length }); continue; }

            for (let i = 0; i < layer.length; i++) {
                const f = layer.feature(i);
                const gj = f.toGeoJSON(x, y, z);
                if (!gj || (gj.geometry.type !== 'LineString' && gj.geometry.type !== 'MultiLineString')) continue;
                if (!turf.booleanIntersects(gj, aoi)) continue;

                // recorte por AOI (gera segmentos “dentro”)
                let segs = [gj];
                const inter = turf.lineIntersect(gj, aoi);
                if (inter.features.length) segs = turf.lineSplit(gj, aoi).features;

                for (const seg of segs) {
                    const len = turf.length(seg);
                    if (len <= 0) continue;
                    // midpoint robusto
                    const p1 = turf.along(seg, Math.min(0.05, len));
                    const p2 = turf.along(seg, Math.max(len - 0.05, 0));
                    const mid = turf.midpoint(p1, p2);
                    if (turf.booleanPointInPolygon(mid, aoi)) features.push(seg);
                }
            }

            done++;
            if (done % 5 === 0) self.postMessage({ type: 'progress', done, total: tiles.length });
        }

        // juntar/simplificar
        let fc = turf.featureCollection(features);
        fc = turf.simplify(fc, { tolerance: 0.00002, highQuality: false }); // ~2m

        const kml = tokml(fc, { name: 'name', documentName: 'Rios - recorte', documentDescription: 'Export client-side' });
        self.postMessage({ type: 'done', kml });
    } catch (err) {
        self.postMessage({ type: 'error', message: err.message || String(err) });
    }
};
