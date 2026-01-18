// src/pages/parcelamento/ParcelamentoIA.jsx
import React, { useEffect, useRef, useState } from "react";
import useAxios from "../../utils/useAxios";
import useParcelamentoApi from "./parcelamento";
import ViasPanel from "./components/ViasPanel";
import ParametrosGeraisPanel from "./components/ParametrosGeraisPanel";

// 👉 painel de blocos (ajuste o path se precisar)
import ParcelamentoBlocosPanel from "./ParcelamentoBlocosPanel";

import { Expand, Shrink } from "lucide-react";
import { useLocation } from "react-router-dom";


// OpenLayers
import "ol/ol.css";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import { Fill, Stroke, Style, Circle as CircleStyle, Text } from "ol/style";
import { Point as OLPoint } from "ol/geom";
import GeoJSON from "ol/format/GeoJSON";
import { fromLonLat } from "ol/proj";
import { Modify, Snap, Select, Draw } from "ol/interaction";
import Translate from "ol/interaction/Translate";
import {
    click as clickSelectCondition,
    altKeyOnly,
    platformModifierKeyOnly,
    primaryAction,
    noModifierKeys,
} from "ol/events/condition";
import {
    defaults as defaultControls,
    ScaleLine,
    MousePosition,
    Zoom,
    Rotate,
    Attribution,
} from "ol/control";
import { createStringXY } from "ol/coordinate";

// ---------------- Helpers globais OL/GeoJSON ----------------
const gj = new GeoJSON();
const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
const hidpi = typeof window !== "undefined" && window.devicePixelRatio > 1;

function toFC(x) {
    if (!x) return { type: "FeatureCollection", features: [] };
    if (x.type === "FeatureCollection") return x;
    if (x.type === "Feature") return { type: "FeatureCollection", features: [x] };
    if (x.type && x.coordinates) {
        return {
            type: "FeatureCollection",
            features: [{ type: "Feature", geometry: x, properties: {} }],
        };
    }
    return { type: "FeatureCollection", features: [] };
}

function buildFCsForFit(geo) {
    if (!geo) return { fcAOI: null, all: null };
    const aoiGeom =
        geo?.area_loteavel?.features?.[0]?.geometry ||
        geo?.aoi ||
        geo?.aoi_snapshot ||
        null;

    const fcAOI = aoiGeom
        ? toFC({ type: "Feature", geometry: aoiGeom, properties: {} })
        : null;

    const fcs = [
        toFC(geo?.av),
        toFC(geo?.corte_av),
        toFC(geo?.ruas_eixo),
        toFC(geo?.ruas_mask),
        toFC(geo?.rios_centerline),
        toFC(geo?.rios_faixa),
        toFC(geo?.lt_centerline),
        toFC(geo?.lt_faixa),
        toFC(geo?.ferrovias_centerline),
        toFC(geo?.ferrovias_faixa),
        toFC(geo?.area_loteavel),
        fcAOI || { type: "FeatureCollection", features: [] },
    ];

    const all = { type: "FeatureCollection", features: [] };
    fcs.forEach((fc) => {
        if (fc?.features?.length) all.features.push(...fc.features);
    });
    return { fcAOI, all: all.features.length ? all : null };
}

function setLayerData(vectorLayer, dataFC, style) {
    if (!vectorLayer) return;
    const src = vectorLayer.getSource();
    if (!src) return;
    src.clear(true);

    if (dataFC) {
        const fc = toFC(dataFC);
        if (fc.features?.length) {
            const feats = gj.readFeatures(fc, {
                dataProjection: "EPSG:4326",
                featureProjection: "EPSG:3857",
            });
            src.addFeatures(feats);
        }
    }
    if (style) vectorLayer.setStyle(style);
}

function extentFromLayers(layers) {
    let extent = null;
    layers.forEach((lyr) => {
        const src = lyr?.getSource?.();
        if (!src) return;
        const e = src.getExtent?.();
        if (!e || !isFinite(e[0])) return;
        if (!extent) extent = e.slice();
        else {
            extent[0] = Math.min(extent[0], e[0]);
            extent[1] = Math.min(extent[1], e[1]);
            extent[2] = Math.max(extent[2], e[2]);
            extent[3] = Math.max(extent[3], e[3]);
        }
    });
    return extent;
}

// ======= Frente/Prof alinhado a ângulo =======
function measureFrenteProfAlongAngle(geom, angleDeg) {
    if (!geom) return { frente: 0, prof: 0 };

    let angRad;

    if (typeof angleDeg === "number" && isFinite(angleDeg)) {
        angRad = (angleDeg * Math.PI) / 180;
    } else {
        const type = geom.getType();
        const coords = geom.getCoordinates();
        let ring = null;

        if (type === "Polygon") ring = coords?.[0] || null;
        else if (type === "MultiPolygon") ring = coords?.[0]?.[0] || null;

        if (ring && ring.length >= 2) {
            let maxLen = -1;
            let bestAng = 0;
            for (let i = 0; i < ring.length - 1; i++) {
                const [x1, y1] = ring[i];
                const [x2, y2] = ring[i + 1];
                const dx = x2 - x1;
                const dy = y2 - y1;
                const len = Math.hypot(dx, dy);
                if (len > maxLen) {
                    maxLen = len;
                    bestAng = Math.atan2(dy, dx);
                }
            }
            angRad = bestAng;
        } else angRad = 0;
    }

    const cos = Math.cos(-angRad);
    const sin = Math.sin(-angRad);

    const flat = [];
    const pushCoord = (x, y) => {
        const xr = x * cos - y * sin;
        const yr = x * sin + y * cos;
        flat.push([xr, yr]);
    };

    const type = geom.getType();
    const coords = geom.getCoordinates();
    if (type === "Polygon") (coords?.[0] || []).forEach(([x, y]) => pushCoord(x, y));
    else if (type === "MultiPolygon") {
        (coords || []).forEach((poly) => (poly?.[0] || []).forEach(([x, y]) => pushCoord(x, y)));
    } else {
        const [minx, miny, maxx, maxy] = geom.getExtent();
        return { frente: maxx - minx, prof: maxy - miny };
    }

    let minx = +Infinity,
        maxx = -Infinity;
    let miny = +Infinity,
        maxy = -Infinity;
    for (const [x, y] of flat) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
    }

    return { frente: maxx - minx, prof: maxy - miny };
}

// ---------------- Estilos ----------------
const styleAoi = new Style({
    stroke: new Stroke({ color: "#2c7be5", width: 2 }),
    fill: new Fill({ color: "rgba(44,123,229,0.05)" }),
});
const styleAV = new Style({
    stroke: new Stroke({ color: "#007a4d", width: 2 }),
    fill: new Fill({ color: "rgba(65,214,134,0.45)" }),
});
const styleCorte = new Style({
    stroke: new Stroke({ color: "#e11d48", width: 2 }),
    fill: new Fill({ color: "rgba(252,165,165,0.35)" }),
});
const styleRuaMask = new Style({
    stroke: new Stroke({ color: "#9ca3af", width: 1 }),
    fill: new Fill({ color: "rgba(156,163,175,0.8)" }),
});
const styleRiosCL = new Style({ stroke: new Stroke({ color: "#2E86AB", width: 2 }) });
const styleRiosFx = new Style({
    stroke: new Stroke({ color: "#2E86AB", width: 2 }),
    fill: new Fill({ color: "rgba(46,134,171,0.25)" }),
});
const styleLTCL = new Style({ stroke: new Stroke({ color: "#A84300", width: 2 }) });
const styleLTFx = new Style({
    stroke: new Stroke({ color: "#A84300", width: 2 }),
    fill: new Fill({ color: "rgba(168,67,0,0.25)" }),
});
const styleFerCL = new Style({ stroke: new Stroke({ color: "#6D4C41", width: 2 }) });
const styleFerFx = new Style({
    stroke: new Stroke({ color: "#6D4C41", width: 2 }),
    fill: new Fill({ color: "rgba(109,76,65,0.25)" }),
});
const styleLoteavel = new Style({
    stroke: new Stroke({ color: "#FFB300", width: 2 }),
    fill: new Fill({ color: "rgba(255,213,79,0.22)" }),
});

const styleViasArea = new Style({
    stroke: new Stroke({ color: "#9ca3af", width: 1 }),
    fill: new Fill({ color: "rgba(156,163,175,0.8)" }),
});

function makeViasLineStyleWithLabel({
    strokeColor = "#ffffff",
    textColor = "#111827",
    haloColor = "rgba(255,255,255,0.95)",
} = {}) {
    const cache = new WeakMap();
    return (feature, resolution) => {
        const cached = cache.get(feature);
        if (cached && cached.__res === resolution) return cached.styles;

        const props = feature.getProperties ? feature.getProperties() : {};
        const numero = props.numero;
        const viaId = props.via_id ?? props.id;

        let text = "";
        if (numero != null) text = `R ${numero}`;
        else if (viaId != null) text = String(viaId);

        const styles = [
            new Style({
                stroke: new Stroke({ color: strokeColor, width: 2 }),
                text: text
                    ? new Text({
                        text,
                        font: "bold 11px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                        fill: new Fill({ color: textColor }),
                        stroke: new Stroke({ color: haloColor, width: 3 }),
                        placement: "line",
                        overflow: true,
                    })
                    : undefined,
            }),
        ];

        cache.set(feature, { __res: resolution, styles });
        return styles;
    };
}

const styleViasLineWhite = makeViasLineStyleWithLabel();

function makeQuadraStyleWithLabel({
    strokeColor = "#0ea5e9",
    textColor = "#111827",
    haloColor = "rgba(255,255,255,0.95)",
} = {}) {
    const cache = new WeakMap();
    return (feature, resolution) => {
        const cached = cache.get(feature);
        if (cached && cached.__res === resolution) return cached.styles;

        const props = feature.getProperties ? feature.getProperties() : {};
        const numero = props.numero;
        const quadraId = props.quadra_id ?? props.id;

        let text = "";
        if (numero != null) text = `Q ${numero}`;
        else if (quadraId != null) text = `Q ${quadraId}`;

        const styles = [
            new Style({
                stroke: new Stroke({ color: strokeColor, width: 2 }),
                fill: null,
                text: text
                    ? new Text({
                        text,
                        font: "bold 12px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                        fill: new Fill({ color: textColor }),
                        stroke: new Stroke({ color: haloColor, width: 3 }),
                        overflow: true,
                    })
                    : undefined,
            }),
        ];

        cache.set(feature, { __res: resolution, styles });
        return styles;
    };
}

const styleQuartBorda = makeQuadraStyleWithLabel({
    strokeColor: "#0ea5e9",
    textColor: "#0f172a",
    haloColor: "rgba(255,255,255,0.95)",
});
const styleQuartOficial = makeQuadraStyleWithLabel({
    strokeColor: "#7c3aed",
    textColor: "#1f2937",
    haloColor: "rgba(255,255,255,0.95)",
});

function makeLoteStyle({
    strokeColor,
    fillColor,
    textColor = "#111",
    haloColor = "rgba(255,255,255,0.95)",
}) {
    const cache = new WeakMap();
    return (feature, resolution) => {
        const cached = cache.get(feature);
        if (cached && cached.__res === resolution) return cached.styles;

        const styles = [
            new Style({
                stroke: new Stroke({ color: strokeColor, width: 1.5 }),
                fill: new Fill({ color: fillColor }),
            }),
        ];

        const props = feature.getProperties?.() || {};
        const lotNumber = props.numero ?? props.lot_number;
        const areaM2 = props.area_m2;
        const centerLonLat = props.label_center;
        const cornerLonLat = props.label_corner;

        const areaLabel = Number.isFinite(areaM2)
            ? areaM2 >= 1e4
                ? `${(areaM2 / 1e4).toFixed(2)} ha`
                : `${Math.round(areaM2).toLocaleString("pt-BR")} m²`
            : "";

        if (centerLonLat && centerLonLat.length === 2 && areaLabel) {
            const center3857 = fromLonLat(centerLonLat);
            styles.push(
                new Style({
                    geometry: new OLPoint(center3857),
                    text: new Text({
                        text: areaLabel,
                        font: "12px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                        fill: new Fill({ color: textColor }),
                        stroke: new Stroke({ color: haloColor, width: 3 }),
                        overflow: true,
                        offsetY: 0,
                    }),
                })
            );
        }

        if (cornerLonLat && cornerLonLat.length === 2 && lotNumber != null) {
            const corner3857 = fromLonLat(cornerLonLat);
            styles.push(
                new Style({
                    geometry: new OLPoint(corner3857),
                    text: new Text({
                        text: `#${lotNumber}`,
                        font: "bold 12px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
                        fill: new Fill({ color: textColor }),
                        stroke: new Stroke({ color: haloColor, width: 3 }),
                        overflow: true,
                        offsetX: 8,
                        offsetY: -8,
                    }),
                })
            );
        }

        cache.set(feature, { __res: resolution, styles });
        return styles;
    };
}

const styleLoteFill = makeLoteStyle({
    strokeColor: "#f59e0b",
    fillColor: "rgba(255, 213, 79, 0.35)",
    textColor: "#0b132b",
    haloColor: "rgba(255,255,255,0.95)",
});

const styleCalcada = new Style({
    stroke: new Stroke({ color: "#e5e7eb", width: 1 }),
    fill: new Fill({ color: "rgba(255,255,255,1)" }),
});

const styleSelected = new Style({
    stroke: new Stroke({ color: "#22c55e", width: 3 }),
    fill: new Fill({ color: "rgba(34,197,94,0.12)" }),
});

// Linha base (guia)
const styleLinhaBase = new Style({
    stroke: new Stroke({
        color: "#16a34a",
        width: 3,
        lineDash: [8, 6],
    }),
});

export default function ParcelamentoIA() {
    const axiosAuth = useAxios();
    const { getOrCreatePlanoForProject } = useParcelamentoApi(); // se quiser manter

    const location = useLocation();

    const mapRef = useRef(null);
    const containerRef = useRef(null);
    const wrapperRef = useRef(null);
    const baseLayersRef = useRef({});
    const layersRef = useRef({
        aoi: null,
        loteavel: null,
        av: null,
        corte: null,
        ruas_mask: null,
        rios_centerline: null,
        rios_faixa: null,
        lt_centerline: null,
        lt_faixa: null,
        ferrovias_centerline: null,
        ferrovias_faixa: null,

        prev_vias_area: null,
        prev_vias_line: null,
        prev_quarteiroes: null,
        prev_lotes: null,
        calcadas: null,

        ofc_vias_area: null,
        ofc_vias_line: null,
        ofc_quarteiroes: null,
        ofc_lotes: null,

        linha_base: null,
    });

    const [parcelOficial, setParcelOficial] = useState({
        vias_area: null,
        vias: null,
        quarteiroes: null,
        lotes: null,
        calcadas: null,
    });

    const selectRef = useRef(null);
    const modifyRef = useRef(null);
    const translateRef = useRef(null);
    const snapRefs = useRef([]);
    const drawRef = useRef(null);
    const linhaBaseDrawRef = useRef(null);

    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState("");
    const [projetoTexto, setProjetoTexto] = useState("");
    const [versoes, setVersoes] = useState([]);
    const [restricaoSel, setRestricaoSel] = useState("");
    const [geo, setGeo] = useState(null);

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [planoId, setPlanoId] = useState(null);

    // ✅ NOVO: versao stateful do parcelamento incremental
    const [parcelamentoVersaoId, setParcelamentoVersaoId] = useState(null);

    const [selState, setSelState] = useState({
        count: 0,
        kind: null,
        angle: 0,
        frente: "",
        prof: "",
    });

    const [linhaBase, setLinhaBase] = useState(null);

    // FullScreen:
    const toggleFullscreen = () => {
        const el = wrapperRef.current;
        if (!el) return;

        if (!isFullscreen) {
            if (el.requestFullscreen) {
                el.requestFullscreen().catch((err) => console.error("Erro ao entrar em fullscreen:", err));
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch((err) => console.error("Erro ao sair do fullscreen:", err));
            }
        }
    };

    // ---------------- Init Mapa ----------------
    useEffect(() => {
        if (mapRef.current) return;

        const mkMapboxStyle = (styleId) =>
            new XYZ({
                url: `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/512/{z}/{x}/{y}${hidpi ? "@2x" : ""
                    }?access_token=${token}`,
                tileSize: 512,
                maxZoom: 22,
            });

        const bases = {};
        if (token) {
            bases["mapbox-hibrido"] = new TileLayer({
                visible: true,
                zIndex: 0,
                source: mkMapboxStyle("satellite-streets-v12"),
            });
            bases["mapbox-ruas"] = new TileLayer({
                visible: false,
                zIndex: 0,
                source: mkMapboxStyle("streets-v12"),
            });
            bases["mapbox-sat"] = new TileLayer({
                visible: false,
                zIndex: 0,
                source: mkMapboxStyle("satellite-v9"),
            });
        }
        bases["esri"] = new TileLayer({
            visible: !token,
            zIndex: 0,
            source: new XYZ({
                url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            }),
        });
        bases["osm"] = new TileLayer({
            visible: false,
            zIndex: 0,
            source: new XYZ({
                url: "https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            }),
        });
        baseLayersRef.current = bases;

        const mkVec = (z, style) =>
            new VectorLayer({
                zIndex: z,
                source: new VectorSource(),
                style,
            });

        const L = layersRef.current;
        // dados base
        L.aoi = mkVec(520, styleAoi);
        L.loteavel = mkVec(597, styleLoteavel);
        L.av = mkVec(580, styleAV);
        L.corte = mkVec(585, styleCorte);
        L.ruas_mask = mkVec(590, styleRuaMask);
        L.rios_centerline = mkVec(595, styleRiosCL);
        L.rios_faixa = mkVec(595, styleRiosFx);
        L.lt_centerline = mkVec(596, styleLTCL);
        L.lt_faixa = mkVec(596, styleLTFx);
        L.ferrovias_centerline = mkVec(597, styleFerCL);
        L.ferrovias_faixa = mkVec(597, styleFerFx);

        // prévias
        L.prev_vias_area = mkVec(609, styleViasArea);
        L.prev_vias_line = mkVec(610, styleViasLineWhite);
        L.prev_quarteiroes = mkVec(611, styleQuartBorda);
        L.prev_lotes = new VectorLayer({
            zIndex: 612,
            source: new VectorSource(),
            style: makeLoteStyle({
                strokeColor: "#f59e0b",
                fillColor: "rgba(255, 213, 79, 0.35)",
                textColor: "#0b132b",
                haloColor: "rgba(255,255,255,0.95)",
            }),
            declutter: true,
            renderBuffer: 100,
        });

        // oficiais
        L.ofc_vias_area = mkVec(613, styleViasArea);
        L.ofc_vias_line = mkVec(614, styleViasLineWhite);
        L.ofc_quarteiroes = mkVec(615, styleQuartOficial);
        L.ofc_lotes = new VectorLayer({
            zIndex: 616,
            source: new VectorSource(),
            style: makeLoteStyle({
                strokeColor: "#7c3aed",
                fillColor: "rgba(124,58,237,0.18)",
                textColor: "#1f2937",
                haloColor: "rgba(255,255,255,0.95)",
            }),
            declutter: true,
            renderBuffer: 100,
        });

        // calcadas (prévia e/ou oficial)
        L.calcadas = mkVec(621, styleCalcada);

        // linha base (guia)
        L.linha_base = new VectorLayer({
            zIndex: 606,
            source: new VectorSource(),
            style: styleLinhaBase,
        });

        const map = new Map({
            target: containerRef.current,
            layers: [...Object.values(bases), ...Object.values(L)],
            view: new View({
                center: fromLonLat([-55, -14]),
                zoom: 4,
                maxZoom: 22,
            }),
            controls: defaultControls({ attribution: true }).extend([
                new Zoom(),
                new Rotate(),
                new ScaleLine(),
                new MousePosition({
                    coordinateFormat: createStringXY(5),
                    projection: "EPSG:4326",
                    className: "mousepos bg-white/80 px-2 py-1 rounded text-xs",
                }),
                new Attribution(),
            ]),
        });

        mapRef.current = map;

        const recreateInteractions = (mode) => {
            if (!mapRef.current) return;
            const map = mapRef.current;

            if (selectRef.current) map.removeInteraction(selectRef.current);
            if (modifyRef.current) map.removeInteraction(modifyRef.current);
            if (translateRef.current) map.removeInteraction(translateRef.current);
            if (drawRef.current) {
                map.removeInteraction(drawRef.current);
                drawRef.current = null;
            }
            if (linhaBaseDrawRef.current) {
                map.removeInteraction(linhaBaseDrawRef.current);
                linhaBaseDrawRef.current = null;
            }
            snapRefs.current.forEach((s) => map.removeInteraction(s));
            snapRefs.current = [];

            const Lx = layersRef.current;

            const allowPreview = (lyr) =>
                lyr === Lx.prev_vias_area ||
                lyr === Lx.prev_vias_line ||
                lyr === Lx.prev_quarteiroes ||
                lyr === Lx.prev_lotes ||
                lyr === Lx.calcadas ||
                lyr === Lx.linha_base;

            const layersFilter = (lyr) => allowPreview(lyr) || lyr === Lx.aoi;

            selectRef.current = new Select({
                condition: clickSelectCondition,
                hitTolerance: 12,
                multi: false,
                layers: layersFilter,
                style: styleSelected,
            });
            map.addInteraction(selectRef.current);

            selectRef.current.on("select", (evt) => {
                const f = evt.selected?.[0] || null;
                if (!f) {
                    setSelState({ count: 0, kind: null, angle: 0, frente: "", prof: "" });
                    return;
                }
                const g = f.getGeometry?.();
                const kindGuess =
                    f.get("kind") || (g?.getType?.() === "Polygon" ? "lote" : "quarteirao");

                const angleDegProp = f.get("angle_deg");
                const m = g ? measureFrenteProfAlongAngle(g, angleDegProp) : { frente: 0, prof: 0 };

                setSelState({
                    count: 1,
                    kind: kindGuess,
                    angle: angleDegProp || 0,
                    frente: (m.frente || 0).toFixed(2),
                    prof: (m.prof || 0).toFixed(2),
                });
            });

            modifyRef.current = new Modify({
                features: selectRef.current.getFeatures(),
                pixelTolerance: 10,
                condition: primaryAction,
                insertVertexCondition: altKeyOnly,
                deleteCondition: platformModifierKeyOnly,
                style: new Style({
                    image: new CircleStyle({
                        radius: 6,
                        fill: new Fill({ color: "#fff" }),
                        stroke: new Stroke({ color: "#0ea5e9", width: 2 }),
                    }),
                    stroke: new Stroke({ color: "#0ea5e9", width: 2 }),
                }),
            });
            map.addInteraction(modifyRef.current);

            translateRef.current = new Translate({
                features: selectRef.current.getFeatures(),
                condition: (e) => !!e.originalEvent?.shiftKey,
            });
            map.addInteraction(translateRef.current);

            if (mode === "lotes" || mode === "quarteiroes") {
                const Lx2 = layersRef.current;
                const target = mode === "lotes" ? Lx2.prev_lotes : Lx2.prev_quarteiroes;

                const draw = new Draw({
                    source: target.getSource(),
                    type: "Polygon",
                    condition: noModifierKeys,
                    style: new Style({
                        stroke: new Stroke({ color: "#2563eb", width: 2 }),
                        fill: new Fill({ color: "rgba(37,99,235,0.15)" }),
                        image: new CircleStyle({ radius: 4, fill: new Fill({ color: "#2563eb" }) }),
                    }),
                    stopClick: true,
                });

                draw.on("drawend", (evt) => {
                    const feat = evt.feature;
                    feat.setProperties({ id: target.getSource().getFeatures().length });
                });

                map.addInteraction(draw);
                drawRef.current = draw;
            }

            [
                layersRef.current.prev_lotes,
                layersRef.current.prev_quarteiroes,
                layersRef.current.calcadas,
                layersRef.current.aoi,
                layersRef.current.prev_vias_area,
                layersRef.current.prev_vias_line,
                layersRef.current.linha_base,
            ]
                .filter(Boolean)
                .forEach((lyr) => {
                    const s = new Snap({ source: lyr.getSource() });
                    map.addInteraction(s);
                    snapRefs.current.push(s);
                });
        };

        mapRef.current.__recreateInteractions = recreateInteractions;
        recreateInteractions("none");

        // 👇 função para desenhar linha base (reta)
        mapRef.current.__startLinhaBaseDraw = () => {
            const map = mapRef.current;
            if (!map) return;
            const Lx = layersRef.current;
            const src = Lx.linha_base.getSource();
            src.clear(true);
            setLinhaBase(null);

            if (linhaBaseDrawRef.current) {
                map.removeInteraction(linhaBaseDrawRef.current);
                linhaBaseDrawRef.current = null;
            }

            const drawLB = new Draw({
                source: src,
                type: "LineString",
                maxPoints: 2,
            });

            drawLB.on("drawend", (evt) => {
                const feat = evt.feature;
                const gjFeature = gj.writeFeatureObject(feat, {
                    dataProjection: "EPSG:4326",
                    featureProjection: "EPSG:3857",
                });
                setLinhaBase(gjFeature);
                map.removeInteraction(drawLB);
                linhaBaseDrawRef.current = null;
            });

            map.addInteraction(drawLB);
            linhaBaseDrawRef.current = drawLB;
        };

        const onKeyDownGlobal = (ev) => {
            const tag = ev.target?.tagName ? ev.target.tagName.toLowerCase() : "";
            const typing = tag === "input" || tag === "textarea" || ev.target?.isContentEditable;
            if (typing) return;

            const map = mapRef.current;

            if (ev.key === "Enter") {
                if (drawRef.current) {
                    ev.preventDefault();
                    try {
                        drawRef.current.finishDrawing();
                    } catch (e) {
                        console.error("[finishDrawing] erro:", e);
                    }
                    return;
                }
            }

            if (ev.key === "Escape" || ev.key === "Backspace" || ev.key === "Delete") {
                if (drawRef.current && map) {
                    ev.preventDefault();
                    try {
                        drawRef.current.abortDrawing?.();
                    } catch (e) {
                        console.error("[abortDrawing] erro:", e);
                    }
                    map.removeInteraction(drawRef.current);
                    drawRef.current = null;
                    return;
                }
                if (linhaBaseDrawRef.current && map) {
                    ev.preventDefault();
                    try {
                        linhaBaseDrawRef.current.abortDrawing?.();
                    } catch (e) {
                        console.error("[abortLinhaBase] erro:", e);
                    }
                    map.removeInteraction(linhaBaseDrawRef.current);
                    linhaBaseDrawRef.current = null;
                    return;
                }
            }

            if (ev.key !== "Delete" && ev.key !== "Backspace") return;

            const sel = selectRef.current?.getFeatures?.();
            if (!sel || sel.getLength() === 0) return;

            const Lx = layersRef.current;
            sel.forEach((f) => {
                [
                    Lx.prev_lotes.getSource(),
                    Lx.prev_quarteiroes.getSource(),
                    Lx.calcadas.getSource(),
                    Lx.aoi.getSource(),
                    Lx.linha_base.getSource(),
                ].forEach((s) => {
                    if (s.hasFeature(f)) s.removeFeature(f);
                });
            });
            sel.clear();
            setSelState({ count: 0, kind: null, angle: 0, frente: "", prof: "" });
        };

        window.addEventListener("keydown", onKeyDownGlobal);

        return () => {
            window.removeEventListener("keydown", onKeyDownGlobal);
            mapRef.current?.setTarget(null);
            mapRef.current = null;
        };
    }, []);

    const [baseSel, setBaseSel] = useState(token ? "mapbox-hibrido" : "esri");

    // Vias
    const [showViasPanel, setShowViasPanel] = useState(false);
    const [viasSugestoes, setViasSugestoes] = useState([]); // ranked[]
    const [viasBest, setViasBest] = useState(null);         // best

    // ✅ parâmetros gerais (separado das vias)
    const [paramsGerais, setParamsGerais] = useState({
        frente_min_m: 10,
        prof_min_m: 25,
        area_lote_m2: 250,
        calcada_largura_m: 2.5,
    });

    // ✅ parâmetros de vias (fica no ViasPanel)
    const [paramsVias, setParamsVias] = useState({
        larg_rua_vert_m: 8,
        larg_rua_horiz_m: 8,
        // futuramente:
        // canteiro_m: 2.0,
        // tipo_via: "local",
    });



    useEffect(() => {
        const bases = baseLayersRef.current;
        Object.entries(bases).forEach(([k, lyr]) => lyr.setVisible(k === baseSel));
    }, [baseSel]);

    const [editTarget, setEditTarget] = useState("none"); // none|lotes|quarteiroes
    useEffect(() => {
        mapRef.current?.__recreateInteractions?.(editTarget);
        try {
            mapRef.current?.renderSync?.();
        } catch { }
    }, [editTarget]);

    // carregar projetos
    useEffect(() => {
        (async () => {
            try {
                const { data } = await axiosAuth.get("projetos/");
                setProjetos(data || []);
            } catch (e) {
                console.error("[fetch projetos] erro:", e?.message || e);
                alert("Erro ao carregar projetos (faça login).");
            }
        })();
    }, []);

    useEffect(() => {
        setVersoes([]);
        setRestricaoSel("");
        setGeo(null);
        setPlanoId(null);

        // ✅ reseta o incremental sempre que trocar de projeto
        setParcelamentoVersaoId(null);

        setParcelOficial({
            vias_area: null,
            vias: null,
            quarteiroes: null,
            lotes: null,
            calcadas: null,
        });

        // limpa prévias
        const L = layersRef.current;
        setLayerData(L.prev_quarteiroes, null, styleQuartBorda);
        setLayerData(L.prev_lotes, null, styleLoteFill);
        setLayerData(L.calcadas, null, styleCalcada);
        setLayerData(L.linha_base, null, styleLinhaBase);
        setLinhaBase(null);

        if (!projetoSel) return;

        (async () => {
            try {
                const { data } = await axiosAuth.get(`/projetos/${projetoSel}/restricoes/list/`);
                setVersoes(data || []);
            } catch (e) {
                console.error("[listar versões] erro:", e?.message || e);
                alert("Erro ao listar versões.");
            }
            try {
                const plano = await getOrCreatePlanoForProject(projetoSel);
                setPlanoId(plano?.id || null);
            } catch (e) {
                console.error("[parcelamento] plano erro:", e?.message || e);
            }
        })();
    }, [projetoSel]);

    useEffect(() => {
        if (!projetoSel) {
            setProjetoTexto("");
            return;
        }
        const proj = projetos.find((p) => p.id === Number(projetoSel));
        if (proj) setProjetoTexto(proj.name || `Projeto #${proj.id}`);
    }, [projetoSel, projetos]);

    useEffect(() => {
        // ✅ ao trocar de restrição, zera o stateful e limpa prévias
        setGeo(null);
        setParcelamentoVersaoId(null);

        const L = layersRef.current;
        setLayerData(L.prev_quarteiroes, null, styleQuartBorda);
        setLayerData(L.prev_lotes, null, styleLoteFill);
        setLayerData(L.calcadas, null, styleCalcada);

        if (!restricaoSel) return;

        const ac = new AbortController();
        (async () => {
            try {
                const { data } = await axiosAuth.get(`/restricoes/${restricaoSel}/geo/`, { signal: ac.signal });
                setGeo(data);
            } catch (e) {
                if (e?.name === "CanceledError" || e?.message === "canceled") return;
                console.error("[abrir versão] erro:", e?.message || e);
                alert("Não foi possível abrir a versão.");
            }
        })();

        return () => ac.abort();
    }, [restricaoSel]);

    useEffect(() => {
        const L = layersRef.current;
        if (!mapRef.current) return;

        setLayerData(
            L.aoi,
            (geo?.aoi || geo?.aoi_snapshot) && {
                type: "FeatureCollection",
                features: [{ type: "Feature", properties: {}, geometry: geo?.aoi || geo?.aoi_snapshot }],
            }
        );
        setLayerData(L.av, toFC(geo?.av), styleAV);
        setLayerData(L.corte, toFC(geo?.corte_av), styleCorte);
        setLayerData(L.ruas_mask, toFC(geo?.ruas_mask), styleRuaMask);
        setLayerData(L.rios_centerline, toFC(geo?.rios_centerline), styleRiosCL);
        setLayerData(L.rios_faixa, toFC(geo?.rios_faixa), styleRiosFx);
        setLayerData(L.lt_centerline, toFC(geo?.lt_centerline), styleLTCL);
        setLayerData(L.lt_faixa, toFC(geo?.lt_faixa), styleLTFx);
        setLayerData(L.ferrovias_centerline, toFC(geo?.ferrovias_centerline), styleFerCL);
        setLayerData(L.ferrovias_faixa, toFC(geo?.ferrovias_faixa), styleFerFx);
        setLayerData(L.loteavel, toFC(geo?.area_loteavel), styleLoteavel);

        const { fcAOI, all } = buildFCsForFit(geo);
        const tempAoi = new VectorLayer({ source: new VectorSource() });
        const tempAll = new VectorLayer({ source: new VectorSource() });
        setLayerData(tempAoi, fcAOI, null);
        setLayerData(tempAll, all, null);

        let ext = extentFromLayers([tempAoi]);
        if (!ext) ext = extentFromLayers([tempAll]);
        if (ext) {
            try {
                mapRef.current.getView().fit(ext, {
                    padding: [30, 30, 30, 30],
                    maxZoom: 19,
                    duration: 250,
                });
                setTimeout(() => {
                    mapRef.current.getView().fit(ext, {
                        padding: [30, 30, 30, 30],
                        maxZoom: 19,
                        duration: 0,
                    });
                }, 120);
            } catch { }
        }
    }, [geo]);

    useEffect(() => {
        const L = layersRef.current;
        setLayerData(L.ofc_vias_area, toFC(parcelOficial.vias_area), styleViasArea);
        setLayerData(L.ofc_vias_line, toFC(parcelOficial.vias), styleViasLineWhite);
        setLayerData(L.ofc_quarteiroes, toFC(parcelOficial.quarteiroes), styleQuartOficial);
        setLayerData(
            L.ofc_lotes,
            toFC(parcelOficial.lotes),
            makeLoteStyle({
                strokeColor: "#7c3aed",
                fillColor: "rgba(124,58,237,0.18)",
                textColor: "#1f2937",
                haloColor: "rgba(255,255,255,0.95)",
            })
        );
        setLayerData(L.calcadas, toFC(parcelOficial.calcadas), styleCalcada);
    }, [parcelOficial]);

    useEffect(() => {
        const handler = () => {
            const el = wrapperRef.current;
            setIsFullscreen(!!el && document.fullscreenElement === el);
        };
        document.addEventListener("fullscreenchange", handler);
        return () => document.removeEventListener("fullscreenchange", handler);
    }, []);

    useEffect(() => {
        const st = location.state;
        if (!st?.projetoId) return;
        const pid = Number(st.projetoId);
        if (Number.isFinite(pid)) setProjetoSel(pid);
    }, [location.state]);

    useEffect(() => {
        const st = location.state;
        if (!st?.restricoesId || !projetoSel) return;
        const rid = Number(st.restricoesId);
        if (Number.isFinite(rid)) setRestricaoSel(rid);
    }, [location.state, projetoSel]);

    // ✅ callback da prévia incremental: desenha quarteirões + calçadas (acumulado)
    const handlePreviewFromBlocos = (result) => {
        const L = layersRef.current;

        setLayerData(L.prev_quarteiroes, toFC(result?.quarteiroes), styleQuartBorda);
        setLayerData(L.calcadas, toFC(result?.calcadas), styleCalcada);

        // sem lotes por enquanto (limpa camada)
        setLayerData(L.prev_lotes, null, styleLoteFill);

        console.log("[incremental] versao_id:", result?.versao_id);
        console.log("[incremental] metrics:", result?.metrics);
        console.log("[incremental] debug:", result?.debug);
    };

    const applyViasSuggestionToMap = (suggestion) => {
        const L = layersRef.current;

        // ✅ Se vier no formato novo (best.preview), usa ele
        const preview = suggestion?.preview || null;

        // ✅ legado (urbanismo/roads)
        const maskFC = toFC(suggestion?.roads_mask_fc);
        const axisFC = toFC(suggestion?.roads_axis_fc);

        // ✅ novo (parcelamento)
        const viasAreaFC = toFC(preview?.vias_area);
        const viasLineFC = toFC(preview?.vias);
        const quarteiroesFC = toFC(preview?.quarteiroes);
        const calcadasFC = toFC(preview?.calcadas);
        const areasVaziasFC = toFC(preview?.areas_vazias);

        console.log("[vias] apply:", {
            id: suggestion?.id,
            hasLegacy: !!(suggestion?.roads_mask_fc || suggestion?.roads_axis_fc),
            hasPreview: !!preview,
            counts: {
                legacy_mask: (maskFC?.features || []).length,
                legacy_axis: (axisFC?.features || []).length,
                prev_vias_area: (viasAreaFC?.features || []).length,
                prev_vias: (viasLineFC?.features || []).length,
                prev_quarteiroes: (quarteiroesFC?.features || []).length,
                prev_calcadas: (calcadasFC?.features || []).length,
                prev_vazios: (areasVaziasFC?.features || []).length,
            },
            layersReady: {
                prev_vias_area: !!L.prev_vias_area,
                prev_vias_line: !!L.prev_vias_line,
                prev_quarteiroes: !!L.prev_quarteiroes,
                calcadas: !!L.calcadas,
            },
        });

        // 🔥 Se as layers ainda não existem, isso explica “não acontece nada”
        if (!L.prev_vias_area || !L.prev_vias_line) {
            console.warn("[vias] layers de prévia não inicializadas (prev_vias_area/prev_vias_line).");
            return;
        }

        // 1) desenha legado (se existir)
        if ((maskFC?.features || []).length) setLayerData(L.prev_vias_area, maskFC, styleViasArea);
        if ((axisFC?.features || []).length) setLayerData(L.prev_vias_line, axisFC, styleViasLineWhite);

        // 2) desenha novo (se existir) — sobrepõe o legado
        if ((viasAreaFC?.features || []).length) setLayerData(L.prev_vias_area, viasAreaFC, styleViasArea);
        if ((viasLineFC?.features || []).length) setLayerData(L.prev_vias_line, viasLineFC, styleViasLineWhite);

        if (L.prev_quarteiroes && (quarteiroesFC?.features || []).length) {
            setLayerData(L.prev_quarteiroes, quarteiroesFC, styleQuartBorda);
        }
        if (L.calcadas && (calcadasFC?.features || []).length) {
            setLayerData(L.calcadas, calcadasFC, styleCalcada);
        }

        // Se você criar uma layer p/ vazios depois, pluga aqui:
        // if (L.prev_areas_vazias) setLayerData(L.prev_areas_vazias, areasVaziasFC, styleVazios);

        console.log("[vias] applied OK:", suggestion?.id);
    };



    return (
        <div ref={wrapperRef} className="w-full h-full relative">
            {/* Barra superior: projetos / versões / base */}
            <div className="absolute z-[1000] top-2 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur rounded-xl shadow p-3 flex flex-wrap gap-2 items-center">
                <input
                    list="lista-projetos"
                    className="border p-2 rounded min-w-[260px]"
                    value={projetoTexto}
                    onChange={(e) => {
                        const v = e.target.value;
                        setProjetoTexto(v);

                        const proj = projetos.find((p) => (p.name || `Projeto #${p.id}`) === v);
                        if (proj) setProjetoSel(proj.id);
                        else setProjetoSel("");
                    }}
                    placeholder="Selecione um projeto…"
                />
                <datalist id="lista-projetos">
                    {projetos.map((p) => (
                        <option key={p.id} value={p.name || `Projeto #${p.id}`} />
                    ))}
                </datalist>

                <select
                    className="border p-2 rounded min-w-[260px]"
                    value={restricaoSel || ""}
                    onChange={(e) => setRestricaoSel(Number(e.target.value) || "")}
                    disabled={!versoes.length}
                >
                    <option value="">{versoes.length ? "Selecione uma versão…" : "Sem versões"}</option>
                    {versoes.map((v) => (
                        <option key={v.id} value={v.id}>
                            v{v.version} {v.label ? `— ${v.label}` : ""} {v.is_active ? "(ativa)" : ""}
                        </option>
                    ))}
                </select>

                <select
                    className="border p-2 rounded"
                    value={baseSel}
                    onChange={(e) => setBaseSel(e.target.value)}
                    title="Mapa base"
                >
                    {token && <option value="mapbox-hibrido">Mapbox Híbrido</option>}
                    {token && <option value="mapbox-ruas">Mapbox Ruas</option>}
                    {token && <option value="mapbox-sat">Mapbox Satélite</option>}
                    <option value="esri">Esri World Imagery</option>
                    <option value="osm">OSM (Ruas)</option>
                </select>
            </div>

            {/* Botão Fullscreen */}
            <button
                type="button"
                onClick={toggleFullscreen}
                className="absolute z-[1100] top-2 right-2 bg-white/90 backdrop-blur rounded-sm border border-slate-300 shadow-md w-10 h-10 text-lg flex items-center justify-center hover:shadow-lg hover:bg-slate-50 transition"
                title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            >
                {isFullscreen ? (
                    <Shrink className="w-5 h-5 text-slate-800" />
                ) : (
                    <Expand className="w-5 h-5 text-slate-800" />
                )}
            </button>

            <button
                type="button"
                onClick={() => setShowViasPanel(v => !v)}
                className="absolute z-[1100] top-16 left-2 bg-white/90 backdrop-blur rounded-lg border border-slate-300 shadow-md px-3 py-2 text-sm font-semibold hover:bg-slate-50 transition"
                title="Gerar e visualizar sugestões de malha viária"
            >
                Gerar Vias
            </button>

            <div className="absolute z-[1200] top-28 right-2 flex flex-col gap-2">
                <ParametrosGeraisPanel value={paramsGerais} onChange={setParamsGerais} />
            </div>


            {/* Painel de BLOCOS incremental */}
            {/* <div className="absolute z-[1000] top-28 left-2 bg-white/90 backdrop-blur rounded-xl shadow p-3 w-[420px] max-h-[80vh] overflow-y-auto">
                <h3 className="font-semibold mb-2">Quarteirões + Calçadas (incremental)</h3>

                <button
                    type="button"
                    onClick={() => mapRef.current?.__startLinhaBaseDraw?.()}
                    className="mb-2 px-3 py-1.5 rounded border border-emerald-600 text-emerald-700 text-xs hover:bg-emerald-50"
                >
                    Desenhar linha base no mapa
                </button>

                <ParcelamentoBlocosPanel
                    restricoesId={restricaoSel}
                    versaoId={parcelamentoVersaoId}
                    setVersaoId={setParcelamentoVersaoId}
                    alFeature={
                        geo?.area_loteavel?.features?.[0] ||
                        (geo?.aoi && { type: "Feature", geometry: geo?.aoi, properties: {} })
                    }
                    linhaBase={linhaBase}
                    onPreviewBlocos={handlePreviewFromBlocos}
                />

                <div className="text-[11px] text-gray-600 mt-2 leading-5">
                    Fluxo atual: gera <strong>quarteirões + calçadas</strong> de forma{" "}
                    <strong>incremental/stateful</strong>, sempre ancorado na{" "}
                    <strong>restrição selecionada</strong>. O ID da versão fica salvo no estado e
                    você pode continuar gerando o próximo bloco.
                </div>
            </div> */}

            {showViasPanel && (
                <div className="absolute z-[1200] top-28 left-2">
                    <ViasPanel
                        restricoesId={restricaoSel}
                        alFeature={
                            geo?.area_loteavel?.features?.[0] ||
                            (geo?.aoi && { type: "Feature", geometry: geo?.aoi, properties: {} })
                        }
                        linhaBase={linhaBase}
                        // ✅ NOVO: parâmetros gerais (lote/calcada) ficam fora do ViasPanel
                        paramsGerais={paramsGerais}
                        setParamsGerais={setParamsGerais}
                        // ✅ NOVO: parâmetros de vias separados (larguras etc.)
                        paramsVias={paramsVias}
                        setParamsVias={setParamsVias}
                        // (mantém os callbacks que você já usa)
                        onPickSuggestion={(sug) => {
                            if (!sug) return;
                            // sug pode ser: { preview: {...} } (novo) ou item compat (ranked/best)
                            applyViasSuggestionToMap(sug?.preview ? sug : { id: sug?.id || "picked", preview: sug });
                        }}

                        onLoaded={(payload) => {
                            console.log("[vias] onLoaded payload keys:", payload ? Object.keys(payload) : payload);

                            // ✅ Caso 1: payload já é preview do parcelamento
                            const isPreview =
                                payload && typeof payload === "object" &&
                                (payload.vias || payload.vias_area || payload.quarteiroes || payload.calcadas);

                            if (isPreview) {
                                // limpa ranked/best (não existe nesse formato)
                                setViasBest(null);
                                setViasSugestoes([]);

                                // ✅ aplica direto no mapa (embrulha em {preview: ...} pra reutilizar sua função)
                                applyViasSuggestionToMap({ id: "preview_direct", preview: payload });
                                return;
                            }

                            // ✅ Caso 2: payload é o formato antigo { ranked, best }
                            console.log("[vias] onLoaded best?", !!payload?.best, "ranked len:", payload?.ranked?.length);

                            setViasBest(payload?.best || null);
                            setViasSugestoes(payload?.ranked || []);

                            const best = payload?.best || payload?.ranked?.[0] || null;
                            if (!best) {
                                console.warn("[vias] sem best nem ranked[0]. Nada a aplicar.");
                                return;
                            }

                            applyViasSuggestionToMap(best);
                        }}


                        onClose={() => setShowViasPanel(false)}
                    />

                </div>
            )}


            {/* Mapa */}
            <div ref={containerRef} style={{ height: "100vh", width: "100%" }} />
        </div>
    );
}
