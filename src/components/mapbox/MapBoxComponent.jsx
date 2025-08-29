import { useEffect, useRef, useState } from 'react';
import useAxios from '../../utils/useAxios'
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import * as toGeoJSON from '@tmcw/togeojson';
import tokml from 'tokml';
import ControlsPanel from './ControlsPanel';
import ProjetoFormNoMapa from './components/ProjetoFormNoMapa';
import * as turf from '@turf/turf';

import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import ModalKMLsSecundarios from './components/ModalKMLsSecundarios';

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
    const axiosAuth = useAxios();
    const exportandoRef = useRef(false);

    const mapContainer = useRef(null);
    const map = useRef(null);
    const draw = useRef(null);
    const geocoder = useRef(null);

    const [style, setStyle] = useState('mapbox://styles/mapbox/streets-v12');

    const [curvasProntas, setCurvasProntas] = useState(false);
    const [curvasVisiveis, setCurvasVisiveis] = useState(false);

    const [ltPronto, setLtPronto] = useState(false);
    const [ltVisivel, setLtVisivel] = useState(false);

    const [MFPronto, setMFPronto] = useState(false);
    const [MFVisivel, setMFVisivel] = useState(false);

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

    const [secOverlays, setSecOverlays] = useState([]);
    const secCounter = useRef(0);

    const [showSecModal, setShowSecModal] = useState(false);

    // Formulário criação:
    const [projectName, setProjectName] = useState("");
    const [projectDesc, setProjectDesc] = useState("");

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
                const color = ov.color || secColor(idx);
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

    const addOrUpdateSource = (m, id, data, asAOI = false) => {
        if (!m.getSource(id)) {
            m.addSource(id, { type: 'geojson', data });

            // Se for a AOI principal, adiciona fill + line
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
            if (!map.current.getSource('malha_ferroviaria')) {
                map.current.addSource('malha_ferroviaria', {
                    type: 'vector',
                    url: 'mapbox://lotenet.bddhm8nd'
                });
            }
            if (!map.current.getLayer('malha_ferroviaria')) {
                map.current.addLayer({
                    id: 'malha_ferroviaria',
                    type: 'line',
                    source: 'malha_ferroviaria',
                    'source-layer': 'malha_ferroviaria_antt_2025-6re4xi',
                    layout: { visibility: 'none' },
                    paint: { 'line-color': '#8B4513', 'line-width': 2 }
                });
            }
            setMFPronto(true);
        } catch (err) {
            console.error("Erro Mlha Ferroviária:", err);
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
        if (!map.current.getLayer('lt_existente')) return;
        const vis = map.current.getLayoutProperty('lt_existente', 'visibility');
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty('lt_existente', 'visibility', novo);
        setLtVisivel(novo === 'visible');
    };

    const toggleMF = () => {
        const vis = map.current.getLayoutProperty('malha_ferroviaria', 'visibility');
        const novo = vis === 'visible' ? 'none' : 'visible';
        map.current.setLayoutProperty('malha_ferroviaria', 'visibility', novo);
        setMFVisivel(novo === 'visible');
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

    const handleAddSecondaryKML = async ({ file, name }) => {
        try {
            // lê arquivo
            const kmlText = await readKMLorKMZFile(file);
            let fc = parseKMLTextToGeoJSON(kmlText);
            if (!fc?.features?.length) {
                alert(`KML/KMZ "${file.name}" está vazio.`);
                return;
            }

            // explode e separe
            fc = explodeGeometryCollections(fc);
            const { polysFC, linesFC } = splitByGeomType(fc);
            const combined = {
                type: 'FeatureCollection',
                features: [...(polysFC.features || []), ...(linesFC.features || [])]
            };
            if (!combined.features.length) {
                alert(`Nenhum polígono/linha utilizável em "${file.name}".`);
                return;
            }

            // id/cores e marcação de origem
            const id = `kml_sec_${++secCounter.current}_${slugify(name)}`;
            const color = secColor(secCounter.current - 1);

            // anota o nome no properties (ajuda na exportação)
            combined.features = combined.features.map(f => ({
                ...f,
                properties: { ...(f.properties || {}), __overlay_id: name }
            }));

            // adiciona no mapa
            ensureSource(map.current, id, combined);

            // layers (fill/outline/line)
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
            ensureLayer(map.current, {
                id: `${id}-line`,
                type: 'line',
                source: id,
                paint: { 'line-color': color, 'line-width': 2 },
                filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
            });

            // guarda para reidratar e exportar
            setSecOverlays(prev => [...prev, { id, name, color, data: combined }]);

            // fit se não houver AOI ainda
            if (!aoiGeoJSON) {
                try {
                    const bbox = turf.bbox(combined);
                    map.current.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: 40, duration: 0 });
                } catch { }
            }
        } catch (err) {
            console.error(err);
            alert(`Erro ao abrir "${file?.name}": ${err.message || err}`);
        } finally {
            setShowSecModal(false);
        }
    };



    // ---- Helpers para Mapbox (adicionar/atualizar sources/layers) ----


    /** Garante um MultiPolygon para operar recortes com Turf */
    function getAOIMultiPolygon(aoiFeature) {
        if (!aoiFeature) throw new Error('AOI ausente.');
        const g = aoiFeature.geometry;
        if (!g) throw new Error('AOI sem geometria.');
        if (g.type === 'Polygon') {
            return { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [g.coordinates] }, properties: {} };
        }
        if (g.type === 'MultiPolygon') {
            return { type: 'Feature', geometry: g, properties: {} };
        }
        throw new Error(`AOI precisa ser Polygon/MultiPolygon. Veio: ${g.type}`);
    }

    /** Recorta uma *feature* por uma AOI (MultiPolygon) */
    function clipFeatureByAOI(feat, aoiMP) {
        const type = feat?.geometry?.type;
        if (!type) return null;

        // Polígonos: interseção direta
        if (type === 'Polygon' || type === 'MultiPolygon') {
            try {
                const inter = turf.intersect(feat, aoiMP);
                return inter || null;
            } catch { return null; }
        }

        // Linhas: split + filtra trechos cujo centroide está dentro da AOI
        // Linhas: split + filtra trechos cujo centroide está dentro da AOI
        if (type === 'LineString' || type === 'MultiLineString') {
            try {
                // Explode para tratar cada linha
                const exploded = type === 'MultiLineString'
                    ? turf.flatten(feat) // FC de LineString
                    : { type: 'FeatureCollection', features: [feat] };

                const kept = [];
                for (const f of exploded.features) {
                    // Para cada polígono do MultiPolygon, converta o polígono em linhas
                    const polyLines = [];
                    for (const rings of aoiMP.geometry.coordinates) {
                        const poly = { type: 'Feature', geometry: { type: 'Polygon', coordinates: rings }, properties: {} };
                        const asLine = turf.polygonToLine(poly); // pode retornar LineString ou MultiLineString
                        const linesFC = asLine.type === 'FeatureCollection'
                            ? asLine
                            : (asLine.geometry.type === 'MultiLineString'
                                ? turf.flatten(asLine)
                                : { type: 'FeatureCollection', features: [asLine] });
                        polyLines.push(...linesFC.features);
                    }

                    // Split iterativamente a linha pelos contornos da AOI
                    let frags = [f];
                    for (const splitter of polyLines) {
                        const out = turf.lineSplit(
                            { type: 'FeatureCollection', features: frags },
                            splitter
                        );
                        frags = out.features.length ? out.features : frags;
                    }

                    // Fica só com fragmentos cujo ponto médio está dentro da AOI
                    for (const seg of frags) {
                        const mid = turf.along(seg, turf.length(seg) / 2);
                        if (turf.booleanPointInPolygon(mid, aoiMP)) {
                            kept.push(seg);
                        }
                    }
                }

                if (!kept.length) return null;
                if (kept.length === 1) return kept[0];
                return turf.featureCollection(kept);
            } catch {
                return null;
            }
        }


        // Outros tipos: ignorar
        return null;
    }

    /** Aplica recorte em todos os overlays secundários carregados (array [{id, data}]) */
    function clipSecondaryOverlaysWithinAOI(secOverlays, aoiFeature, simplify = {}) {
        if (!Array.isArray(secOverlays) || !secOverlays.length) return null;

        const aoiMP = getAOIMultiPolygon(aoiFeature);
        const acc = [];

        for (const overlay of secOverlays) {
            const src = overlay?.data;
            if (!src?.features?.length) continue;

            for (const feat of src.features) {
                const clipped = clipFeatureByAOI(feat, aoiMP);
                if (!clipped) continue;

                // clipped pode ser Feature ou FeatureCollection (no caso de linhas)
                const pushFeat = (f) => {
                    let out = f;
                    // Simplificação opcional
                    if (simplify?.tolerance && (f.geometry.type !== 'Point')) {
                        try { out = turf.simplify(f, { tolerance: simplify.tolerance, highQuality: false }); } catch { }
                    }
                    // Anota origem (id do overlay) para facilitar estilo/legenda no backend
                    out.properties = { ...(out.properties || {}), __overlay_id: overlay.name }; acc.push(out);
                };

                if (clipped.type === 'FeatureCollection') {
                    for (const f of clipped.features) pushFeat(f);
                } else {
                    pushFeat(clipped);
                }
            }
        }

        if (!acc.length) return null;
        return { type: 'FeatureCollection', features: acc };
    }


    const ensureSource = (m, id, data) => {
        if (!m.getSource(id)) m.addSource(id, { type: 'geojson', data });
        else m.getSource(id).setData(data);
    };

    const ensureLayer = (m, def) => { if (!m.getLayer(def.id)) m.addLayer(def); };

    const slugify = (s) =>
        (s || "")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .toLowerCase() || "overlay";

    const secPalette = ['#ff4d4f', '#52c41a', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#1890ff', '#a0d911'];
    const secColor = (i) => secPalette[i % secPalette.length];



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

    // FUNÇÃO DE EXPORT-----------------------------------------

    const onExportKML = async ({
        projectName,
        projectDescription = "",
        uf = "",
        outFormat = "kmz",
    } = {}) => {
        try {
            // 1) Tenta obter a AOI; se não existir, usa o bbox dos overlays como fallback
            let aoiFeature = null;
            try {
                aoiFeature = getAOIForExport(); // sua função atual
            } catch (e) {
                const feats = (secOverlays || []).flatMap(ov => ov?.data?.features || []);
                if (feats.length) {
                    const [minX, minY, maxX, maxY] = turf.bbox({ type: "FeatureCollection", features: feats });
                    aoiFeature = turf.bboxPolygon([minX, minY, maxX, maxY]);
                }
            }
            if (!aoiFeature?.geometry) {
                alert("Defina um polígono principal (AOI) ou carregue overlays para gerar uma AOI automática.");
                return;
            }

            // 2) Flags de camadas (igual você já usa na UI)
            const layers = {
                rios: !!riosVisivel,
                lt: !!ltVisivel,
                mf: !!MFVisivel,
                cidades: !!limitesCidadesVisivel,
                limites_federais: !!federalVisivel,
                areas_estaduais: Object.values(areasVisiveis || {}).some(Boolean),
            };

            // 3) Overlays secundários (enviamos "raw" para o servidor recortar)
            //    Mantemos __overlay_id e __color, se presentes.
            const overlaysRaw = {
                type: "FeatureCollection",
                features: (secOverlays || []).flatMap(ov => {
                    const overlayId = ov?.name || "overlay";
                    const color = ov?.color || null;
                    const feats = ov?.data?.features || [];
                    return feats.map(f => ({
                        type: "Feature",
                        properties: {
                            ...(f.properties || {}),
                            __overlay_id: f?.properties?.__overlay_id || overlayId,
                            __color: f?.properties?.__color || color,
                        },
                        geometry: f.geometry,
                    }));
                }),
            };

            // (Opcional) Se você também quiser mandar já recortado (cliente),
            // o backend vai preferir overlays_raw; mas manteremos por compat:
            const clippedOverlays = clipSecondaryOverlaysWithinAOI(
                secOverlays.map(({ name, data, color }) => ({ id: name, data, color })),
                aoiFeature,
                { tolerance: 0.00002 }
            );

            const overlaysClippedFC = {
                type: "FeatureCollection",
                features: (clippedOverlays || []).flatMap(ov => {
                    const overlayId = ov?.id || "overlay";
                    const feats = ov?.data?.features || [];
                    return feats.map(f => ({
                        type: "Feature",
                        properties: {
                            ...(f.properties || {}),
                            __overlay_id: f?.properties?.__overlay_id || overlayId,
                            __color: f?.properties?.__color || ov?.color || null,
                        },
                        geometry: f.geometry,
                    }));
                }),
            };

            // 4) Tolerâncias de simplificação (ajuste conforme sua UX)
            const simplify = {
                rios: 0.00002,
                lt: 0.00002,
                mf: 0.00002,
                polygons: 0.00005,
            };

            // 5) Monta payload conforme o serializer do backend
            const payload = {
                project_name: projectName || `Projeto ${new Date().toLocaleString()}`,
                project_description: projectDescription || "",
                uf: uf || "",
                aoi: aoiFeature.geometry,       // aceita Polygon/MultiPolygon/Feature/FC (backend normaliza)
                layers,
                simplify,
                overlays_raw: overlaysRaw,      // servidor recorta e persiste no PostGIS
                overlays: overlaysClippedFC,    // opcional (será ignorado se overlays_raw tiver features)
                format: outFormat,              // "kmz" ou "kml"
                persist: true,                  // padrão true; mantém explícito
            };

            // 6) Chama o endpoint que CRIA o projeto, SALVA os overlays e DEVOLVE o KMZ
            const res = await axiosAuth.post("projetos/exportar/", payload, {
                responseType: "blob",
            });

            // 7) Extrai nome de arquivo do header (se houver)
            const dispo = res.headers?.["content-disposition"] || "";
            const m = /filename="?([^"]+)"?/i.exec(dispo);
            const filename = m?.[1] || (outFormat === "kml" ? "mapa_recorte.kml" : "mapa_recorte.kmz");

            // 8) Baixa o arquivo
            const blob = new Blob([res.data], {
                type: res.headers?.["content-type"] || (outFormat === "kml"
                    ? "application/vnd.google-earth.kml+xml"
                    : "application/vnd.google-earth.kmz"),
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            // Dica: se quiser, aqui você pode disparar um toast de sucesso
            // e/ou recarregar uma lista de projetos recentes na sua UI.
        } catch (err) {
            console.error(err);
            // mensagens mais amigáveis
            const msg = await (async () => {
                try {
                    if (err?.response) {
                        const text = await err.response.data.text?.();
                        return text || `Falha no backend (${err.response.status}).`;
                    }
                } catch { }
                return err?.message || "Falha ao exportar.";
            })();
            alert(msg);
        }
    };




    async function handleProjetoFormSubmit({ name, description, uf }) {
        await onExportKML({
            projectName: name,
            projectDescription: description,
            uf,
            outFormat: "kmz",
        });
    }





    return (
        <div className="relative w-[80%] h-full bg-transparent rounded-lg shadow overflow-hidden mt-10 mx-auto pb-50">
            <div ref={mapContainer} className="w-full h-[600px]" />

            <ProjetoFormNoMapa
                defaultUF={ufSelecionado}
                onSubmit={handleProjetoFormSubmit}
            />


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
                MFPronto={MFPronto}
                MFVisivel={MFVisivel}
                toggleMF={toggleMF}
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

                onOpenKMLSecModal={() => setShowSecModal(true)}
                secOverlays={secOverlays}

            />

            <ModalKMLsSecundarios
                isOpen={showSecModal}
                onClose={() => setShowSecModal(false)}
                onConfirm={handleAddSecondaryKML}
            />

        </div>
    );
}
