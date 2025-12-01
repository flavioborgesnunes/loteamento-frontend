import { useEffect, useRef, useState } from 'react';
import useAxios from '../../utils/useAxios';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import * as toGeoJSON from '@tmcw/togeojson';
import tokml from 'tokml';
import ControlsPanel from './ControlsPanel';
import ProjetoFormNoMapa from './components/ProjetoFormNoMapa';
import * as turf from '@turf/turf';
import Swal from "sweetalert2";
import { useParams, useNavigate } from "react-router-dom";

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

const DRAW_STYLES = [
    // LINHAS (override total das linhas do Draw – sem line-dasharray)

    // linhas "frias" (não selecionadas)
    {
        id: 'gl-draw-lines-inactive',
        type: 'line',
        filter: ['all',
            ['==', '$type', 'LineString'],
            ['!=', 'meta', 'vertex'],
            ['!=', 'mode', 'static'],
        ],
        layout: {
            'line-cap': 'round',
            'line-join': 'round',
        },
        paint: {
            'line-color': '#ff5500',
            'line-width': 2,
        },
    },
    // linhas "quentes" (em edição)
    {
        id: 'gl-draw-lines-active',
        type: 'line',
        filter: ['all',
            ['==', '$type', 'LineString'],
            ['==', 'active', 'true'],
            ['!=', 'meta', 'vertex'],
        ],
        layout: {
            'line-cap': 'round',
            'line-join': 'round',
        },
        paint: {
            'line-color': '#ff5500',
            'line-width': 3,
        },
    },

    // POLÍGONO “FRIO” (não selecionado)
    {
        id: 'gl-draw-polygon-fill-inactive',
        type: 'fill',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'meta', 'feature']],
        paint: {
            'fill-color': '#00aaff',
            'fill-opacity': 0.08,
        },
    },
    {
        id: 'gl-draw-polygon-stroke-inactive',
        type: 'line',
        filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'meta', 'feature']],
        paint: {
            'line-color': '#0080ff',
            'line-width': 1.5,
        },
    },

    // POLÍGONO “QUENTE” (selecionado / desenhando)
    {
        id: 'gl-draw-polygon-fill-active',
        type: 'fill',
        filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
        paint: {
            'fill-color': '#ffcc00',
            'fill-opacity': 0.12,
        },
    },
    {
        id: 'gl-draw-polygon-stroke-active',
        type: 'line',
        filter: ['all', ['==', '$type', 'Polygon'], ['==', 'active', 'true']],
        paint: {
            'line-color': '#ffcc00',
            'line-width': 2.5,
        },
    },

    // VÉRTICES (bolinhas)
    {
        id: 'gl-draw-vertex-halo-active',
        type: 'circle',
        filter: ['all', ['==', 'meta', 'vertex'], ['==', 'active', 'true']],
        paint: {
            'circle-radius': 6,
            'circle-color': '#ffffff',
        },
    },
    {
        id: 'gl-draw-vertex-active',
        type: 'circle',
        filter: ['all', ['==', 'meta', 'vertex'], ['==', 'active', 'true']],
        paint: {
            'circle-radius': 4,
            'circle-color': '#ff5500',
        },
    },
];

export default function MapBoxComponent() {
    const { id } = useParams();
    const navigate = useNavigate();
    const initialProjectId = id ? Number(id) : null;

    const axiosAuth = useAxios();
    const exportandoRef = useRef(false);
    const wrapperRef = useRef(null);

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [mapReady, setMapReady] = useState(false);

    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState(null); // objeto do projeto selecionado
    const [projetoSelId, setProjetoSelId] = useState(null);

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

    const [municipioSelecionado, setMunicipioSelecionado] = useState("");

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

    // Carrega lista de projetos uma vez
    useEffect(() => {
        const carregarProjetos = async () => {
            try {
                const { data } = await axiosAuth.get('projetos/');
                setProjetos(data || []);
            } catch (err) {
                console.error("Erro ao carregar projetos:", err);
            }
        };
        carregarProjetos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Inicializa o mapa + Draw + geocoder
    useEffect(() => {
        if (map.current) return;

        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style,
            center: [-55, -14],
            zoom: 2,
        });

        map.current.addControl(
            new mapboxgl.FullscreenControl({
                container: wrapperRef.current,
            }),
            "top-right"
        );

        // Mapbox Draw usando os estilos padrão (deixa tudo funcionar 100% primeiro)
        draw.current = new MapboxDraw({
            displayControlsDefault: false,
            controls: { polygon: true, trash: true },
            userProperties: true,
        });


        map.current.addControl(draw.current);

        geocoder.current = new MapboxGeocoder({
            accessToken: mapboxgl.accessToken,
            mapboxgl,
        });
        map.current.addControl(geocoder.current, "top-left");
        map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

        map.current.on("load", () => {
            setupMapExtras();
            setMapReady(true);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // abre projeto vindo pela URL assim que o mapa estiver pronto
    useEffect(() => {
        if (!mapReady) return;
        if (!initialProjectId || !Number.isFinite(initialProjectId)) return;

        abrirProjeto(initialProjectId);
        setProjetoSelId(initialProjectId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapReady, initialProjectId]);

    // Quando trocar o style via ControlsPanel, reidratamos coisas
    useEffect(() => {
        if (!map.current) return;

        map.current.setStyle(style);

        map.current.once("style.load", () => {
            setupMapExtras();

            // reidrata AOI principal APENAS como source,
            // a visualização fica por conta do Mapbox Draw
            if (aoiGeoJSON) {
                ensureSource(map.current, "aoi_kml", aoiGeoJSON);
                // não cria aoi_kml-fill / aoi_kml-line aqui
            }

            // reidrata overlays secundários (essas layers continuam normais)
            secOverlays.forEach((ov, idx) => {
                ensureSource(map.current, ov.id, ov.data);
                const color = ov.color || secColor(idx);

                ensureLayer(map.current, {
                    id: `${ov.id}-fill`,
                    type: "fill",
                    source: ov.id,
                    paint: { "fill-color": color, "fill-opacity": 0.12 },
                    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
                });
                ensureLayer(map.current, {
                    id: `${ov.id}-outline`,
                    type: "line",
                    source: ov.id,
                    paint: { "line-color": color, "line-width": 2 },
                    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
                });
                ensureLayer(map.current, {
                    id: `${ov.id}-line`,
                    type: "line",
                    source: ov.id,
                    paint: { "line-color": color, "line-width": 2 },
                    filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
                });
            });
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [style]);

    // Carrega camada ao selecionar estado
    useEffect(() => {
        if (estadoSelecionado) carregarAreasEstaduais(estadoSelecionado);
    }, [estadoSelecionado]);

    // Fullscreen listener
    useEffect(() => {
        const handleFsChange = () => {
            const fsEl =
                document.fullscreenElement ||
                document.webkitFullscreenElement ||
                document.mozFullScreenElement ||
                document.msFullscreenElement;

            setIsFullscreen(fsEl === wrapperRef.current);
        };

        document.addEventListener("fullscreenchange", handleFsChange);
        document.addEventListener("webkitfullscreenchange", handleFsChange);
        document.addEventListener("mozfullscreenchange", handleFsChange);
        document.addEventListener("MSFullscreenChange", handleFsChange);

        return () => {
            document.removeEventListener("fullscreenchange", handleFsChange);
            document.removeEventListener("webkitfullscreenchange", handleFsChange);
            document.removeEventListener("mozfullscreenchange", handleFsChange);
            document.removeEventListener("MSFullscreenChange", handleFsChange);
        };
    }, []);

    const clearSecOverlaysFromMap = () => {
        if (!map.current) return;
        setSecOverlays((prev) => {
            prev.forEach((ov) => {
                const baseId = ov.id;
                const layerIds = [
                    `${baseId}-fill`,
                    `${baseId}-outline`,
                    `${baseId}-line`,
                ];
                layerIds.forEach((lid) => {
                    if (map.current.getLayer(lid)) {
                        map.current.removeLayer(lid);
                    }
                });
                if (map.current.getSource(baseId)) {
                    map.current.removeSource(baseId);
                }
            });
            return [];
        });
    };

    const abrirProjeto = async (id) => {
        if (!map.current) return;
        try {
            clearSecOverlaysFromMap();

            const { data: resumo } = await axiosAuth.get(`projetos/${id}/map/summary/`);
            setProjetoSel(resumo);
            setProjetoSelId(resumo.id);

            setProjectName(resumo.name || "");
            setProjectDesc(
                resumo.description ||
                resumo.project_description || // se seu serializer usar outro nome
                ""
            );

            // --- AOI ---
            if (resumo.aoi) {
                const aoiFeature = {
                    type: "Feature",
                    geometry: resumo.aoi,
                    properties: {},
                };
                const fc = { type: "FeatureCollection", features: [aoiFeature] };

                setPoligonoBase(aoiFeature);
                setAoiGeoJSON(fc);

                // mantém source para uso interno / export
                ensureSource(map.current, "aoi_kml", fc);

                // fit bounds na AOI
                try {
                    const bbox = turf.bbox(fc);
                    map.current.fitBounds(
                        [
                            [bbox[0], bbox[1]],
                            [bbox[2], bbox[3]],
                        ],
                        { padding: 40, duration: 0 }
                    );
                } catch { }

                // joga AOI no Draw (a partir de agora ela é desenhada/ editada só pelo Draw)
                syncAOIToDraw(resumo.aoi, `aoi-proj-${resumo.id}`);
            }

            // Preenche UF/município no estado (para o form)
            setUfSelecionado(resumo.uf || "");
            setMunicipioSelecionado(resumo.municipio || "");

            // --- Overlays salvos ---
            const novosSecOverlays = [];

            for (const ov of resumo.overlays || []) {
                const overlayId = ov.overlay_id;
                const slug = slugify(String(overlayId));
                const sourceId = `proj_${resumo.id}_${slug}`;

                const { data: fc } = await axiosAuth.get(
                    `projetos/${resumo.id}/features/`,
                    { params: { overlay_id: overlayId, simplified: true } }
                );

                if (!fc?.features?.length) continue;

                ensureSource(map.current, sourceId, fc);

                const color = ov.color || secColor(novosSecOverlays.length);

                ensureLayer(map.current, {
                    id: `${sourceId}-fill`,
                    type: "fill",
                    source: sourceId,
                    paint: { "fill-color": color, "fill-opacity": 0.12 },
                    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
                });
                ensureLayer(map.current, {
                    id: `${sourceId}-outline`,
                    type: "line",
                    source: sourceId,
                    paint: { "line-color": color, "line-width": 2 },
                    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
                });
                ensureLayer(map.current, {
                    id: `${sourceId}-line`,
                    type: "line",
                    source: sourceId,
                    paint: { "line-color": color, "line-width": 2 },
                    filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
                });

                novosSecOverlays.push({
                    id: sourceId,
                    name: overlayId,
                    color,
                    data: fc,
                });
            }

            setSecOverlays(novosSecOverlays);
        } catch (err) {
            console.error("Erro ao abrir projeto:", err);
            Swal.fire({
                icon: "error",
                title: "Erro ao carregar projeto",
                text: "Não foi possível carregar os dados do projeto.",
            });
        }
    };

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
            m.addSource(id, { type: "geojson", data });
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
        map.current.setLayoutProperty("limites-cidades", 'visibility', novo);
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

        setMunicipioSelecionado(cidadeNome);

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
            if (!fc?.features?.length) throw new Error("KML/KMZ vazio.");

            fc = explodeGeometryCollections(fc);
            const { polysFC, linesFC } = splitByGeomType(fc);

            // precisa ter pelo menos um polígono para ser "principal"
            if (!polysFC.features.length) {
                Swal.fire({
                    icon: "error",
                    title: "Arquivo inválido",
                    text: "O KML principal não contém nenhum polígono.",
                });

                // ainda podemos desenhar as linhas (só visual)
                if (linesFC.features.length) {
                    ensureSource(map.current, "principal_lines", linesFC);
                    ensureLayer(map.current, {
                        id: "principal_lines-line",
                        type: "line",
                        source: "principal_lines",
                        paint: { "line-color": "#666", "line-width": 2 },
                        filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
                    });
                }
                return;
            }

            // guarda AOI no estado e renderiza
            const aoiFromFile = polysFC.features[0];
            setPoligonoBase(aoiFromFile);
            setAoiGeoJSON(polysFC);

            // mantém source para export, mas sem layers visuais
            ensureSource(map.current, "aoi_kml", polysFC);

            // joga AOI no Draw para permitir edição
            if (aoiFromFile?.geometry) {
                syncAOIToDraw(aoiFromFile.geometry, "aoi-kml");
            }

            // se o arquivo principal também tiver linhas, desenha numa layer própria
            if (linesFC.features.length) {
                ensureSource(map.current, "aoi_lines", linesFC);
                ensureLayer(map.current, {
                    id: "aoi_lines-line",
                    type: "line",
                    source: "aoi_lines",
                    paint: { "line-color": "#999", "line-width": 1.5 },
                    filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
                });
            }

            // fit bounds na AOI
            try {
                const bbox = turf.bbox(polysFC);
                map.current.fitBounds(
                    [
                        [bbox[0], bbox[1]],
                        [bbox[2], bbox[3]],
                    ],
                    { padding: 40, duration: 0 }
                );
            } catch { }
        } catch (err) {
            console.error(err);
            Swal.fire({
                icon: "error",
                title: "Erro ao abrir arquivo",
                text: err.message || "Falha ao processar o KML/KMZ.",
            });
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
                Swal.fire({
                    icon: "error",
                    title: "Arquivo vazio",
                    text: "Esse KML/KMZ não contém elementos utilizáveis.",
                });
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
            Swal.fire({
                icon: "error",
                title: "Erro ao importar",
                text: `Não foi possível abrir o arquivo ${file?.name}.`,
            });

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
    function clipSecondaryOverlaysWithinAOI(secOverlaysArr, aoiFeature, simplify = {}) {
        if (!Array.isArray(secOverlaysArr) || !secOverlaysArr.length) return null;

        const aoiMP = getAOIMultiPolygon(aoiFeature);
        const acc = [];

        for (const overlay of secOverlaysArr) {
            const src = overlay?.data;
            if (!src?.features?.length) continue;

            for (const feat of src.features) {
                const clipped = clipFeatureByAOI(feat, aoiMP);
                if (!clipped) continue;

                const pushFeat = (f) => {
                    const out = {
                        ...f,
                        properties: { ...(f.properties || {}), __overlay_id: overlay.name },
                    };
                    acc.push(out);
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

    const geometryToDrawFeatures = (geom) => {
        if (!geom) return [];

        if (geom.type === "Polygon") {
            return [
                {
                    type: "Feature",
                    geometry: geom,
                    properties: {},
                },
            ];
        }

        if (geom.type === "MultiPolygon") {
            return (geom.coordinates || []).map((coords) => ({
                type: "Feature",
                geometry: { type: "Polygon", coordinates: coords },
                properties: {},
            }));
        }

        return [];
    };

    const syncAOIToDraw = (geom) => {
        if (!draw.current || !geom) return;

        const drawInst = draw.current;

        // 1) limpa qualquer coisa anterior do Draw
        const all = drawInst.getAll();
        if (all && all.features && all.features.length) {
            drawInst.delete(all.features.map((f) => f.id));
        }

        // 2) Gera features a partir da geometria (Polygon ou MultiPolygon)
        const featuresToAdd = geometryToDrawFeatures(geom).map((f) => ({
            ...f,
            // NÃO forçamos id aqui, deixamos o Mapbox Draw criar o id interno
            properties: { ...(f.properties || {}), __aoi: true },
        }));

        if (!featuresToAdd.length) return;

        // 3) Adiciona no Draw e pega os IDs gerados pelo próprio Draw
        const newIds = drawInst.add({
            type: "FeatureCollection",
            features: featuresToAdd,
        });

        // 4) Entra direto em modo de edição de vértices no(s) feature(s) adicionados
        if (Array.isArray(newIds) && newIds.length === 1) {
            drawInst.changeMode("direct_select", { featureId: newIds[0] });
        } else if (Array.isArray(newIds) && newIds.length > 1) {
            drawInst.changeMode("simple_select", { featureIds: newIds });
        }
    };


    const getAOIForExport = () => {
        const drawInst = draw?.current;

        // 1) Tenta pegar a AOI do Draw (último polígono desenhado/editado)
        if (drawInst) {
            const all = drawInst.getAll()?.features || [];
            const polys = all.filter(isPoly);
            if (polys.length) {
                return closeRings(polys.at(-1));
            }
        }

        // 2) Se não tiver nada no Draw, usa o poligonoBase (KML / carregado do projeto)
        if (poligonoBase?.geometry?.type && isPoly(poligonoBase)) {
            return closeRings(poligonoBase);
        }

        console.warn("Debug AOI: sem polígono no Draw nem poligonoBase válido.");
        throw new Error("Nenhum polígono principal definido ou desenhado.");
    };

    const exportAOIAsKML = (aoiFeature, filename = 'aoi.kml') => {
        if (!aoiFeature?.geometry) throw new Error('AOI ausente.');
        // garante anéis fechados
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
        projectId = null,
        projectName,
        projectDescription = "",
        uf = "",
        municipio = "",
        outFormat = "kmz",

        // 👇 controle de salvar x exportar
        persist = false,      // padrão: NÃO salvar
        downloadFile = true,  // padrão: baixar arquivo
    } = {}) => {
        try {
            // 1) Tenta obter a AOI; se não existir, usa o bbox dos overlays como fallback
            let aoiFeature = null;
            try {
                aoiFeature = getAOIForExport();
            } catch (e) {
                const feats = (secOverlays || []).flatMap(ov => ov?.data?.features || []);
                if (feats.length) {
                    const [minX, minY, maxX, maxY] = turf.bbox({
                        type: "FeatureCollection",
                        features: feats,
                    });
                    aoiFeature = turf.bboxPolygon([minX, minY, maxX, maxY]);
                }
            }

            if (!aoiFeature?.geometry) {
                Swal.fire({
                    icon: "warning",
                    title: "AOI não encontrada",
                    text: "Defina um polígono principal (AOI) antes de salvar ou exportar.",
                });
                return;
            }

            // 2) Flags de camadas
            const layers = {
                rios: !!riosVisivel,
                lt: !!ltVisivel,
                mf: !!MFVisivel,
                cidades: !!limitesCidadesVisivel,
                limites_federais: !!federalVisivel,
                areas_estaduais: Object.values(areasVisiveis || {}).some(Boolean),
            };

            // 3) Overlays secundários (raw)
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

            // 4) Recorte opcional no cliente
            const clippedOverlays = clipSecondaryOverlaysWithinAOI(
                secOverlays.map(({ name, data, color }) => ({ id: name, data, color })),
                aoiFeature,
                { tolerance: 0.00002 }
            );

            const overlaysClippedFC = clippedOverlays || {
                type: "FeatureCollection",
                features: [],
            };

            // 5) Tolerâncias
            const simplify = {
                rios: 0.00002,
                lt: 0.00002,
                mf: 0.00002,
                polygons: 0,
            };


            // 6) Payload
            const payload = {
                project_id: projectId,
                project_name: projectName || `Projeto ${new Date().toLocaleString()}`,
                project_description: projectDescription || "",
                uf: uf || "",
                municipio: municipio || "",
                aoi: aoiFeature.geometry,
                layers,
                simplify,
                overlays_raw: overlaysRaw,
                overlays: overlaysClippedFC,

                format: outFormat,

                // 👇 AQUI está a chave
                persist: !!persist,              // se false -> backend NÃO deve salvar
                replace_overlays: !!persist,     // só substitui overlays quando estiver salvando
            };

            // 7) Chamada ao backend
            const res = await axiosAuth.post("projetos/exportar/", payload, {
                responseType: "blob",
            });

            // 👉 Se não for pra baixar o arquivo, só mostra mensagem e sai
            if (!downloadFile) {
                Swal.fire({
                    icon: "success",
                    title: persist
                        ? (projectId ? "Projeto atualizado!" : "Projeto salvo!")
                        : "Operação concluída!",
                    text: persist
                        ? "Os dados do projeto foram salvos no servidor."
                        : "Operação concluída sem download de arquivo.",
                });
                return;
            }

            // 8) Extrai nome de arquivo (só para exibir pro usuário)
            const dispo = res.headers?.["content-disposition"] || "";
            const m = /filename="?([^"]+)"?/i.exec(dispo);
            const filename =
                m?.[1] ||
                (outFormat === "kml" ? "mapa_recorte.kml" : "mapa_recorte.kmz");

            // 9) Cria blob e mostra SweetAlert com link (sem auto-download)
            const blob = new Blob([res.data], {
                type:
                    res.headers?.["content-type"] ||
                    (outFormat === "kml"
                        ? "application/vnd.google-earth.kml+xml"
                        : "application/vnd.google-earth.kmz"),
            });
            const url = URL.createObjectURL(blob);

            Swal.fire({
                icon: "success",
                title: "KML/KMZ gerado",
                html: `
                <p class="mb-2">
                    Arquivo: <strong>${filename}</strong>
                </p>
                <p class="mb-3">
                    Clique no botão abaixo para baixar o arquivo.".
                </p>
                <a href="${url}" target="_blank" rel="noopener" id="link-download" class="swal2-confirm swal2-styled"style="color: #2196f3 !important;">
                    Baixar arquivo
                </a>
            `,
                didClose: () => {
                    URL.revokeObjectURL(url);
                },
                showConfirmButton: false,
            });

        } catch (err) {
            console.error(err);
            const msg = await (async () => {
                try {
                    if (err?.response) {
                        const text = await err.response.data.text?.();
                        return text || `Falha no backend (${err.response.status}).`;
                    }
                } catch { }
                return err?.message || "Falha ao salvar/exportar.";
            })();

            Swal.fire({
                icon: "error",
                title: "Erro no servidor",
                text: msg || "Falha ao salvar ou exportar o projeto.",
            });
        }
    };

    async function handleSalvarProjeto({ name, description, uf, municipio }) {
        await onExportKML({
            projectId: projetoSel?.id || null,
            projectName: name,
            projectDescription: description,
            uf,
            municipio,
            outFormat: "kmz",
            persist: true,       // 👈 SALVAR no backend
            downloadFile: false, // 👈 NÃO baixar arquivo
        });
    }

    async function handleExportarProjeto({ name, description, uf, municipio }) {
        await onExportKML({
            projectId: projetoSel?.id || null,
            projectName: name,
            projectDescription: description,
            uf,
            municipio,
            outFormat: "kmz",
            persist: false,      // 👈 NÃO salvar no backend
            downloadFile: true,  // 👈 SÓ baixar o arquivo
        });
    }


    return (
        <div className="relative w-full h-full bg-transparent rounded-lg shadow overflow-hidden mt-10 mx-auto pb-50">

            {/* SELETOR DE PROJETOS SALVOS */}
            <div className="mb-4 flex flex-wrap gap-2 items-center">
                <label className="text-sm font-medium">Projetos salvos:</label>
                <select
                    className="border p-2 rounded min-w-[240px]"
                    value={projetoSelId || ""}
                    onChange={(e) => {
                        const idNum = Number(e.target.value);
                        if (Number.isFinite(idNum)) {
                            setProjetoSelId(idNum);
                            abrirProjeto(idNum);
                            // ajuste esta rota se for diferente
                            navigate(`/estudo/${idNum}`);
                        }
                    }}
                >
                    <option value="">Selecione um projeto...</option>
                    {projetos.map((p) => (
                        <option key={p.id} value={p.id}>
                            {p.name} ({p.uf || "--"})
                        </option>
                    ))}
                </select>
            </div>

            {/* WRAPPER que entra no fullscreen */}
            <div
                ref={wrapperRef}
                className="relative w-full h-[600px] bg-transparent rounded-lg shadow overflow-hidden"
            >
                {/* MAPA */}
                <div ref={mapContainer} className="w-full h-full" />

                {/* ControlsPanel SEMPRE DENTRO DO MAPA */}
                <div className="absolute top-4 left-4 z-20 max-w-[480px] ">
                    <ControlsPanel
                        className="h-full p-2"
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
                </div>

                {/* Form DENTRO DO MAPA SOMENTE EM FULLSCREEN */}
                {isFullscreen && (
                    <div className="absolute bottom-4 z-20">
                        <ProjetoFormNoMapa
                            defaultName={projectName}
                            defaultDescription={projectDesc}
                            defaultUF={ufSelecionado}
                            defaultMunicipio={municipioSelecionado}
                            onSalvar={handleSalvarProjeto}
                            onExportar={handleExportarProjeto}
                        />
                    </div>
                )}
            </div>

            {!isFullscreen && (
                <div className="mt-4">
                    <ProjetoFormNoMapa
                        defaultName={projectName}
                        defaultDescription={projectDesc}
                        defaultUF={ufSelecionado}
                        defaultMunicipio={municipioSelecionado}
                        onSalvar={handleSalvarProjeto}
                        onExportar={handleExportarProjeto}
                    />
                </div>
            )}


            {/* Modal permanece independente do fullscreen */}
            <ModalKMLsSecundarios
                isOpen={showSecModal}
                onClose={() => setShowSecModal(false)}
                onConfirm={handleAddSecondaryKML}
            />
        </div>
    );
}
