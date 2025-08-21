import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import * as toGeoJSON from '@tmcw/togeojson';
import tokml from 'tokml';
import ControlsPanel from './ControlsPanel';
import * as turf from '@turf/turf';

import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';

// mapboxgl.accessToken = 'pk.eyJ1IjoiZmxhdmlvYm9yZ2VzbnVuZXMiLCJhIjoiY21iN3hwajR2MGdnYTJqcTEzbDd2eGd6YyJ9.C_XAsxU0q4h4sEC-fDmc3A';
mapboxgl.accessToken = 'pk.eyJ1IjoibG90ZW5ldCIsImEiOiJjbWRmeHBjcDYwZ3c0MmpwdHBtMHYzdWJqIn0.pibAQlLdp4q6JabzzkZfUw';

const ESTADOS = {
    "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM", "Bahia": "BA", "Ceará": "CE",
    "Distrito Federal": "DF", "Espírito Santo": "ES", "Goiás": "GO", "Maranhão": "MA", "Mato Grosso": "MT",
    "Mato Grosso do Sul": "MS", "Minas Gerais": "MG", "Pará": "PA", "Paraíba": "PB", "Paraná": "PR",
    "Pernambuco": "PE", "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
    "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR", "Santa Catarina": "SC",
    "São Paulo": "SP", "Sergipe": "SE", "Tocantins": "TO"
};

export default function MapBoxComponent() {
    const mapContainer = useRef(null);
    const map = useRef(null);
    const draw = useRef(null);
    const geocoder = useRef(null);

    const [style, setStyle] = useState('mapbox://styles/mapbox/streets-v12');

    const [curvasProntas, setCurvasProntas] = useState(false);
    const [curvasVisiveis, setCurvasVisiveis] = useState(false);

    const [ltPronto, setLtPronto] = useState(false);
    const [ltVisivel, setLtVisivel] = useState(false);

    const [federalPronto, setFederalPronto] = useState(false);
    const [federalVisivel, setFederalVisivel] = useState(false);

    const [riosPronto, setRiosPronto] = useState(false);
    const [riosVisivel, setRiosVisivel] = useState(false);

    const [limitesCidadesPronto, setLimitesCidadesPronto] = useState(false);
    const [limitesCidadesVisivel, setLimitesCidadesVisivel] = useState(false);

    const [estadoSelecionado, setEstadoSelecionado] = useState('');
    const [areasProntas, setAreasProntas] = useState({});
    const [areasVisiveis, setAreasVisiveis] = useState({});

    const [ufSelecionado, setUfSelecionado] = useState(null);
    const [cidadesFiltradas, setCidadesFiltradas] = useState([]);
    const [carregandoCidades, setCarregandoCidades] = useState(false);

    // 💾 estado para AOI e Rios carregados (para reidratar após trocar o estilo)
    const [aoiGeoJSON, setAoiGeoJSON] = useState(null);
    const [riosGeoJSON, setRiosGeoJSON] = useState(null);
    // AOI principal para export (Polygon/MultiPolygon)
    const [poligonoBase, setPoligonoBase] = useState(null);

    const [secOverlays, setSecOverlays] = useState([]); // [{id, data}]
    const secCounter = useRef(0);

    const mapStyles = {
        Streets: 'mapbox://styles/mapbox/streets-v12',
        Satellite: 'mapbox://styles/mapbox/satellite-v9',
        Hybrid: 'mapbox://styles/mapbox/satellite-streets-v12'
    };

    useEffect(() => {
        if (map.current) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style,
            center: [-55, -14],
            zoom: 2
        });

        draw.current = new MapboxDraw({
            controls: { polygon: true, trash: true }
        });
        map.current.addControl(draw.current);

        geocoder.current = new MapboxGeocoder({ accessToken: mapboxgl.accessToken, mapboxgl });
        map.current.addControl(geocoder.current, 'top-left');
        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        map.current.on('load', setupMapExtras);
    }, []);

    useEffect(() => {
        if (!map.current) return;
        map.current.setStyle(style);
        map.current.once('style.load', () => {
            setupMapExtras();

            // reidrata AOI principal
            if (aoiGeoJSON) {
                ensureSource(map.current, 'aoi_kml', aoiGeoJSON);
                ensureLayer(map.current, {
                    id: 'aoi_kml-fill',
                    type: 'fill',
                    source: 'aoi_kml',
                    paint: { 'fill-color': '#00aaff', 'fill-opacity': 0.15 },
                    filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
                });
                ensureLayer(map.current, {
                    id: 'aoi_kml-line',
                    type: 'line',
                    source: 'aoi_kml',
                    paint: { 'line-color': '#0080ff', 'line-width': 2 },
                    filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
                });
            }

            // reidrata overlays secundários
            secOverlays.forEach((ov, idx) => {
                ensureSource(map.current, ov.id, ov.data);
                const color = secColor(idx);
                ensureLayer(map.current, {
                    id: `${ov.id}-fill`,
                    type: 'fill',
                    source: ov.id,
                    paint: { 'fill-color': color, 'fill-opacity': 0.12 },
                    filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
                });
                ensureLayer(map.current, {
                    id: `${ov.id}-outline`,
                    type: 'line',
                    source: ov.id,
                    paint: { 'line-color': color, 'line-width': 2 },
                    filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
                });
                ensureLayer(map.current, {
                    id: `${ov.id}-line`,
                    type: 'line',
                    source: ov.id,
                    paint: { 'line-color': color, 'line-width': 2 },
                    filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
                });
            });
        });
    }, [style]);
    // Carrega camada ao selecionar estado
    useEffect(() => {
        if (estadoSelecionado) carregarAreasEstaduais(estadoSelecionado);
    }, [estadoSelecionado]);

    const mudarEstiloMapa = (styleURL, ufSel) => {
        if (!map.current) return;
        map.current.setStyle(styleURL);
        map.current.once('style.load', () => {
            setupMapExtras();
            if (aoiGeoJSON) addOrUpdateSource(map.current, 'aoi_kml', aoiGeoJSON, true);
            if (riosGeoJSON) addOrUpdateSource(map.current, 'rios_kmz', riosGeoJSON, false, true);
            if (ufSel) carregarAreasEstaduais(ufSel);
        });
    };

    const addOrUpdateSource = (m, id, data, asAOI = false, asRios = false) => {
        if (!m.getSource(id)) {
            m.addSource(id, { type: 'geojson', data });
            if (asAOI) {
                if (!m.getLayer('aoi_kml-fill')) {
                    m.addLayer({
                        id: 'aoi_kml-fill',
                        type: 'fill',
                        source: id,
                        paint: { 'fill-color': '#00aaff', 'fill-opacity': 0.15 },
                        filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
                    });
                }
                if (!m.getLayer('aoi_kml-line')) {
                    m.addLayer({
                        id: 'aoi_kml-line',
                        type: 'line',
                        source: id,
                        paint: { 'line-color': '#0080ff', 'line-width': 2 },
                        filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
                    });
                }
            }
            if (asRios) {
                if (!m.getLayer('rios_kmz-line')) {
                    m.addLayer({
                        id: 'rios_kmz-line',
                        type: 'line',
                        source: id,
                        paint: { 'line-width': 2, 'line-color': '#4169E1' },
                        filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
                    });
                }
            }
        } else {
            m.getSource(id).setData(data);
        }
    };

    const setupMapExtras = () => {
        try {
            if (!map.current.getSource('terrain-data')) {
                map.current.addSource('terrain-data', {
                    type: 'vector',
                    url: 'mapbox://mapbox.mapbox-terrain-v2'
                });
            }
            if (!map.current.getLayer('contour')) {
                map.current.addLayer({
                    id: 'contour',
                    type: 'line',
                    source: 'terrain-data',
                    'source-layer': 'contour',
                    layout: { visibility: 'none' },
                    paint: { 'line-color': '#ff6600', 'line-width': 1.2 }
                });
            }
            if (!map.current.getLayer('contour-labels')) {
                map.current.addLayer({
                    id: 'contour-labels',
                    type: 'symbol',
                    source: 'terrain-data',
                    'source-layer': 'contour',
                    layout: {
                        visibility: 'none',
                        'symbol-placement': 'line',
                        'text-field': ['get', 'ele'],
                        'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                        'text-size': 11
                    },
                    paint: {
                        'text-color': '#333',
                        'text-halo-color': '#fff',
                        'text-halo-width': 1
                    }
                });
            }
            setCurvasProntas(true);
        } catch (err) {
            console.error("Erro curvas:", err);
        }

        try {
            if (!map.current.getSource('lt_existente')) {
                map.current.addSource('lt_existente', {
                    type: 'vector',
                    url: 'mapbox://lotenet.7t4kpbhn'
                });
            }
            if (!map.current.getLayer('lt_existente')) {
                map.current.addLayer({
                    id: 'lt_existente',
                    type: 'line',
                    source: 'lt_existente',
                    'source-layer': 'lt_existente-5porum',
                    layout: { visibility: 'none' },
                    paint: { 'line-color': '#FF0000', 'line-width': 2 }
                });
            }
            setLtPronto(true);
        } catch (err) {
            console.error("Erro LT:", err);
        }

        try {
            if (!map.current.getSource('mapbox-streets')) {
                map.current.addSource('mapbox-streets', {
                    type: 'vector',
                    url: 'mapbox://mapbox.mapbox-streets-v8'
                });
            }
            if (!map.current.getLayer('rios-mapbox')) {
                map.current.addLayer({
                    id: 'rios-mapbox',
                    type: 'line',
                    source: 'mapbox-streets',
                    'source-layer': 'waterway',
                    filter: ['in', 'class', 'river', 'stream', 'canal', 'drain', 'ditch'],
                    layout: { visibility: 'none' },
                    paint: { 'line-color': '#0088ff', 'line-width': 2 }
                });
            }
            setRiosPronto(true);
        } catch (err) {
            console.error("Erro rios:", err);
        }

        try {
            if (!map.current.getSource('limites_federais')) {
                map.current.addSource('limites_federais', {
                    type: 'vector',
                    url: 'mapbox://lotenet.abbcxn9l'
                });
            }
            if (!map.current.getLayer('limites_federais')) {
                map.current.addLayer({
                    id: 'limites_federais',
                    type: 'line',
                    source: 'limites_federais',
                    'source-layer': 'limites_federais-3b28ea',
                    layout: { visibility: 'none' },
                    paint: { 'line-color': '#03300B', 'line-width': 2 },
                    minzoom: 0,
                    maxzoom: 24
                });
            }
            setFederalPronto(true);
        } catch (err) {
            console.error("Erro Limites Federais:", err);
        }
    };

    const carregarAreasEstaduais = async (uf) => {
        const id = `areas_estaduais_${uf.toLowerCase()}`;
        const url = `/dados/areas_${uf}.geojson`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Arquivo não encontrado");
            const data = await res.json();

            if (!map.current.getSource(id)) {
                map.current.addSource(id, { type: 'geojson', data });
            }
            if (!map.current.getLayer(id)) {
                map.current.addLayer({
                    id,
                    type: 'line',
                    source: id,
                    layout: { visibility: 'none' },
                    paint: { 'line-color': '#39ff14', 'line-width': 2 },
                });
            }
            setAreasProntas((prev) => ({ ...prev, [uf]: true }));
        } catch (err) {
            console.warn(`Camada de ${uf} não encontrada:`, err.message);
            setAreasProntas((prev) => ({ ...prev, [uf]: false }));
        }
    };

    const toggleCurvas = () => {
        const vis = map.current.getLayoutProperty('contour', 'visibility');
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty('contour', 'visibility', novo);
        map.current.setLayoutProperty('contour-labels', 'visibility', novo);
        setCurvasVisiveis(novo === 'visible');
    };

    const toggleLT = () => {
        const vis = map.current.getLayoutProperty('lt_existente', 'visibility');
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty('lt_existente', 'visibility', novo);
        setLtVisivel(novo === 'visible');
    };

    const toggleFederais = () => {
        const vis = map.current.getLayoutProperty('limites_federais', 'visibility');
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty('limites_federais', 'visibility', novo);
        setFederalVisivel(novo === 'visible');
    };

    const toggleRios = () => {
        const visibility = map.current.getLayoutProperty('rios-mapbox', 'visibility');
        const novaVisibilidade = visibility === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty('rios-mapbox', 'visibility', novaVisibilidade);
        setRiosVisivel(novaVisibilidade === 'visible');
    };

    const toggleLimites = () => {
        if (!map.current.getLayer("limites-cidades")) return;
        const vis = map.current.getLayoutProperty("limites-cidades", "visibility");
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty("limites-cidades", "visibility", novo);
        setLimitesCidadesVisivel(novo === 'visible');
    };

    const toggleAreasEstaduais = (uf) => {
        const id = `areas_estaduais_${uf.toLowerCase()}`;
        const vis = map.current.getLayoutProperty(id, 'visibility');
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty(id, 'visibility', novo);
        setAreasVisiveis((prev) => ({ ...prev, [uf]: novo === 'visible' }));
    };

    const filtrarPorUF = (uf) => {
        if (!map.current || !uf) return;
        const layerId = 'limites-cidades';
        const sourceLayerName = 'cidades';

        setUfSelecionado(uf);
        setCarregandoCidades(true);

        fetch(`/dados/estados/${uf}.json`)
            .then(res => res.json())
            .then(data => {
                const nomes = data.map(c => c.NM_MUN?.trim()).filter(Boolean).sort();
                setCidadesFiltradas(nomes);
            })
            .catch((err) => {
                console.error("Erro ao carregar cidades:", err);
                setCidadesFiltradas([]);
            })
            .finally(() => setCarregandoCidades(false));

        if (!map.current.getSource(layerId)) {
            map.current.addSource(layerId, {
                type: 'vector',
                url: 'mapbox://lotenet.59fh1i4v'
            });

            map.current.addLayer({
                id: layerId,
                type: 'line',
                source: layerId,
                'source-layer': sourceLayerName,
                layout: { visibility: 'visible' },
                paint: { 'line-color': '#EEAD2D', 'line-width': 2 },
                filter: ['==', ['get', 'SIGLA_UF'], uf]
            });
        } else {
            map.current.setFilter(layerId, ['==', ['get', 'SIGLA_UF'], uf]);
        }

        setLimitesCidadesPronto(true);
        setLimitesCidadesVisivel(true);
    };

    // ---- Helpers para KML/KMZ ----
    const parseKMLTextToGeoJSON = (kmlText) => {
        const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
        return toGeoJSON.kml(dom); // FeatureCollection
    };

    const explodeGeometryCollections = (fc) => {
        const out = [];
        for (const f of fc.features || []) {
            if (!f?.geometry) continue;
            const g = f.geometry;
            if (g.type !== 'GeometryCollection') { out.push(f); continue; }
            for (const sub of g.geometries || []) {
                if (!sub) continue;
                out.push({ type: 'Feature', properties: { ...(f.properties || {}) }, geometry: sub });
            }
        }
        return { type: 'FeatureCollection', features: out };
    };

    const splitByGeomType = (fc) => {
        const polys = [];
        const lines = [];
        for (const f of fc.features || []) {
            const t = f?.geometry?.type;
            if (!t) continue;
            if (t === 'Polygon' || t === 'MultiPolygon') polys.push(f);
            else if (t === 'LineString' || t === 'MultiLineString') lines.push(f);
        }
        return {
            polysFC: { type: 'FeatureCollection', features: polys },
            linesFC: { type: 'FeatureCollection', features: lines },
        };
    };

    const readKMLorKMZFile = async (file) => {
        const isKMZ = /\.kmz$/i.test(file.name) || file.type === 'application/vnd.google-earth.kmz';
        if (isKMZ) {
            const mod = await import('jszip');
            const JSZip = mod.default || mod;
            const zip = await JSZip.loadAsync(file);
            const kmlEntry = zip.file(/(^|\/)doc\.kml$/i)[0] || zip.file(/\.kml$/i)[0];
            if (!kmlEntry) throw new Error('KMZ sem arquivo KML interno.');
            return await kmlEntry.async('string');
        }
        return await file.text();
    };

    const onCidadeSelecionada = async (cidadeNome) => {
        if (!cidadeNome || !ufSelecionado || !map.current) return;

        const nomeCompleto = `${cidadeNome}, ${ufSelecionado}, Brasil`;
        const encoded = encodeURIComponent(nomeCompleto);

        try {
            const res = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxgl.accessToken}&limit=1&language=pt`
            );
            const data = await res.json();

            if (!data.features || data.features.length === 0) {
                console.warn("❌ Cidade não encontrada via geocoding:", nomeCompleto);
                return;
            }

            const [lng, lat] = data.features[0].center;

            map.current.flyTo({
                center: [lng, lat],
                zoom: 11
            });

        } catch (err) {
            console.error("Erro na geocodificação Mapbox:", err);
        }
    };

    // KML/KMZ PRINCIPAL (define AOI onde tudo será sobreposto)
    const onKMLorKMZUploadPrincipal = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const kmlText = await readKMLorKMZFile(file);
            let fc = parseKMLTextToGeoJSON(kmlText);
            if (!fc?.features?.length) throw new Error('KML/KMZ vazio.');

            fc = explodeGeometryCollections(fc);
            const { polysFC, linesFC } = splitByGeomType(fc);

            // precisa ter pelo menos um polígono para ser "principal"
            if (!polysFC.features.length) {
                alert('O KML principal não contém nenhum polígono. Carregue um perímetro (Polygon/MultiPolygon).');
                // ainda assim podemos desenhar as linhas (só para visualização)
                if (linesFC.features.length) {
                    ensureSource(map.current, 'principal_lines', linesFC);
                    ensureLayer(map.current, {
                        id: 'principal_lines-line',
                        type: 'line',
                        source: 'principal_lines',
                        paint: { 'line-color': '#666', 'line-width': 2 },
                        filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
                    });
                }
                return;
            }

            // guarda AOI no estado e renderiza
            setPoligonoBase(polysFC.features[0]);
            setAoiGeoJSON(polysFC);

            ensureSource(map.current, 'aoi_kml', polysFC);
            ensureLayer(map.current, {
                id: 'aoi_kml-fill',
                type: 'fill',
                source: 'aoi_kml',
                paint: { 'fill-color': '#00aaff', 'fill-opacity': 0.15 },
                filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
            });
            ensureLayer(map.current, {
                id: 'aoi_kml-line',
                type: 'line',
                source: 'aoi_kml',
                paint: { 'line-color': '#0080ff', 'line-width': 2 },
                filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
            });

            // se o arquivo principal também tiver linhas, desenhe numa layer própria e fina
            if (linesFC.features.length) {
                ensureSource(map.current, 'aoi_lines', linesFC);
                ensureLayer(map.current, {
                    id: 'aoi_lines-line',
                    type: 'line',
                    source: 'aoi_lines',
                    paint: { 'line-color': '#999', 'line-width': 1.5 },
                    filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
                });
            }

            // fit bounds na AOI
            try {
                const bbox = turf.bbox(polysFC);
                map.current.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 0 });
            } catch { }

        } catch (err) {
            console.error(err);
            alert(`Erro ao abrir KML/KMZ principal: ${err.message || err}`);
        } finally {
            e.target.value = null;
        }
    };

    // KML/KMZ SECUNDÁRIO (pode abrir vários para sobrepor ao principal)
    const onKMLorKMZUploadSecundario = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const kmlText = await readKMLorKMZFile(file);
                let fc = parseKMLTextToGeoJSON(kmlText);
                if (!fc?.features?.length) { console.warn('KML/KMZ secundário vazio:', file.name); continue; }

                fc = explodeGeometryCollections(fc);
                const { polysFC, linesFC } = splitByGeomType(fc);

                // junta polígonos e linhas num único source; layers vão filtrar por tipo
                const combined = { type: 'FeatureCollection', features: [...(polysFC.features || []), ...(linesFC.features || [])] };
                if (!combined.features.length) continue;

                const id = `kml_sec_${++secCounter.current}`;
                ensureSource(map.current, id, combined);

                const color = secColor(secCounter.current - 1);

                // polígonos (fill + outline)
                ensureLayer(map.current, {
                    id: `${id}-fill`,
                    type: 'fill',
                    source: id,
                    paint: { 'fill-color': color, 'fill-opacity': 0.12 },
                    filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
                });
                ensureLayer(map.current, {
                    id: `${id}-outline`,
                    type: 'line',
                    source: id,
                    paint: { 'line-color': color, 'line-width': 2 },
                    filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
                });

                // linhas
                ensureLayer(map.current, {
                    id: `${id}-line`,
                    type: 'line',
                    source: id,
                    paint: { 'line-color': color, 'line-width': 2 },
                    filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
                });

                // guarda na lista para reidratar depois
                setSecOverlays(prev => [...prev, { id, data: combined }]);

                // se não houver AOI ainda, encaixe a vista no secundário
                if (!aoiGeoJSON) {
                    try {
                        const bbox = turf.bbox(combined);
                        map.current.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 0 });
                    } catch { }
                }
            }
        } catch (err) {
            console.error(err);
            alert(`Erro ao abrir KML/KMZ secundário: ${err.message || err}`);
        } finally {
            e.target.value = null;
        }
    };

    // ---- Helpers para Mapbox (adicionar/atualizar sources/layers) ----
    const ensureSource = (m, id, data) => {
        if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data });
        else m.getSource(id).setData(data);
    };

    const ensureLayer = (m, def) => { if (!m.getLayer(def.id)) m.addLayer(def); };

    const secColor = (i) => {
        const pal = ['#ff4d4f', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#1890ff', '#a0d911'];
        return pal[i % pal.length];
    };


    const isPoly = (f) => {
        const t = f?.geometry?.type;
        return t === 'Polygon' || t === 'MultiPolygon';
    };

    const closeRings = (feature) => {
        try {
            const g = feature?.geometry;
            if (!g) return feature;
            if (g.type === 'Polygon') {
                (g.coordinates || []).forEach(r => {
                    if (!r?.length) return;
                    const [fx, fy] = r[0]; const [lx, ly] = r[r.length - 1];
                    if (fx !== lx || fy !== ly) r.push(r[0]);
                });
            } else if (g.type === 'MultiPolygon') {
                (g.coordinates || []).forEach(poly => {
                    poly.forEach(r => {
                        if (!r?.length) return;
                        const [fx, fy] = r[0]; const [lx, ly] = r[r.length - 1];
                        if (fx !== lx || fy !== ly) r.push(r[0]);
                    });
                });
            }
        } catch { }
        return feature;
    };

    const getAOIForExport = () => {
        if (poligonoBase?.geometry?.type && isPoly(poligonoBase)) {
            return closeRings(poligonoBase);
        }
        const drawInst = draw?.current;
        if (!drawInst) throw new Error('Mapbox Draw não inicializado.');

        const sel = drawInst.getSelected()?.features || [];
        const selPolys = sel.filter(isPoly);
        if (selPolys.length) return closeRings(selPolys.at(-1));

        const all = drawInst.getAll()?.features || [];
        const allPolys = all.filter(isPoly);
        if (allPolys.length) return closeRings(allPolys.at(-1));

        console.warn('Debug Draw:', {
            selectedTypes: sel.map(f => f?.geometry?.type),
            allTypes: all.map(f => f?.geometry?.type)
        });
        throw new Error('Nenhum polígono principal definido ou desenhado.');
    };

    const fetchWithTimeout = (url, opts = {}, ms = 300000) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), ms);
        return fetch(url, { ...opts, signal: controller.signal })
            .finally(() => clearTimeout(id));
    };

    const exportAOIAsKML = (aoiFeature, filename = 'aoi.kml') => {
        if (!aoiFeature?.geometry) throw new Error('AOI ausente.');
        // garante anéis fechados (usa seu helper existente)
        const feat = closeRings({ ...aoiFeature, properties: { ...(aoiFeature.properties || {}), name: 'AOI' } });

        const fc = { type: 'FeatureCollection', features: [feat] };
        const kmlData = tokml(fc);
        const blob = new Blob([kmlData], { type: 'application/vnd.google-earth.kml+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };



    const onExportKML = async () => {
        try {
            const aoiFeature = getAOIForExport();

            // Descubra o que está visível (ou use seus estados booleans, como já faz)
            const layers = {
                rios: !!riosVisivel,                 // Mapbox Streets waterway (ou sua camada rios_waterway no banco)
                lt: !!ltVisivel,                     // tileset 'lt_existente'
                cidades: !!limitesCidadesVisivel,    // tileset 'limites-cidades'
                limites_federais: !!federalVisivel,  // tileset 'limites_federais'
                areas_estaduais: !!areasVisiveis, // se tiver um toggle; senão, mande false
            };

            // Se nenhuma camada estiver visível → exporta somente AOI local (KML rápido)
            const algumaCamada = Object.values(layers).some(Boolean);
            if (!algumaCamada) {
                exportAOIAsKML(aoiFeature, 'aoi.kml');
                return;
            }

            const RAW_BASE = import.meta.env.VITE_API_BASE_URL || '';
            const API_BASE = RAW_BASE.replace(/\/+$/, '');
            const endpoint = API_BASE ? `${API_BASE}/api/export/mapa/` : `/api/export/mapa/`;

            // Monte o payload
            const payload = {
                aoi: aoiFeature.geometry,
                layers,
                uf: ufSelecionado || null,      // aplica em Areas (campo Area.uf)
                simplify: {
                    rios: 0.00002,
                    lt: 0.00002,
                    polygons: 0.00005,
                },
                // format: "kml", // descomente se quiser forçar KML puro; default é KMZ
            };

            const res = await fetchWithTimeout(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (res.status === 204) { alert('Nenhuma feição nas camadas selecionadas dentro do polígono.'); return; }
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                if (res.status === 400) throw new Error(`AOI ou parâmetros inválidos. ${txt || ''}`);
                if (res.status === 413) throw new Error('Área muito grande / resultado volumoso (413). Reduza o polígono.');
                throw new Error(`Falha no backend (${res.status}). ${txt}`);
            }

            const blob = await res.blob();
            if (!blob || blob.size === 0) throw new Error('Arquivo vazio recebido.');

            const cd = res.headers.get('Content-Disposition') || '';
            const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/i);
            const filename = m ? decodeURIComponent(m[1] || m[2]) : 'mapa_recorte.kmz';

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('onExportKML (unificado):', err);
            alert(err.message || String(err));
        }
    };



    return (
        <div className="relative w-[80%] h-full bg-transparent rounded-lg shadow overflow-hidden mt-10 mx-auto pb-50">
            <div ref={mapContainer} className="w-full h-[600px]" />

            <ControlsPanel
                className="h-full"
                mapStyles={mapStyles}
                setStyle={setStyle}
                curvasProntas={curvasProntas}
                curvasVisiveis={curvasVisiveis}
                toggleCurvas={toggleCurvas}
                ltPronto={ltPronto}
                ltVisivel={ltVisivel}
                toggleLT={toggleLT}
                federalPronto={federalPronto}
                federalVisivel={federalVisivel}
                riosPronto={riosPronto}
                riosVisivel={riosVisivel}
                toggleRios={toggleRios}
                toggleFederais={toggleFederais}
                limitesCidadesPronto={limitesCidadesPronto}
                limitesCidadesVisivel={limitesCidadesVisivel}
                toggleLimites={toggleLimites}
                estados={ESTADOS}
                ufSelecionado={ufSelecionado}
                setUfSelecionado={setUfSelecionado}
                filtrarPorUF={filtrarPorUF}
                onExportKML={onExportKML}
                // onKMLUpload={onKMLorKMZUpload}
                cidadesFiltradas={cidadesFiltradas}
                onCidadeSelecionada={onCidadeSelecionada}
                carregandoCidades={carregandoCidades}
                estadoSelecionado={estadoSelecionado}
                setEstadoSelecionado={setEstadoSelecionado}
                areasProntas={areasProntas}
                areasVisiveis={areasVisiveis}
                toggleAreasEstaduais={toggleAreasEstaduais}
                mudarEstiloMapa={mudarEstiloMapa}
                map={map.current}
                onKMLorKMZUploadPrincipal={onKMLorKMZUploadPrincipal}
                onKMLorKMZUploadSecundario={onKMLorKMZUploadSecundario}
            />
        </div>
    );
}
