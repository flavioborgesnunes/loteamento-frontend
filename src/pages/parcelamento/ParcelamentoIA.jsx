// src/pages/parcelamento/ParcelamentoIA.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import useAxios from "../../utils/useAxios";
import useParcelamentoApi from "./parcelamento";
import ParcelamentoIAPanel from "./ParcelamentoIAPanel";

import { Expand, Shrink } from "lucide-react";

// (IMPORTS do OpenLayers iguais ao Parcelamento.jsx)
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
    FullScreen,
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
    const aoiGeom = geo?.area_loteavel?.features?.[0]?.geometry || geo?.aoi || geo?.aoi_snapshot || null;
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

function writeLayerAsFC(layer) {
    if (!layer) return { type: "FeatureCollection", features: [] };
    const src = layer.getSource?.();
    if (!src) return { type: "FeatureCollection", features: [] };
    const feats = src.getFeatures?.() || [];
    if (!feats.length) return { type: "FeatureCollection", features: [] };
    const fc = gj.writeFeaturesObject(feats, {
        dataProjection: "EPSG:4326",
        featureProjection: "EPSG:3857",
    });
    return toFC(fc);
}

// ======= Frente/Prof alinhado a ângulo =======
function measureFrenteProfAlongAngle(geom, angleDeg) {
    if (!geom) return { frente: 0, prof: 0 };

    let angRad;

    if (typeof angleDeg === "number" && isFinite(angleDeg)) {
        // usa o ângulo informado
        angRad = (angleDeg * Math.PI) / 180;
    } else {
        // descobre o ângulo pela maior aresta do anel externo
        const type = geom.getType();
        const coords = geom.getCoordinates();
        let ring = null;

        if (type === "Polygon") {
            ring = coords?.[0] || null;
        } else if (type === "MultiPolygon") {
            ring = coords?.[0]?.[0] || null;
        }

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
        } else {
            angRad = 0;
        }
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
    if (type === "Polygon") {
        (coords?.[0] || []).forEach(([x, y]) => pushCoord(x, y));
    } else if (type === "MultiPolygon") {
        (coords || []).forEach((poly) =>
            (poly?.[0] || []).forEach(([x, y]) => pushCoord(x, y))
        );
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

    return {
        frente: maxx - minx,
        prof: maxy - miny,
    };
}

// Transforma o polígono em um retângulo alinhado ao ângulo desejado,
// com frente = newFrente e prof = newProf, centrado no lote atual.
// OBS: parâmetro anchor não é usado (não fixamos frente/fundo).
function applyFrenteProfLocalScale(feature, angleDeg, newFrente, newProf, anchor = "frente") {
    const g = feature?.getGeometry?.();
    if (!g || g.getType?.() !== "Polygon") return false;

    const nf = Number(newFrente);
    const np = Number(newProf);
    if (!isFinite(nf) || nf <= 0 || !isFinite(np) || np <= 0) return false;

    // anel externo
    let ring = g.getCoordinates()?.[0] || [];
    if (ring.length < 4) return false;

    // tira ponto repetido final
    const [fx, fy] = ring[0];
    const [lx, ly] = ring[ring.length - 1];
    if (fx === lx && fy === ly) {
        ring = ring.slice(0, -1);
    }

    // centro em coordenadas originais
    let cx = 0,
        cy = 0;
    ring.forEach(([x, y]) => {
        cx += x;
        cy += y;
    });
    cx /= ring.length;
    cy /= ring.length;

    // ângulo: usa o informado ou estima pela maior aresta
    let angRad;
    if (!angleDeg || !isFinite(angleDeg)) {
        let maxLen = -1,
            bestAng = 0;
        for (let i = 0; i < ring.length; i++) {
            const [x1, y1] = ring[i];
            const [x2, y2] = ring[(i + 1) % ring.length];
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            if (len > maxLen) {
                maxLen = len;
                bestAng = Math.atan2(dy, dx);
            }
        }
        angRad = bestAng;
    } else {
        angRad = (Number(angleDeg) * Math.PI) / 180;
    }

    // base ortonormal: u = frente, v = profundidade (perpendicular)
    const cosA = Math.cos(angRad);
    const sinA = Math.sin(angRad);
    const ux = cosA,
        uy = sinA; // direção da frente
    const vx = -sinA,
        vy = cosA; // direção da profundidade

    // leva todos os pontos para o frame local (F,P)
    const local = ring.map(([x, y]) => {
        const rx = x - cx;
        const ry = y - cy;
        const f = rx * ux + ry * uy; // coordenada ao longo da frente
        const p = rx * vx + ry * vy; // coordenada ao longo da profundidade
        return { f, p };
    });

    // mede frente/prof atuais nesse frame
    let minF = +Infinity,
        maxF = -Infinity;
    let minP = +Infinity,
        maxP = -Infinity;
    for (const pt of local) {
        if (pt.f < minF) minF = pt.f;
        if (pt.f > maxF) maxF = pt.f;
        if (pt.p < minP) minP = pt.p;
        if (pt.p > maxP) maxP = pt.p;
    }
    const curFrente = maxF - minF;
    const curProf = maxP - minP;
    if (curFrente <= 0 || curProf <= 0) return false;

    // fatores de escala apenas no frame local
    const sF = nf / curFrente; // escala na frente
    const sP = np / curProf; // escala na profundidade

    // centro em F,P (para manter o centro fixo)
    const cF = (minF + maxF) / 2;
    const cP = (minP + maxP) / 2;

    // aplica escala anisotrópica no frame local e volta p/ mundo
    const newRing = local.map(({ f, p }) => {
        const f2 = cF + (f - cF) * sF;
        const p2 = cP + (p - cP) * sP;

        // volta para XY
        const rx = f2 * ux + p2 * vx;
        const ry = f2 * uy + p2 * vy;
        const x = cx + rx;
        const y = cy + ry;
        return [x, y];
    });

    // fecha polígono
    newRing.push(newRing[0]);

    try {
        g.setCoordinates([newRing]);
        feature.set("angle_deg", (angRad * 180) / Math.PI);
        feature.changed?.();
        return true;
    } catch (e) {
        console.error("[applyFrenteProfLocalScale] erro ao setar coords:", e);
        return false;
    }
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
const styleRiosCL = new Style({
    stroke: new Stroke({ color: "#2E86AB", width: 2 }),
});
const styleRiosFx = new Style({
    stroke: new Stroke({ color: "#2E86AB", width: 2 }),
    fill: new Fill({ color: "rgba(46,134,171,0.25)" }),
});
const styleLTCL = new Style({
    stroke: new Stroke({ color: "#A84300", width: 2 }),
});
const styleLTFx = new Style({
    stroke: new Stroke({ color: "#A84300", width: 2 }),
    fill: new Fill({ color: "rgba(168,67,0,0.25)" }),
});
const styleFerCL = new Style({
    stroke: new Stroke({ color: "#6D4C41", width: 2 }),
});
const styleFerFx = new Style({
    stroke: new Stroke({ color: "#6D4C41", width: 2 }),
    fill: new Fill({ color: "rgba(109,76,65,0.25)" }),
});
const styleLoteavel = new Style({
    stroke: new Stroke({ color: "#FFB300", width: 2 }),
    fill: new Fill({ color: "rgba(255,213,79,0.22)" }),
});

// VIAS NOVAS — Áreas cinza e Eixos brancos
const styleViasArea = new Style({
    stroke: new Stroke({ color: "#9ca3af", width: 1 }),
    fill: new Fill({ color: "rgba(156,163,175,0.8)" }),
});
const styleViasLineWhite = new Style({
    stroke: new Stroke({ color: "#ffffff", width: 2 }),
});

// QUARTEIRÕES: borda azul
const styleQuartBorda = new Style({
    stroke: new Stroke({ color: "#0ea5e9", width: 2 }),
    fill: null,
});

// LOTES (preenchido amarelo + labels)
function makeLoteStyle({ strokeColor, fillColor, textColor = "#111", haloColor = "rgba(255,255,255,0.95)" }) {
    const cache = new WeakMap();
    return (feature, resolution) => {
        const cached = cache.get(feature);
        if (cached && cached.__res === resolution) return cached.styles;

        const styles = [];
        styles.push(
            new Style({
                stroke: new Stroke({ color: strokeColor, width: 1.5 }),
                fill: new Fill({ color: fillColor }),
            })
        );

        const props = feature.getProperties?.() || {};
        const lotNumber = props.numero ?? props.lot_number
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

// CALÇADAS
const styleCalcada = new Style({
    stroke: new Stroke({ color: "#e5e7eb", width: 1 }),
    fill: new Fill({ color: "rgba(255,255,255,1)" }),
});

// SELEÇÃO
const styleSelected = new Style({
    stroke: new Stroke({ color: "#22c55e", width: 3 }),
    fill: new Fill({ color: "rgba(34,197,94,0.12)" }),
});


export default function ParcelamentoIA() {
    const axiosAuth = useAxios();
    const { getOrCreatePlanoForProject } = useParcelamentoApi();

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

        guia: null,
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

    const [projetos, setProjetos] = useState([]);
    const [projetoSel, setProjetoSel] = useState("");
    const [projetoTexto, setProjetoTexto] = useState("");
    const [versoes, setVersoes] = useState([]);
    const [restricaoSel, setRestricaoSel] = useState("");
    const [geo, setGeo] = useState(null);

    // FullScreen
    const [isFullscreen, setIsFullscreen] = useState(false);



    const [planoId, setPlanoId] = useState(null);
    const [selState, setSelState] = useState({
        count: 0,
        kind: null,
        angle: 0,
        frente: "",
        prof: "",
    });

    // FullScreen:
    const toggleFullscreen = () => {
        const el = wrapperRef.current;   // 👈 em vez de containerRef
        if (!el) return;

        if (!isFullscreen) {
            if (el.requestFullscreen) {
                el.requestFullscreen().catch((err) => {
                    console.error("Erro ao entrar em fullscreen:", err);
                });
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch((err) => {
                    console.error("Erro ao sair do fullscreen:", err);
                });
            }
        }
    };


    // ---------------- Init Mapa ----------------
    useEffect(() => {
        if (mapRef.current) return;

        const mkMapboxStyle = (styleId) =>
            new XYZ({
                url: `https://api.mapbox.com/styles/v1/mapbox/${styleId}/tiles/512/{z}/{x}/{y}${hidpi ? "@2x" : ""}?access_token=${token}`,
                tileSize: 512,
                maxZoom: 22,
            });

        const bases = {};
        if (token) {
            bases["mapbox-hibrido"] = new TileLayer({ visible: true, zIndex: 0, source: mkMapboxStyle("satellite-streets-v12") });
            bases["mapbox-ruas"] = new TileLayer({ visible: false, zIndex: 0, source: mkMapboxStyle("streets-v12") });
            bases["mapbox-sat"] = new TileLayer({ visible: false, zIndex: 0, source: mkMapboxStyle("satellite-v9") });
        }
        bases["esri"] = new TileLayer({
            visible: !token,
            zIndex: 0,
            source: new XYZ({ url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" }),
        });
        bases["osm"] = new TileLayer({ visible: false, zIndex: 0, source: new XYZ({ url: "https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png" }) });
        baseLayersRef.current = bases;

        const mkVec = (z, style) => new VectorLayer({ zIndex: z, source: new VectorSource(), style });

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
        L.ofc_quarteiroes = mkVec(615, new Style({ stroke: new Stroke({ color: "#7c3aed", width: 2 }), fill: null }));
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

        // calcadas
        L.calcadas = mkVec(621, styleCalcada);

        // GUIA
        L.guia = new VectorLayer({
            zIndex: 606,
            source: new VectorSource(),
            style: new Style({ stroke: new Stroke({ color: "#f59e0b", width: 2 }) }),
        });

        mapRef.current = new Map({
            target: containerRef.current,
            layers: [...Object.values(bases), ...Object.values(L)],
            view: new View({ center: fromLonLat([-55, -14]), zoom: 4, maxZoom: 22 }),
            controls: defaultControls({ attribution: true }).extend([
                new Zoom(),
                new Rotate(),
                // new FullScreen(),
                new ScaleLine(),
                new MousePosition({
                    coordinateFormat: createStringXY(5),
                    projection: "EPSG:4326",
                    className: "mousepos bg-white/80 px-2 py-1 rounded text-xs",
                }),
                new Attribution(),
            ]),
        });

        // ---- Interações (seleção/edição/desenho) ----
        const recreateInteractions = (mode) => {
            const map = mapRef.current;
            if (!map) return;

            if (selectRef.current) map.removeInteraction(selectRef.current);
            if (modifyRef.current) map.removeInteraction(modifyRef.current);
            if (translateRef.current) map.removeInteraction(translateRef.current);
            if (drawRef.current) {
                map.removeInteraction(drawRef.current);
                drawRef.current = null;
            }
            snapRefs.current.forEach((s) => map.removeInteraction(s));
            snapRefs.current = [];

            // filtro: editar apenas prévias (quarteirões e lotes) + aoi para conveniência
            const Lx = layersRef.current;
            const allowPreview = (lyr) =>
                lyr === Lx.prev_vias_area || lyr === Lx.prev_vias_line || lyr === Lx.prev_quarteiroes || lyr === Lx.prev_lotes;
            const layersFilter = (lyr) => allowPreview(lyr) || lyr === Lx.aoi;

            selectRef.current = new Select({
                condition: clickSelectCondition,
                hitTolerance: 12,
                multi: false,
                layers: layersFilter,
                style: styleSelected, // seleção verde translúcida
            });
            map.addInteraction(selectRef.current);

            // Atualiza selState ao selecionar
            selectRef.current.on("select", (evt) => {
                const f = evt.selected?.[0] || null;
                if (!f) {
                    setSelState({ count: 0, kind: null, angle: 0, frente: "", prof: "" });
                    return;
                }
                const g = f.getGeometry?.();
                const kindGuess = f.get("kind") || (g?.getType?.() === "Polygon" ? "lote" : "quarteirao");

                const angleDegProp = f.get("angle_deg"); // pode ser undefined
                const m = g ? measureFrenteProfAlongAngle(g, angleDegProp) : { frente: 0, prof: 0 };

                setSelState({
                    count: 1,
                    kind: kindGuess,
                    angle: angleDegProp || 0,
                    frente: (m.frente || 0).toFixed(2),
                    prof: (m.prof || 0).toFixed(2),
                });
            });


            // Modify
            modifyRef.current = new Modify({
                features: selectRef.current.getFeatures(),
                pixelTolerance: 10,
                condition: primaryAction,
                insertVertexCondition: altKeyOnly, // Alt+click adiciona vértice
                deleteCondition: platformModifierKeyOnly, // Ctrl/Cmd+click remove vértice
                style: new Style({
                    image: new CircleStyle({ radius: 6, fill: new Fill({ color: "#fff" }), stroke: new Stroke({ color: "#0ea5e9", width: 2 }) }),
                    stroke: new Stroke({ color: "#0ea5e9", width: 2 }),
                }),
            });
            map.addInteraction(modifyRef.current);

            // Translate (Shift para mover tudo)
            translateRef.current = new Translate({
                features: selectRef.current.getFeatures(),
                condition: (e) => !!e.originalEvent?.shiftKey,
            });
            map.addInteraction(translateRef.current);

            // Draw (lotes/quarteiroes)
            if (mode === "lotes" || mode === "quarteiroes") {
                const target = mode === "lotes" ? Lx.prev_lotes : Lx.prev_quarteiroes;
                const draw = new Draw({
                    source: target.getSource(),
                    type: "Polygon",
                    condition: noModifierKeys, // desenha só sem modificadores
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


            // Snap
            [Lx.prev_lotes, Lx.prev_quarteiroes, Lx.aoi, Lx.prev_vias_area, Lx.prev_vias_line, Lx.calcadas]
                .filter(Boolean)
                .forEach((lyr) => {
                    const s = new Snap({ source: lyr.getSource() });
                    map.addInteraction(s);
                    snapRefs.current.push(s);
                });
        };

        mapRef.current.__recreateInteractions = recreateInteractions;
        recreateInteractions("none");

        // Delete/Backspace remove feições selecionadas (fora de inputs)
        const onKeyDownGlobal = (ev) => {
            const tag = (ev.target && ev.target.tagName) ? ev.target.tagName.toLowerCase() : "";
            const typing = tag === "input" || tag === "textarea" || (ev.target && ev.target.isContentEditable);
            if (typing) return;

            const map = mapRef.current;

            // ===== ENTER finaliza desenho atual =====
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

            // ===== ESC / Delete / Backspace: SAIR DO MODO DESENHO (se estiver desenhando) =====
            if (ev.key === "Escape" || ev.key === "Backspace" || ev.key === "Delete") {
                if (drawRef.current && map) {
                    ev.preventDefault();
                    try {
                        // cancela qualquer desenho em andamento
                        drawRef.current.abortDrawing?.();
                    } catch (e) {
                        console.error("[abortDrawing] erro:", e);
                    }

                    // MUITO IMPORTANTE: remover a interação do mapa
                    map.removeInteraction(drawRef.current);
                    drawRef.current = null;

                    // volta para modo normal (sem desenho)
                    setEditTarget("none");
                    return;
                }
            }

            // ===== Delete / Backspace: apagar seleção (quando NÃO está desenhando) =====
            if (ev.key !== "Delete" && ev.key !== "Backspace") return;

            const sel = selectRef.current?.getFeatures?.();
            if (!sel || sel.getLength() === 0) return;
            const L = layersRef.current;
            sel.forEach((f) => {
                [L.prev_lotes.getSource(), L.prev_quarteiroes.getSource(), L.aoi.getSource()].forEach((s) => {
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

    // alterna base
    const [baseSel, setBaseSel] = useState(token ? "mapbox-hibrido" : "esri");
    useEffect(() => {
        const bases = baseLayersRef.current;
        Object.entries(bases).forEach(([k, lyr]) => {
            lyr.setVisible(k === baseSel);
        });
    }, [baseSel]);

    // modo de edição → recria interações
    const [editTarget, setEditTarget] = useState("none"); // none|lotes|quarteiroes
    useEffect(() => {
        mapRef.current?.__recreateInteractions?.(editTarget);
        try { mapRef.current?.renderSync?.(); } catch { }
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

    // ao mudar projeto
    useEffect(() => {
        setVersoes([]); setRestricaoSel(""); setGeo(null); setPlanoId(null);
        setParcelOficial({ vias_area: null, vias: null, quarteiroes: null, lotes: null, calcadas: null });
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
        if (proj) {
            setProjetoTexto(proj.name || `Projeto #${proj.id}`);
        }
    }, [projetoSel, projetos]);


    // abrir versão
    useEffect(() => {
        setGeo(null);
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

    // aplicar camadas e fit
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
                mapRef.current.getView().fit(ext, { padding: [30, 30, 30, 30], maxZoom: 19, duration: 250 });
                setTimeout(() => mapRef.current.getView().fit(ext, { padding: [30, 30, 30, 30], maxZoom: 19, duration: 0 }), 120);
            } catch { }
        }
    }, [geo]);

    // refletir oficiais
    useEffect(() => {
        const L = layersRef.current;
        setLayerData(L.ofc_vias_area, toFC(parcelOficial.vias_area), styleViasArea);
        setLayerData(L.ofc_vias_line, toFC(parcelOficial.vias), styleViasLineWhite);
        setLayerData(L.ofc_quarteiroes, toFC(parcelOficial.quarteiroes), new Style({ stroke: new Stroke({ color: "#7c3aed", width: 2 }), fill: null }));
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
        setLayerData(layersRef.current.calcadas, toFC(parcelOficial.calcadas), styleCalcada);
    }, [parcelOficial]);

    useEffect(() => {
        const handler = () => {
            const el = wrapperRef.current;
            // true se o elemento do mapa for o que está em fullscreen
            setIsFullscreen(!!el && document.fullscreenElement === el);
        };

        document.addEventListener("fullscreenchange", handler);
        return () => {
            document.removeEventListener("fullscreenchange", handler);
        };
    }, []);


    // Params extras enviados para a IA (mask de ruas, eixos, guia)
    const extraParams = useMemo(() => {
        const L = layersRef.current;
        const guideFC = writeLayerAsFC(L.guia);
        return {
            ruas_mask_fc: toFC(geo?.ruas_mask),
            ruas_eixo_fc: toFC(geo?.ruas_eixo),
            ...(guideFC.features?.length ? { guia_linha_fc: guideFC } : {}),
            has_ruas_mask_fc: !!(geo?.ruas_mask?.features?.length),
            has_ruas_eixo_fc: !!(geo?.ruas_eixo?.features?.length),
        };
    }, [geo]);

    // --- callback da prévia IA: usa as mesmas camadas de prévia do Parcelamento.jsx ---
    const handlePreviewFromIa = (data) => {
        const L = layersRef.current;
        setLayerData(L.prev_vias_area, toFC(data?.vias_area), styleViasArea);
        setLayerData(L.prev_vias_line, toFC(data?.vias), styleViasLineWhite);
        setLayerData(
            L.prev_quarteiroes,
            toFC(data?.quarteiroes),
            styleQuartBorda
        );
        setLayerData(L.prev_lotes, toFC(data?.lotes), styleLoteFill);
        setLayerData(L.calcadas, toFC(data?.calcadas), styleCalcada);
    };

    return (
        <div ref={wrapperRef} className="w-full h-full relative">

            {/* Barra superior: escolha de projeto / versão / base */}
            <div className="absolute z-[1000] top-2 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur rounded-xl shadow p-3 flex flex-wrap gap-2 items-center">
                <input
                    list="lista-projetos"
                    className="border p-2 rounded min-w-[260px]"
                    value={projetoTexto}
                    onChange={(e) => {
                        const v = e.target.value;
                        setProjetoTexto(v);

                        // tenta achar um projeto com nome exatamente igual ao texto
                        const proj = projetos.find(
                            (p) => (p.name || `Projeto #${p.id}`) === v
                        );

                        if (proj) {
                            setProjetoSel(proj.id);
                        } else {
                            // se não casar exatamente, ainda não seleciona nada
                            setProjetoSel("");
                        }
                    }}
                    placeholder="Selecione um projeto…"
                />

                <datalist id="lista-projetos">
                    {projetos.map((p) => (
                        <option
                            key={p.id}
                            value={p.name || `Projeto #${p.id}`}
                        />
                    ))}
                </datalist>


                <select
                    className="border p-2 rounded min-w-[260px]"
                    value={restricaoSel || ""}
                    onChange={(e) =>
                        setRestricaoSel(Number(e.target.value) || "")
                    }
                    disabled={!versoes.length}
                >
                    <option value="">
                        {versoes.length
                            ? "Selecione uma versão…"
                            : "Sem versões"}
                    </option>
                    {versoes.map((v) => (
                        <option key={v.id} value={v.id}>
                            v{v.version}{" "}
                            {v.label ? `— ${v.label}` : ""}{" "}
                            {v.is_active ? "(ativa)" : ""}
                        </option>
                    ))}
                </select>

                <select
                    className="border p-2 rounded"
                    value={baseSel}
                    onChange={(e) => setBaseSel(e.target.value)}
                    title="Mapa base"
                >
                    {token && (
                        <option value="mapbox-hibrido">Mapbox Híbrido</option>
                    )}
                    {token && (
                        <option value="mapbox-ruas">Mapbox Ruas</option>
                    )}
                    {token && (
                        <option value="mapbox-sat">Mapbox Satélite</option>
                    )}
                    <option value="esri">Esri World Imagery</option>
                    <option value="osm">OSM (Ruas)</option>
                </select>
            </div>


            {/* Botão de Fullscreen (Lucide) */}
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

            {/* Painel IA */}
            <div className="absolute z-[1000] top-30 left-2 bg-white/90 backdrop-blur rounded-xl shadow p-3 w-[420px]">
                <h3 className="font-semibold mb-2">
                    Parcelamento com IA (Prévia)
                </h3>
                <ParcelamentoIAPanel
                    planoId={planoId}
                    alFeature={
                        geo?.area_loteavel?.features?.[0] ||
                        (geo?.aoi && {
                            type: "Feature",
                            geometry: geo?.aoi,
                            properties: {},
                        })
                    }
                    extraParams={extraParams}
                    onPreviewIa={handlePreviewFromIa}
                    onSetParamsFromIa={() => { }}
                />
                <div className="text-[11px] text-gray-600 mt-2 leading-5">
                    Este painel usa a IA apenas para sugerir parâmetros e
                    organizar a malha, mas toda a geometria exata continua sendo
                    calculada pelo backend (Shapely/PostGIS).
                    <br />
                    Você pode editar a prévia desenhada no mapa normalmente.
                </div>
            </div>

            {/* Mapa */}
            <div
                ref={containerRef}
                style={{ height: "100vh", width: "100%" }}
            />
        </div>
    );
}
